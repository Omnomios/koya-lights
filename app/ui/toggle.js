import * as UI from 'Helix/UserInterface';
import {THEME} from '../theme.js';
import {cursorEnter, cursorExit} from './cursor.js';
import {play, pressPop, scaleTo, transformHost} from './juice.js';

const HOVER_SCALE = 1.06;

// Pill switch. Visual only: the caller owns the state and reports it back
// through setOn, so a failed request never leaves the switch lying.
export async function createToggle (win, parentId, {width = 44, height = 24, onClick}) {
  const knobSize = height - 6;
  const travel = width - knobSize - 6;
  const shellId = await UI.createElement(win, {
    item: {size: {x: width, y: height}},
    renderable: transformHost(width, height),
    layout: {type: 'none'},
  });
  await UI.attach(win, parentId, shellId);
  await UI.setHitTarget(win, shellId, true);

  const trackId = await UI.createElement(win, {
    item: {size: {x: width, y: height}},
    renderable: {
      type: 'box',
      aabb: {min: {x: 0, y: 0}, max: {x: width, y: height}},
      colour: THEME.toggleOff,
      cornerRadius: height / 2,
    },
  });
  await UI.attach(win, shellId, trackId);
  await UI.setHitTarget(win, trackId, false);

  const borderId = await UI.createElement(win, {
    item: {size: {x: width, y: height}},
    renderable: {
      type: 'box',
      aabb: {min: {x: 0, y: 0}, max: {x: width, y: height}},
      colour: THEME.borderStrong,
      inset: 1,
      cornerRadius: height / 2,
    },
  });
  await UI.attach(win, shellId, borderId);
  await UI.setHitTarget(win, borderId, false);

  // The knob stays laid out at the left; its travel is an animated offset.
  const knobId = await UI.createElement(win, {
    item: {position: {x: 3, y: 3}, size: {x: knobSize, y: knobSize}},
    renderable: {
      type: 'circle',
      aabb: {min: {x: 0, y: 0}, max: {x: knobSize, y: knobSize}},
      colour: THEME.knobOff,
      origin: {x: 0.5, y: 0.5},
    },
  });
  await UI.attach(win, shellId, knobId);
  await UI.setHitTarget(win, knobId, false);

  let hovered = false;
  let state = null;

  await UI.setOnMouseDown(win, shellId, () => {
    pressPop(win, shellId, {rest: hovered ? HOVER_SCALE : 1, squash: 0.88, overshoot: 1.1});
    if (typeof onClick === 'function') onClick();
  });
  await UI.setOnMouseEnter(win, shellId, () => {
    hovered = true;
    cursorEnter(win, shellId);
    scaleTo(win, shellId, HOVER_SCALE);
  });
  await UI.setOnMouseExit(win, shellId, () => {
    hovered = false;
    cursorExit(win, shellId);
    scaleTo(win, shellId, 1, 0.2);
  });

  function slideKnob (on) {
    const target = on ? travel : 0;
    const overshoot = target + (on ? 3 : -3);
    return play(win, knobId, [
      {time: 0.1, position: {x: overshoot, y: 0}, scale: {x: 1.3, y: 0.8}, ease: 'outCubic'},
      {time: 0.26, position: {x: target, y: 0}, scale: {x: 1, y: 1}, ease: 'outQuad'},
    ]);
  }

  async function setOn (on, colour = THEME.accent) {
    const [r, g, b] = colour;
    const changed = state !== on;
    state = on;
    await Promise.all([
      UI.setBoxColour(win, trackId, on ? [r * 0.28, g * 0.28, b * 0.28, 1] : THEME.toggleOff),
      UI.setBoxColour(win, borderId, on ? colour : THEME.borderStrong),
      UI.setCircleColour(win, knobId, on ? THEME.sliderThumb : THEME.knobOff),
    ]);
    if (changed) await slideKnob(on);
  }

  return {shellId, setOn};
}
