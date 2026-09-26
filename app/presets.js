import * as Log from 'Helix/Log';
import * as Process from 'Module/process';

const VERSION = 1;

function configDir () {
  const home = Process.getEnv('HOME', '');
  if (!home) return null;
  return `${home.replace(/\/+$/, '')}/.config/shellyhub`;
}

function presetsPath () {
  const dir = configDir();
  return dir ? `${dir}/presets.json` : null;
}

function snapshotLights (devices) {
  const lights = {};
  for (const device of devices) {
    lights[device.id] = {
      on: device.on === true,
      rgb: Array.isArray(device.rgb) ? device.rgb.slice(0, 3).map((c) => Math.round(Number(c) || 0)) : [255, 255, 255],
      brightness: Math.max(0, Math.min(100, Math.round(Number(device.brightness) || 0))),
      white: Math.max(0, Math.min(255, Math.round(Number(device.white) || 0))),
    };
  }
  return lights;
}

function normalisePreset (raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : `p_${Date.now()}_${index}`;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `Preset ${index + 1}`;
  const lights = {};
  const source = raw.lights && typeof raw.lights === 'object' ? raw.lights : {};
  for (const [deviceId, fields] of Object.entries(source)) {
    if (!fields || typeof fields !== 'object') continue;
    lights[deviceId] = {
      on: fields.on === true,
      rgb: Array.isArray(fields.rgb) ? fields.rgb.slice(0, 3).map((c) => Math.round(Number(c) || 0)) : [255, 255, 255],
      brightness: Math.max(0, Math.min(100, Math.round(Number(fields.brightness) || 0))),
      white: Math.max(0, Math.min(255, Math.round(Number(fields.white) || 0))),
    };
  }
  return {id, name, lights};
}

async function readTextFile (path) {
  if (!Process.exists(path)) return null;
  const quoted = String(path).replace(/'/g, `'\\''`);
  try {
    const result = await Process.exec(`cat -- '${quoted}'`);
    return String(result?.stdout ?? '');
  } catch (error) {
    Log.error(`[shellyHub] read presets failed: ${error}`);
    return null;
  }
}

function writeTextFile (path, text) {
  return Process.writeFileText(path, text) === true;
}

export function createPresetStore ({listDevices, onChange} = {}) {
  let presets = [];

  function emit () {
    if (typeof onChange === 'function') onChange();
  }

  function persist () {
    const path = presetsPath();
    const dir = configDir();
    if (!path || !dir) {
      Log.warn('[shellyHub] cannot persist presets (no HOME)');
      return false;
    }
    try {
      if (!Process.exists(dir)) Process.mkdir(dir);
      const ok = writeTextFile(path, JSON.stringify({version: VERSION, presets}, null, 2) + '\n');
      if (!ok) Log.error('[shellyHub] writing presets failed');
      return ok;
    } catch (error) {
      Log.error(`[shellyHub] persist presets failed: ${error}`);
      return false;
    }
  }

  async function load () {
    const path = presetsPath();
    if (!path) return;
    const text = await readTextFile(path);
    if (!text) return;
    try {
      const data = JSON.parse(text);
      const list = Array.isArray(data?.presets) ? data.presets : [];
      presets = list.map((item, index) => normalisePreset(item, index)).filter(Boolean);
      emit();
    } catch (error) {
      Log.error(`[shellyHub] parse presets failed: ${error}`);
    }
  }

  function list () {
    return presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      lights: Object.fromEntries(
        Object.entries(preset.lights).map(([id, fields]) => [id, {
          on: fields.on,
          rgb: fields.rgb.slice(),
          brightness: fields.brightness,
          white: fields.white,
        }]),
      ),
    }));
  }

  function get (id) {
    return list().find((preset) => preset.id === id) || null;
  }

  function capture (name) {
    const devices = typeof listDevices === 'function' ? listDevices() : [];
    const preset = {
      id: `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`,
      name: (typeof name === 'string' && name.trim()) ? name.trim() : `Preset ${presets.length + 1}`,
      lights: snapshotLights(devices),
    };
    presets = [...presets, preset];
    persist();
    emit();
    return get(preset.id);
  }

  function rename (id, name) {
    const next = typeof name === 'string' ? name.trim() : '';
    if (!next) return null;
    const index = presets.findIndex((preset) => preset.id === id);
    if (index < 0) return null;
    if (presets[index].name === next) return get(id);
    presets = presets.map((preset, i) => (i === index ? {...preset, name: next} : preset));
    persist();
    emit();
    return get(id);
  }

  function remove (id) {
    const before = presets.length;
    presets = presets.filter((preset) => preset.id !== id);
    if (presets.length === before) return false;
    persist();
    emit();
    return true;
  }

  return {load, list, get, capture, rename, remove};
}
