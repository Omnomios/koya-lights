import * as Log from 'Helix/Log';
import * as WS from 'Module/ws';
import {
  buildSetPayload,
  extractRgbwFromNotify,
  getIdentity as httpGetIdentity,
  getStatus as httpGetStatus,
  parseRgbwStatus,
  pickDeviceLabel,
  setRgbw as httpSetRgbw,
  toggle as httpToggle,
} from './client.js';

const SRC = 'shellyhub';
const CALL_TIMEOUT_MS = 4000;

// One inbound socket per light: ws://ip/rpc. Commands prefer the socket and
// fall back to HTTP when it is down or a call times out.
export function createSession (ip, {
  onStatus,
  onIdentity,
  onOpen,
  onClose,
} = {}) {
  let sock = null;
  let open = false;
  let nextId = 1;
  let destroyed = false;
  const pending = new Map();
  let lastStatus = null;
  let identityTimer = null;

  function clearPending (error) {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  }

  function scheduleIdentityRefresh () {
    if (identityTimer) clearTimeout(identityTimer);
    identityTimer = setTimeout(() => {
      identityTimer = null;
      fetchIdentity().catch((error) => {
        Log.warn(`[shellyHub] ws ${ip} identity refresh failed: ${error}`);
      });
    }, 150);
  }

  function deliverStatus (status) {
    if (!status) return;
    lastStatus = status;
    if (typeof onStatus === 'function') onStatus(status);
  }

  function handleMessage (raw) {
    let msg = null;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch (error) {
      Log.error(`[shellyHub] ws ${ip} bad json: ${error}`);
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.method === 'NotifyStatus' || msg.method === 'NotifyFullStatus') {
      const rgbw = extractRgbwFromNotify(msg.params, lastStatus);
      if (rgbw) deliverStatus(rgbw);
      // Name lives in config, not status — but cfg_rev bumps when it changes.
      if (msg.params && msg.params.sys && Object.prototype.hasOwnProperty.call(msg.params.sys, 'cfg_rev')) {
        scheduleIdentityRefresh();
      }
      return;
    }

    if (msg.method === 'NotifyEvent') {
      const events = Array.isArray(msg.params?.events) ? msg.params.events : [];
      if (events.some((event) => event && event.event === 'config_changed')) {
        scheduleIdentityRefresh();
      }
      return;
    }

    if (msg.id == null || !pending.has(msg.id)) return;
    const entry = pending.get(msg.id);
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    if (msg.error) {
      entry.reject(new Error(msg.error.message || `RPC error ${msg.error.code}`));
      return;
    }
    if (entry.expectStatus) {
      deliverStatus(parseRgbwStatus(msg.result, lastStatus));
    }
    entry.resolve(msg.result);
  }

  function call (method, params, {expectStatus = false, timeoutMs = CALL_TIMEOUT_MS} = {}) {
    if (!open || !sock) return Promise.reject(new Error('ws not connected'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`ws timeout ${method}`));
      }, timeoutMs);
      pending.set(id, {resolve, reject, timer, expectStatus});
      try {
        const frame = {id, src: SRC, method};
        if (params !== undefined) frame.params = params;
        sock.send(JSON.stringify(frame));
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  async function withFallback (wsOp, httpOp) {
    if (open) {
      try {
        return await wsOp();
      } catch (error) {
        Log.warn(`[shellyHub] ws ${ip} fallback to http: ${error}`);
      }
    }
    return httpOp();
  }

  async function fetchIdentity () {
    const identity = await withFallback(async () => {
      const [sys, channel, info] = await Promise.all([
        call('Sys.GetConfig'),
        call('RGBW.GetConfig', {id: 0}),
        call('Shelly.GetDeviceInfo'),
      ]);
      return {
        label: pickDeviceLabel({
          deviceName: sys?.device?.name,
          channelName: channel?.name,
          infoName: info?.name,
          infoId: info?.id,
          fallback: ip,
        }),
        deviceName: typeof sys?.device?.name === 'string' ? sys.device.name : null,
        channelName: typeof channel?.name === 'string' ? channel.name : null,
        infoId: typeof info?.id === 'string' ? info.id : null,
      };
    }, () => httpGetIdentity(ip));
    if (typeof onIdentity === 'function') onIdentity(identity);
    return identity;
  }

  function start () {
    if (destroyed || sock) return;
    sock = WS.create({
      url: `ws://${ip}/rpc`,
      onOpen: () => {
        open = true;
        if (typeof onOpen === 'function') onOpen();
        // First framed request with src unlocks NotifyStatus from the device.
        call('RGBW.GetStatus', {id: 0}, {expectStatus: true}).catch((error) => {
          Log.error(`[shellyHub] ws ${ip} GetStatus failed: ${error}`);
        });
        fetchIdentity().catch((error) => {
          Log.warn(`[shellyHub] ws ${ip} identity failed: ${error}`);
        });
      },
      onMessage: handleMessage,
      onClose: () => {
        open = false;
        clearPending(new Error('ws closed'));
        if (typeof onClose === 'function') onClose();
      },
      onError: (reason) => {
        Log.error(`[shellyHub] ws ${ip} error: ${reason}`);
      },
    });
    sock.setAutoReconnect(true);
    sock.start();
  }

  function stop () {
    destroyed = true;
    open = false;
    if (identityTimer) {
      clearTimeout(identityTimer);
      identityTimer = null;
    }
    clearPending(new Error('ws stopped'));
    if (!sock) return;
    try { sock.setAutoReconnect(false); } catch (_) {}
    try { sock.close(); } catch (_) {}
    try { sock.destroy(); } catch (_) {}
    sock = null;
  }

  return {
    get isOpen () { return open; },
    start,
    stop,
    getStatus: () => withFallback(
      () => call('RGBW.GetStatus', {id: 0}, {expectStatus: true}).then(() => lastStatus),
      () => httpGetStatus(ip).then((status) => {
        deliverStatus(status);
        return status;
      }),
    ),
    getIdentity: () => fetchIdentity(),
    setRgbw: (fields) => withFallback(
      () => call('RGBW.Set', buildSetPayload(fields)),
      () => httpSetRgbw(ip, fields),
    ),
    toggle: () => withFallback(
      () => call('RGBW.Toggle', {id: 0}),
      () => httpToggle(ip),
    ),
  };
}
