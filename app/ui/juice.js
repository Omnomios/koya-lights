import * as UI from 'Helix/UserInterface';

// Koya runs one animation per element, so every effect on an element reuses a
// single clip. Frames without a `time: 0` key blend from the current pose,
// which lets a new effect interrupt the last one without snapping.
const clips = new Map();

export function play (win, id, frames) {
  const key = `${win}:${id}`;
  const pending = clips.get(key);
  const next = (async () => {
    const anim = pending === undefined ? undefined : await pending;
    if (anim === undefined) {
      const created = await UI.addAnimation(win, id, frames);
      await UI.startAnimation(win, id, created);
      return created;
    }
    await UI.updateAnimation(win, id, anim, frames);
    await UI.startAnimation(win, id, anim);
    return anim;
  })();
  clips.set(key, next.catch(() => pending));
  return next.catch(() => {});
}

export function centrePivot (win, id) {
  return UI.setOrigin(win, id, {x: 0.5, y: 0.5}).catch(() => {});
}

// Invisible renderable so a layout container can carry a centred transform
// for its children; bare containers ignore their pivot.
export function transformHost (width, height) {
  return {
    type: 'box',
    aabb: {min: {x: 0, y: 0}, max: {x: width, y: height}},
    colour: [0, 0, 0, 0],
    origin: {x: 0.5, y: 0.5},
  };
}

export function scaleTo (win, id, s, duration = 0.16) {
  return play(win, id, [{time: duration, scale: {x: s, y: s}, ease: 'outCubic'}]);
}

// Squash, overshoot, settle. `rest` lets a hovered control land back on its
// hover scale.
export function pressPop (win, id, {rest = 1, squash = 0.9, overshoot = 1.07} = {}) {
  return play(win, id, [
    {time: 0.06, scale: {x: squash, y: squash}, ease: 'outQuad'},
    {time: 0.2, scale: {x: overshoot, y: overshoot}, ease: 'outCubic'},
    {time: 0.34, scale: {x: rest, y: rest}, ease: 'inOutQuad'},
  ]);
}

export function punch (win, id, amount = 1.18) {
  return play(win, id, [
    {time: 0.08, scale: {x: amount, y: amount}, ease: 'outQuad'},
    {time: 0.36, scale: {x: 1, y: 1}, ease: 'outCubic'},
  ]);
}

export function hide (win, id) {
  return play(win, id, [{time: 0.001, opacity: 0, position: {x: 0, y: 18}}]);
}

export function rise (win, id, delay = 0, {distance = 18} = {}) {
  return play(win, id, [
    {time: 0, opacity: 0, position: {x: 0, y: distance}},
    {time: delay, opacity: 0, position: {x: 0, y: distance}},
    {time: delay + 0.42, opacity: 1, position: {x: 0, y: -3}, ease: 'outCubic'},
    {time: delay + 0.6, opacity: 1, position: {x: 0, y: 0}, ease: 'inOutQuad'},
  ]);
}

export function breathe (win, id) {
  return play(win, id, [
    {time: 0, scale: {x: 1, y: 1}, opacity: 1},
    {time: 1.2, scale: {x: 1.35, y: 1.35}, opacity: 0.55, ease: 'inOutQuad'},
    {time: 2.4, scale: {x: 1, y: 1}, opacity: 1, ease: 'inOutQuad', looping: true},
  ]);
}

export function settle (win, id) {
  return play(win, id, [{time: 0.2, scale: {x: 1, y: 1}, opacity: 1, ease: 'outCubic'}]);
}

// Two rings that expand and fade from a disc's edge, recoloured per shot.
export async function createShockwave (win, parentId, {x, y, size, reach = 1.9}) {
  const rings = [];
  for (const inset of [4, 2]) {
    const id = await UI.createElement(win, {
      item: {position: {x, y}, size: {x: size, y: size}},
      renderable: {
        type: 'circle',
        aabb: {min: {x: 0, y: 0}, max: {x: size, y: size}},
        colour: [1, 1, 1, 1],
        inset,
        origin: {x: 0.5, y: 0.5},
      },
    });
    await UI.attach(win, parentId, id);
    await UI.setHitTarget(win, id, false);
    await play(win, id, [{time: 0.001, opacity: 0}]);
    rings.push(id);
  }
  const [lead, trail] = rings;

  return async function fire (colour) {
    const c = [colour[0], colour[1], colour[2], 1];
    await Promise.all(rings.map((id) => UI.setCircleColour(win, id, c)));
    const leadMid = 1 + (reach - 1) * 0.6;
    play(win, lead, [
      {time: 0, scale: {x: 1, y: 1}, opacity: 1},
      {time: 0.22, scale: {x: leadMid, y: leadMid}, opacity: 0.8, ease: 'outCubic'},
      {time: 0.65, scale: {x: reach, y: reach}, opacity: 0, ease: 'outQuad'},
    ]);
    const trailReach = 1 + (reach - 1) * 0.65;
    play(win, trail, [
      {time: 0, scale: {x: 1, y: 1}, opacity: 0},
      {time: 0.1, scale: {x: 1.05, y: 1.05}, opacity: 0.75},
      {time: 0.75, scale: {x: trailReach, y: trailReach}, opacity: 0, ease: 'outCubic'},
    ]);
  };
}
