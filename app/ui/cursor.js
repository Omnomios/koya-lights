import * as Compositor from 'Koya/Compositor';
import {setHover} from './input.js';

// The cursor is per window, and enter/exit between adjacent controls can
// arrive in either order, so only the element that set a shape may clear it.
let owner = null;

async function apply (win, shape) {
  try { await Compositor.setCursor(win, shape); } catch (_error) { /* missing cursor theme */ }
}

export function cursorEnter (win, id, shape = 'pointer') {
  owner = id;
  return apply(win, shape);
}

export function cursorExit (win, id) {
  if (owner !== id) return Promise.resolve();
  owner = null;
  return apply(win, 'default');
}

// Controls hidden under the pointer never receive an exit.
export function resetCursor (win) {
  owner = null;
  return apply(win, 'default');
}

// For elements with no other hover handlers.
export async function useCursor (win, id, shape = 'pointer') {
  await setHover(win, id, () => { cursorEnter(win, id, shape); }, () => { cursorExit(win, id); });
}
