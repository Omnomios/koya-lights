import * as Log from 'Helix/Log';
import {DEVICES, OFFLINE_PROBE_MS} from './config.js';
import {createPresetStore} from './presets.js';
import {createSession} from './shelly/session.js';

function defaultState () {
  return {
    online: false,
    wsConnected: false,
    on: false,
    rgb: [255, 255, 255],
    brightness: 100,
    white: 0,
    apower: 0,
    error: null,
    contacted: false,
    // 0 = due immediately. After a failure, set to a future ms.
    nextProbeAt: 0,
  };
}

export function createStore () {
  const devices = new Map();
  const sessions = new Map();
  for (const device of DEVICES) {
    devices.set(device.id, {
      ...device,
      label: device.label || device.ip,
      ...defaultState(),
      dragging: false,
      colourModalOpen: false,
    });
  }

  const listeners = new Set();
  let offlineProbeInFlight = false;
  let lastControlAt = 0;
  const presetStore = createPresetStore({
    listDevices: () => list(),
    onChange: () => notify(),
  });
  // Fire-and-forget; UI reads listPresets() after load settles via notify.
  presetStore.load().catch((error) => Log.error(`[shellyHub] preset load failed: ${error}`));

  function get (id) {
    return devices.get(id);
  }

  function list () {
    return DEVICES.map((d) => devices.get(d.id));
  }

  function notify () {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        Log.error(`[shellyHub] store listener failed: ${error}`);
      }
    }
  }

  function subscribe (listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function patch (id, fields) {
    const device = devices.get(id);
    if (!device) return;
    Object.assign(device, fields);
    notify();
  }

  function isLocked (id) {
    const device = devices.get(id);
    return !!(device && (device.dragging || device.colourModalOpen));
  }

  function anyInteractionLock () {
    for (const device of devices.values()) {
      if (device.dragging || device.colourModalOpen) return true;
    }
    return false;
  }

  function noteControl () {
    lastControlAt = Date.now();
  }

  function markOffline (device, error) {
    device.online = false;
    device.contacted = true;
    device.error = String(error);
    device.nextProbeAt = Date.now() + OFFLINE_PROBE_MS;
  }

  function markOnline (device) {
    device.online = true;
    device.contacted = true;
    device.error = null;
    device.nextProbeAt = 0;
  }

  function applyStatus (id, status) {
    const device = devices.get(id);
    if (!device || !status) return;
    if (isLocked(id)) {
      // Keep power readings while the user is dragging / picking colour.
      if (Number.isFinite(status.apower)) {
        device.apower = status.apower;
        notify();
      }
      return;
    }
    markOnline(device);
    Object.assign(device, {
      on: status.on,
      rgb: status.rgb,
      brightness: status.brightness,
      white: status.white,
      apower: status.apower,
    });
    notify();
  }

  function applyIdentity (id, identity) {
    const device = devices.get(id);
    if (!device || !identity?.label) return;
    if (device.label === identity.label) return;
    device.label = identity.label;
    notify();
  }

  function sessionFor (id) {
    return sessions.get(id) || null;
  }

  for (const d of DEVICES) {
    const id = d.id;
    const session = createSession(d.ip, {
      onStatus: (status) => applyStatus(id, status),
      onIdentity: (identity) => applyIdentity(id, identity),
      onOpen: () => {
        const device = devices.get(id);
        if (!device) return;
        device.wsConnected = true;
        notify();
      },
      onClose: () => {
        const device = devices.get(id);
        if (!device) return;
        device.wsConnected = false;
        // Soft down: leave online true until an HTTP probe fails, so a brief
        // reconnect does not flicker the UI. Schedule a prompt HTTP check.
        device.nextProbeAt = Date.now();
        notify();
      },
    });
    sessions.set(id, session);
    session.start();
  }

  async function refreshOne (id) {
    const device = devices.get(id);
    const session = sessionFor(id);
    if (!device || !session) return;
    if (isLocked(id)) return;
    try {
      const status = await session.getStatus();
      if (isLocked(id)) return;
      applyStatus(id, status);
      session.getIdentity().catch(() => {});
    } catch (error) {
      if (isLocked(id)) return;
      markOffline(device, error);
      notify();
      Log.error(`[shellyHub] refresh ${device.ip} failed: ${error}`);
    }
  }

  // Prefer the inbound socket. Wait briefly for it before spending ~10s on HTTP.
  async function discoverOne (id) {
    const device = devices.get(id);
    const session = sessionFor(id);
    if (!device || !session) return;
    const deadline = Date.now() + 2000;
    while (!session.isOpen && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (session.isOpen) {
      try {
        await session.getStatus();
        return;
      } catch (error) {
        Log.warn(`[shellyHub] ws discover ${device.ip} failed: ${error}`);
      }
    }
    // Offline / slow hosts must not block app startup — probe in the background.
    refreshOne(id).catch(() => {});
  }

  async function refreshAll () {
    const now = Date.now();
    const live = [];
    const unseen = [];
    const offlineDue = [];

    for (const d of DEVICES) {
      const device = devices.get(d.id);
      if (!device || isLocked(d.id)) continue;
      if (device.wsConnected) {
        live.push(d.id);
      } else if (!device.contacted) {
        unseen.push(d.id);
      } else if (device.online) {
        live.push(d.id);
      } else if (now >= (device.nextProbeAt || 0)) {
        offlineDue.push(d.id);
      }
    }

    if (unseen.length > 0) {
      await Promise.all(unseen.map((id) => discoverOne(id)));
      return;
    }

    // Live sockets are independent; fire and forget so one hang can't stall the rest.
    for (const id of live) {
      const session = sessionFor(id);
      if (session?.isOpen) {
        session.getStatus().catch(() => {});
      } else {
        refreshOne(id).catch(() => {});
      }
    }

    const quiet = !anyInteractionLock() && (now - lastControlAt) > 1500;
    if (quiet && !offlineProbeInFlight && offlineDue.length > 0) {
      offlineProbeInFlight = true;
      refreshOne(offlineDue[0]).finally(() => {
        offlineProbeInFlight = false;
      });
    }
  }

  async function applyOne (id, fields) {
    const device = devices.get(id);
    const session = sessionFor(id);
    if (!device || !session) return;
    noteControl();
    if (typeof fields.on === 'boolean') device.on = fields.on;
    if (Array.isArray(fields.rgb)) device.rgb = fields.rgb.slice(0, 3);
    if (Number.isFinite(Number(fields.brightness))) device.brightness = Number(fields.brightness);
    if (Number.isFinite(Number(fields.white))) device.white = Number(fields.white);
    notify();
    // Skip known-dead hosts unless the socket just came back.
    if (!device.online && !device.wsConnected) return;
    try {
      await session.setRgbw(fields);
      markOnline(device);
      notify();
    } catch (error) {
      markOffline(device, error);
      notify();
      Log.error(`[shellyHub] set ${device.ip} failed: ${error}`);
    }
  }

  async function applyAll (fields) {
    noteControl();
    const targets = DEVICES.filter((d) => {
      const device = devices.get(d.id);
      return device && (device.online || device.wsConnected);
    });
    await Promise.all(targets.map((d) => applyOne(d.id, fields)));
  }

  async function applyPreset (id) {
    const preset = presetStore.get(id);
    if (!preset) return;
    noteControl();
    const jobs = [];
    for (const [deviceId, fields] of Object.entries(preset.lights)) {
      if (!devices.has(deviceId)) continue;
      jobs.push(applyOne(deviceId, {
        on: fields.on,
        rgb: fields.rgb.slice(),
        brightness: fields.brightness,
        white: fields.white,
      }));
    }
    await Promise.all(jobs);
  }

  function listPresets () {
    return presetStore.list();
  }

  function capturePreset (name) {
    return presetStore.capture(name);
  }

  function renamePreset (id, name) {
    return presetStore.rename(id, name);
  }

  function removePreset (id) {
    return presetStore.remove(id);
  }

  function setDragging (id, dragging) {
    const device = devices.get(id);
    if (!device) return;
    device.dragging = !!dragging;
    if (dragging) noteControl();
  }

  async function toggleOne (id) {
    const device = devices.get(id);
    const session = sessionFor(id);
    if (!device || !session) return;
    noteControl();
    device.on = !device.on;
    notify();
    if (!device.online && !device.wsConnected) return;
    try {
      await session.toggle();
      markOnline(device);
      notify();
    } catch (error) {
      markOffline(device, error);
      notify();
      Log.error(`[shellyHub] toggle ${device.ip} failed: ${error}`);
    }
  }

  function setColourModalOpen (id, open) {
    if (id === 'all') {
      for (const device of devices.values()) {
        device.colourModalOpen = !!open;
      }
      if (open) noteControl();
      return;
    }
    const device = devices.get(id);
    if (!device) return;
    device.colourModalOpen = !!open;
    if (open) noteControl();
  }

  function stop () {
    for (const session of sessions.values()) session.stop();
    sessions.clear();
  }

  return {
    get,
    list,
    subscribe,
    patch,
    refreshOne,
    refreshAll,
    applyOne,
    applyAll,
    applyPreset,
    listPresets,
    capturePreset,
    renamePreset,
    removePreset,
    toggleOne,
    setDragging,
    setColourModalOpen,
    stop,
  };
}
