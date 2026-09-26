import * as Log from 'Helix/Log';

// Serialises async renders and collapses bursts (from deepfield).
export function createRenderQueue (render, label) {
  let running = false;
  let pending = false;
  let pendingValue = null;

  return function request (value = null) {
    pendingValue = value;
    pending = true;
    if (running) return Promise.resolve();
    running = true;
    return (async () => {
      try {
        while (pending) {
          const next = pendingValue;
          pending = false;
          pendingValue = null;
          try {
            await render(next);
          } catch (error) {
            Log.error(`[shellyHub] ${label} render failed: ${error}`);
          }
        }
      } finally {
        running = false;
      }
    })();
  };
}
