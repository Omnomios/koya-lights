import * as UI from 'Helix/UserInterface';
import {THEME, TEXT, FONT, TYPE} from '../theme.js';
import {cursorEnter, cursorExit} from './cursor.js';
import {play} from './juice.js';
import {bindValueDrag, setHover} from './input.js';

function clamp (value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export async function createSlider (win, parentId, {
  width,
  label,
  min = 0,
  max = 100,
  value = 0,
  format = (v) => String(Math.round(v)),
  fillColour = THEME.sliderFill,
  onChange,
  onDragStart,
  onDragEnd,
  onDragCancel,
}) {
  const trackHeight = 6;
  const thumbSize = 16;
  const rowHeight = 40;

  const root = await UI.createElement(win, {
    item: {size: {x: width, y: rowHeight}},
    layout: {type: 'column', gap: 6, alignItems: 'start'},
  });
  await UI.attach(win, parentId, root);

  const header = await UI.createElement(win, {
    item: {size: {x: width, y: 16}},
    layout: {type: 'row', gap: 8},
  });
  await UI.attach(win, root, header);

  const labelId = await UI.createElement(win, {
    item: {flexGrow: 1, size: {y: 16}},
    renderable: {
      type: 'text',
      string: label,
      font: FONT.label,
      size: TYPE.small,
      colour: TEXT.secondary,
    },
    contentAlign: {x: 'start', y: 'centre'},
  });
  await UI.attach(win, header, labelId);
  await UI.setHitTarget(win, labelId, false);

  const valueId = await UI.createElement(win, {
    item: {size: {x: 56, y: 16}},
    renderable: {
      type: 'text',
      string: format(value),
      font: FONT.label,
      size: TYPE.small,
      colour: TEXT.primary,
      justify: 'right',
    },
    contentAlign: {x: 'end', y: 'centre'},
  });
  await UI.attach(win, header, valueId);
  await UI.setHitTarget(win, valueId, false);

  const trackShell = await UI.createElement(win, {
    item: {size: {x: width, y: thumbSize}},
    layout: {type: 'none'},
  });
  await UI.attach(win, root, trackShell);
  await UI.setHitTarget(win, trackShell, true);

  const trackY = Math.round((thumbSize - trackHeight) / 2);
  const trackBg = await UI.createElement(win, {
    item: {position: {x: 0, y: trackY}, size: {x: width, y: trackHeight}},
    renderable: {
      type: 'box',
      aabb: {min: {x: 0, y: 0}, max: {x: width, y: trackHeight}},
      colour: THEME.sliderTrack,
      cornerRadius: trackHeight / 2,
    },
  });
  await UI.attach(win, trackShell, trackBg);
  await UI.setHitTarget(win, trackBg, false);

  const fillId = await UI.createElement(win, {
    item: {position: {x: 0, y: trackY}, size: {x: width, y: trackHeight}},
    renderable: {
      type: 'box',
      aabb: {min: {x: 0, y: 0}, max: {x: width, y: trackHeight}},
      origin: {x: 0, y: 0},
      scale: {x: 0.001, y: 1},
      colour: fillColour,
      cornerRadius: trackHeight / 2,
    },
  });
  await UI.attach(win, trackShell, fillId);
  await UI.setHitTarget(win, fillId, false);

  const thumbId = await UI.createElement(win, {
    item: {position: {x: 0, y: 0}, size: {x: thumbSize, y: thumbSize}},
    renderable: {
      type: 'circle',
      aabb: {min: {x: 0, y: 0}, max: {x: thumbSize, y: thumbSize}},
      colour: THEME.sliderThumb,
      origin: {x: 0.5, y: 0.5},
    },
  });
  await UI.attach(win, trackShell, thumbId);
  await UI.setHitTarget(win, thumbId, false);

  let current = clamp(value, min, max);
  let dragging = false;
  let hovered = false;
  let shown = null;

  // Fill and thumb are driven entirely by animation: the thumb's travel is an
  // offset from x=0, so its scale and position share one clip.
  async function applyVisual ({duration = dragging ? 0.07 : 0.32} = {}) {
    const t = max === min ? 0 : (current - min) / (max - min);
    const thumbX = clamp(Math.round(t * width) - Math.round(thumbSize / 2), 0, width - thumbSize);
    const thumbScale = dragging ? 1.35 : (hovered ? 1.15 : 1);
    await Promise.all([
      play(win, fillId, [{time: duration, scale: {x: Math.max(0.001, t), y: 1}, ease: 'outCubic'}]),
      play(win, thumbId, [{
        time: duration,
        position: {x: thumbX, y: 0},
        scale: {x: thumbScale, y: thumbScale},
        ease: 'outCubic',
      }]),
    ]);
    const text = format(current);
    if (text !== shown) {
      shown = text;
      await UI.setTextString(win, valueId, text);
    }
  }

  function valueFromPoint (localPoint) {
    const x = clamp(Number(localPoint?.x) || 0, 0, width);
    const t = width <= 0 ? 0 : x / width;
    return min + t * (max - min);
  }

  async function setValue (next, {notify = false} = {}) {
    const clamped = clamp(Number(next) || 0, min, max);
    if (clamped === current && shown !== null) return;
    current = clamped;
    await applyVisual();
    if (notify && typeof onChange === 'function') onChange(current);
  }

  async function setFillColour (colour) {
    await UI.setBoxColour(win, fillId, colour);
  }

  await applyVisual();

  let startValue = current;
  await bindValueDrag(win, trackShell, {
    onStart: () => {
      startValue = current;
      dragging = true;
      if (typeof onDragStart === 'function') onDragStart();
    },
    onChange: (localPoint) => {
      current = valueFromPoint(localPoint);
      if (typeof onChange === 'function') onChange(current);
      applyVisual();
    },
    onEnd: () => {
      dragging = false;
      applyVisual({duration: 0.22});
      if (typeof onDragEnd === 'function') onDragEnd(current);
    },
    onCancel: () => {
      dragging = false;
      current = startValue;
      if (typeof onChange === 'function') onChange(current);
      applyVisual({duration: 0.22});
      if (typeof onDragCancel === 'function') onDragCancel();
    },
  });
  await setHover(win, trackShell, () => {
    hovered = true;
    cursorEnter(win, trackShell);
    if (!dragging) applyVisual({duration: 0.16});
  }, () => {
    hovered = false;
    cursorExit(win, trackShell);
    if (!dragging) applyVisual({duration: 0.2});
  });

  return {
    root,
    getValue: () => current,
    setValue,
    setFillColour,
  };
}
