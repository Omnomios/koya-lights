import * as UI from 'Helix/UserInterface';
import {FONT, LAYOUT, TEXT, TEXT_RGBA, THEME, TRACK, TYPE, lightTint} from '../theme.js';
import {createCard} from './widgets.js';
import {createSlider} from './slider.js';
import {createToggle} from './toggle.js';
import {cursorEnter, cursorExit} from './cursor.js';
import {breathe, createShockwave, pressPop, punch, scaleTo, settle, transformHost} from './juice.js';
import {setHover} from './input.js';

export const DEVICE_PANEL_HEIGHT = 300;
const SWATCH_HOVER_SCALE = 1.05;

function parsePick (value) {
  const parts = String(value).split(',').map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((p) => !Number.isFinite(p))) return null;
  return [
    Math.max(0, Math.min(255, Math.round(parts[0]))),
    Math.max(0, Math.min(255, Math.round(parts[1]))),
    Math.max(0, Math.min(255, Math.round(parts[2]))),
  ];
}

async function text (win, parentId, {string, font, size, colour, item, justify = 'left', letterSpacing, align, origin}) {
  const id = await UI.createElement(win, {
    item,
    renderable: {
      type: 'text',
      string,
      font,
      size,
      colour,
      justify,
      ...(letterSpacing ? {letterSpacing} : {}),
      ...(origin ? {origin} : {}),
    },
    contentAlign: align || {x: 'start', y: 'centre'},
  });
  await UI.attach(win, parentId, id);
  await UI.setHitTarget(win, id, false);
  return id;
}

export async function createDevicePanel (win, parentId, {
  store,
  deviceId,
  width,
  openColourPicker,
}) {
  const pad = LAYOUT.pad;
  const innerWidth = width - 2 - pad * 2;
  const {frameId, bodyId: panel} = await createCard(win, parentId, {
    width,
    height: DEVICE_PANEL_HEIGHT,
    layout: {
      type: 'column',
      gap: 14,
      padding: {t: pad, r: pad, b: pad, l: pad},
      alignItems: 'start',
    },
  });

  const header = await UI.createElement(win, {
    item: {size: {x: innerWidth, y: 34}},
    layout: {type: 'row', gap: 10, alignItems: 'center'},
  });
  await UI.attach(win, panel, header);

  const dotId = await UI.createElement(win, {
    item: {size: {x: 10, y: 10}},
    renderable: {
      type: 'circle',
      aabb: {min: {x: 0, y: 0}, max: {x: 10, y: 10}},
      colour: THEME.knobOff,
      origin: {x: 0.5, y: 0.5},
    },
  });
  await UI.attach(win, header, dotId);
  await UI.setHitTarget(win, dotId, false);

  const titleCol = await UI.createElement(win, {
    item: {flexGrow: 1, size: {y: 34}},
    layout: {type: 'column', gap: 2, alignItems: 'start'},
  });
  await UI.attach(win, header, titleCol);

  const device = store.get(deviceId);
  const labelId = await text(win, titleCol, {
    item: {size: {x: innerWidth - 80, y: 18}},
    string: String(device?.label || deviceId).toUpperCase(),
    font: FONT.display,
    size: TYPE.title,
    colour: TEXT.primary,
    letterSpacing: TRACK.heading,
  });
  await text(win, titleCol, {
    item: {size: {x: innerWidth - 80, y: 14}},
    string: device?.ip || ' ',
    font: FONT.body,
    size: TYPE.micro,
    colour: TEXT.muted,
  });

  const powerToggle = await createToggle(win, header, {
    onClick: () => {
      store.toggleOne(deviceId).catch(() => {});
    },
  });

  const swatchRow = await UI.createElement(win, {
    item: {size: {x: innerWidth, y: 96}},
    layout: {type: 'row', gap: 18, alignItems: 'center'},
  });
  await UI.attach(win, panel, swatchRow);

  const ringSize = 96;
  const discSize = 76;
  const discOffset = (ringSize - discSize) / 2;
  const swatchShell = await UI.createElement(win, {
    item: {size: {x: ringSize, y: ringSize}},
    renderable: transformHost(ringSize, ringSize),
    layout: {type: 'none'},
  });
  await UI.attach(win, swatchRow, swatchShell);
  await UI.setHitTarget(win, swatchShell, true);

  const wellId = await UI.createElement(win, {
    item: {size: {x: ringSize, y: ringSize}},
    renderable: {
      type: 'circle',
      aabb: {min: {x: 0, y: 0}, max: {x: ringSize, y: ringSize}},
      colour: THEME.well,
    },
  });
  await UI.attach(win, swatchShell, wellId);
  await UI.setHitTarget(win, wellId, false);

  const ringId = await UI.createElement(win, {
    item: {size: {x: ringSize, y: ringSize}},
    renderable: {
      type: 'circle',
      aabb: {min: {x: 0, y: 0}, max: {x: ringSize, y: ringSize}},
      colour: THEME.borderStrong,
      inset: 3,
    },
  });
  await UI.attach(win, swatchShell, ringId);
  await UI.setHitTarget(win, ringId, false);

  const discId = await UI.createElement(win, {
    item: {position: {x: discOffset, y: discOffset}, size: {x: discSize, y: discSize}},
    renderable: {
      type: 'circle',
      aabb: {min: {x: 0, y: 0}, max: {x: discSize, y: discSize}},
      colour: [1, 1, 1, 1],
      origin: {x: 0.5, y: 0.5},
    },
  });
  await UI.attach(win, swatchShell, discId);
  await UI.setHitTarget(win, discId, false);
  const shockwave = await createShockwave(win, swatchShell, {x: discOffset, y: discOffset, size: discSize});

  const readout = await UI.createElement(win, {
    item: {flexGrow: 1, size: {y: 72}},
    layout: {type: 'column', gap: 4, alignItems: 'start'},
  });
  await UI.attach(win, swatchRow, readout);
  const readoutWidth = innerWidth - ringSize - 18;

  await text(win, readout, {
    item: {size: {x: readoutWidth, y: 14}},
    string: 'OUTPUT',
    font: FONT.label,
    size: TYPE.micro,
    colour: TEXT.muted,
    letterSpacing: TRACK.label,
  });
  const powerId = await text(win, readout, {
    item: {size: {x: readoutWidth, y: 30}},
    string: '— W',
    font: FONT.display,
    size: TYPE.heading,
    colour: TEXT.primary,
  });
  const stateId = await text(win, readout, {
    item: {size: {x: readoutWidth, y: 16}},
    string: '…',
    font: FONT.label,
    size: TYPE.small,
    colour: TEXT.secondary,
    letterSpacing: TRACK.label,
    origin: {x: 0, y: 0.5},
  });

  const brightnessSlider = await createSlider(win, panel, {
    width: innerWidth,
    label: 'Brightness',
    min: 0,
    max: 100,
    value: device?.brightness ?? 100,
    format: (v) => `${Math.round(v)}%`,
    onDragStart: () => store.setDragging(deviceId, true),
    onDragCancel: () => store.setDragging(deviceId, false),
    onChange: (v) => {
      const d = store.get(deviceId);
      if (d) d.brightness = Math.round(v);
    },
    onDragEnd: (v) => {
      store.setDragging(deviceId, false);
      store.applyOne(deviceId, {brightness: Math.round(v), on: true}).catch(() => {});
    },
  });

  const whiteSlider = await createSlider(win, panel, {
    width: innerWidth,
    label: 'White',
    min: 0,
    max: 255,
    value: device?.white ?? 0,
    fillColour: [0.85, 0.88, 0.92, 1],
    onDragStart: () => store.setDragging(deviceId, true),
    onDragCancel: () => store.setDragging(deviceId, false),
    onChange: (v) => {
      const d = store.get(deviceId);
      if (d) d.white = Math.round(v);
    },
    onDragEnd: (v) => {
      store.setDragging(deviceId, false);
      store.applyOne(deviceId, {white: Math.round(v), on: true}).catch(() => {});
    },
  });

  let swatchHovered = false;
  await setHover(win, swatchShell, () => {
    swatchHovered = true;
    UI.setCircleColour(win, ringId, THEME.accent).catch(() => {});
    cursorEnter(win, swatchShell);
    scaleTo(win, swatchShell, SWATCH_HOVER_SCALE);
  }, () => {
    swatchHovered = false;
    UI.setCircleColour(win, ringId, THEME.borderStrong).catch(() => {});
    cursorExit(win, swatchShell);
    scaleTo(win, swatchShell, 1, 0.2);
  });
  await UI.setOnActivate(win, swatchShell, () => {
    pressPop(win, swatchShell, {rest: swatchHovered ? SWATCH_HOVER_SCALE : 1});
    const d = store.get(deviceId);
    if (!d) return;
    openColourPicker({
      targetId: deviceId,
      current: {r: d.rgb[0], g: d.rgb[1], b: d.rgb[2], a: 255},
      onPick: (value) => {
        const rgb = parsePick(value);
        if (!rgb) return;
        store.applyOne(deviceId, {rgb, on: true}).catch(() => {});
      },
    });
  });

  let last = null;

  function react (d) {
    const prev = last;
    last = {online: d.online, on: d.on, rgb: d.rgb.join(','), state: d.online ? (d.on ? 'ON' : 'OFF') : 'OFFLINE'};
    if (!prev || prev.online !== d.online) {
      if (d.online) breathe(win, dotId);
      else settle(win, dotId);
    }
    if (!prev) return;
    if (prev.state !== last.state) punch(win, stateId, 1.15);
    const recoloured = prev.rgb !== last.rgb && d.on;
    const switchedOn = !prev.on && d.on;
    if (recoloured || switchedOn) {
      punch(win, discId, 1.22);
      shockwave(lightTint(d.rgb, true));
    } else if (prev.on && !d.on) {
      punch(win, discId, 0.86);
    }
  }

  async function refresh () {
    const d = store.get(deviceId);
    if (!d) return;
    react(d);
    const tint = lightTint(d.rgb, d.on && d.online);
    await UI.setTextString(win, labelId, String(d.label || deviceId).toUpperCase());
    await UI.setCircleColour(win, discId, lightTint(d.rgb, d.on));
    await UI.setCircleColour(win, dotId, d.online ? THEME.online : THEME.offline);
    await UI.setTextString(win, powerId, d.online ? `${d.apower.toFixed(1)} W` : '— W');
    await UI.setTextString(win, stateId, d.online ? (d.on ? 'ON' : 'OFF') : 'OFFLINE');
    await UI.setTextColour(win, stateId, d.online
      ? (d.on ? TEXT_RGBA.primary : TEXT_RGBA.secondary)
      : TEXT_RGBA.offline);
    await powerToggle.setOn(d.on, lightTint(d.rgb, true));
    await brightnessSlider.setFillColour(tint);
    if (!d.dragging) {
      await brightnessSlider.setValue(d.brightness);
      await whiteSlider.setValue(d.white);
    }
  }

  return {root: frameId, refresh};
}
