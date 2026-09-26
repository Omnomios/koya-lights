export const DEVICES = [
  {id: 'light1', ip: '192.168.20.117'},
  {id: 'light2', ip: '192.168.20.85'},
  {id: 'light3', ip: '192.168.20.68'},
];

export const POLL_MS = 2000;
// Module/http runs on one worker with a ~10s connect timeout, so probing a
// dead host blocks every other request. Offline lights are rechecked slowly.
export const OFFLINE_PROBE_MS = 15000;
// Header + separator + fixed 3-row presets strip + device panels.
export const WINDOW_SIZE = {x: 1024, y: 628};
