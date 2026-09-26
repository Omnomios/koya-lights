import * as Http from 'Module/http';
import * as Log from 'Helix/Log';

function rpcUrl (ip, method, query = '') {
  const q = query ? `?${query}` : '';
  return `http://${ip}/rpc/${method}${q}`;
}

function parseJsonBody (body) {
  if (typeof body !== 'string' || body.length === 0) return null;
  try {
    return JSON.parse(body);
  } catch (error) {
    Log.error(`[shellyHub] JSON parse failed: ${error}`);
    return null;
  }
}

export function buildSetPayload ({on, rgb, brightness, white} = {}) {
  const payload = {id: 0};
  if (typeof on === 'boolean') payload.on = on;
  if (Array.isArray(rgb) && rgb.length >= 3) {
    payload.rgb = [
      Math.max(0, Math.min(255, Math.round(rgb[0]))),
      Math.max(0, Math.min(255, Math.round(rgb[1]))),
      Math.max(0, Math.min(255, Math.round(rgb[2]))),
    ];
  }
  if (Number.isFinite(Number(brightness))) {
    payload.brightness = Math.max(0, Math.min(100, Math.round(Number(brightness))));
  }
  if (Number.isFinite(Number(white))) {
    payload.white = Math.max(0, Math.min(255, Math.round(Number(white))));
  }
  return payload;
}

// Accepts RGBW.GetStatus result or a NotifyStatus `rgbw:0` / `light:0` delta.
export function parseRgbwStatus (data, previous = null) {
  if (!data || typeof data !== 'object') return null;
  const base = previous || {
    on: false,
    rgb: [255, 255, 255],
    brightness: 100,
    white: 0,
    apower: 0,
  };
  const rgbSrc = Array.isArray(data.rgb) ? data.rgb : base.rgb;
  const rgb = [
    Number(rgbSrc[0]) || 0,
    Number(rgbSrc[1]) || 0,
    Number(rgbSrc[2]) || 0,
  ];
  return {
    on: typeof data.output === 'boolean' ? data.output : base.on,
    rgb,
    brightness: Number.isFinite(Number(data.brightness)) ? Number(data.brightness) : base.brightness,
    white: Number.isFinite(Number(data.white)) ? Number(data.white) : base.white,
    apower: Number.isFinite(Number(data.apower)) ? Number(data.apower) : base.apower,
  };
}

export function extractRgbwFromNotify (params, previous = null) {
  if (!params || typeof params !== 'object') return null;
  const block = params['rgbw:0'] || params['light:0'] || params['rgb:0'] || null;
  if (!block || typeof block !== 'object') return null;
  return parseRgbwStatus(block, previous);
}

export async function getStatus (ip) {
  const res = await Http.request({
    url: rpcUrl(ip, 'RGBW.GetStatus', 'id=0'),
    method: 'GET',
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`GetStatus HTTP ${res.status}`);
  }
  const data = parseJsonBody(res.body);
  const status = parseRgbwStatus(data);
  if (!status) throw new Error('GetStatus empty body');
  return status;
}

function firstNonEmpty (...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

// Prefer the user-facing name from Sys / RGBW config; fall back to a short id.
export function pickDeviceLabel ({deviceName, channelName, infoName, infoId, fallback} = {}) {
  const named = firstNonEmpty(deviceName, channelName, infoName);
  if (named) return named;
  if (typeof infoId === 'string' && infoId.trim()) {
    const short = infoId.trim().replace(/^shelly[a-z0-9]*-/i, '');
    return (short.length > 0 ? short : infoId).toUpperCase();
  }
  return firstNonEmpty(fallback) || 'Shelly';
}

export async function getIdentity (ip) {
  const safe = async (method, query = '') => {
    try {
      const res = await Http.request({url: rpcUrl(ip, method, query), method: 'GET'});
      if (res.status < 200 || res.status >= 300) return null;
      return parseJsonBody(res.body);
    } catch (_) {
      return null;
    }
  };
  const [sys, channel, info] = await Promise.all([
    safe('Sys.GetConfig'),
    safe('RGBW.GetConfig', 'id=0'),
    safe('Shelly.GetDeviceInfo'),
  ]);
  const label = pickDeviceLabel({
    deviceName: sys?.device?.name,
    channelName: channel?.name,
    infoName: info?.name,
    infoId: info?.id,
    fallback: ip,
  });
  return {
    label,
    deviceName: firstNonEmpty(sys?.device?.name),
    channelName: firstNonEmpty(channel?.name),
    infoId: firstNonEmpty(info?.id),
  };
}

export async function setRgbw (ip, fields = {}) {
  const payload = buildSetPayload(fields);
  const res = await Http.request({
    url: rpcUrl(ip, 'RGBW.Set'),
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Set HTTP ${res.status}`);
  }
  return true;
}

export async function toggle (ip) {
  const res = await Http.request({
    url: rpcUrl(ip, 'RGBW.Toggle'),
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({id: 0}),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Toggle HTTP ${res.status}`);
  }
  return true;
}
