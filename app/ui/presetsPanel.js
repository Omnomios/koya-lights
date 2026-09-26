import * as UI from 'Helix/UserInterface';
import {FONT, LAYOUT, TEXT, THEME, TRACK, TYPE, lightTint} from '../theme.js';
import {createCard} from './widgets.js';
import {cursorEnter, cursorExit} from './cursor.js';

const ROW_HEIGHT = 38;
const DOT = 12;
const HEADER_HEIGHT = 30;
const PAD = 12;
const LIST_GAP = 8;
const VISIBLE_ROWS = 3;
const VIEWPORT_HEIGHT = VISIBLE_ROWS * ROW_HEIGHT + (VISIBLE_ROWS - 1) * LAYOUT.gap;
const PANEL_HEIGHT = PAD + HEADER_HEIGHT + LIST_GAP + VIEWPORT_HEIGHT + PAD;

export function presetsPanelHeight () {
  return PANEL_HEIGHT;
}

function listContentHeight (count) {
  const n = Math.max(0, Number(count) || 0);
  if (n === 0) return VIEWPORT_HEIGHT;
  return n * ROW_HEIGHT + Math.max(0, n - 1) * LAYOUT.gap;
}

function presetDotColour (fields) {
  if (!fields) return THEME.knobOff;
  const rgb = Array.isArray(fields.rgb) ? fields.rgb : [255, 255, 255];
  return lightTint(rgb, fields.on !== false);
}

export async function createPresetsPanel (win, parentId, {
  store,
  width,
  widgets,
}) {
  const height = PANEL_HEIGHT;
  const {frameId, bodyId: panel} = await createCard(win, parentId, {
    width,
    height,
    layout: {
      type: 'column',
      gap: LIST_GAP,
      padding: {t: PAD, r: PAD, b: PAD, l: PAD},
      alignItems: 'start',
    },
  });

  const innerWidth = width - 2 - PAD * 2;

  const header = await UI.createElement(win, {
    item: {size: {x: innerWidth, y: HEADER_HEIGHT}},
    layout: {type: 'row', gap: 10, alignItems: 'center'},
  });
  await UI.attach(win, panel, header);

  const titleId = await UI.createElement(win, {
    item: {flexGrow: 1, size: {y: HEADER_HEIGHT}},
    renderable: {
      type: 'text',
      string: 'PRESETS',
      font: FONT.display,
      size: TYPE.small,
      colour: TEXT.secondary,
      letterSpacing: TRACK.label,
    },
    contentAlign: {x: 'start', y: 'centre'},
  });
  await UI.attach(win, header, titleId);
  await UI.setHitTarget(win, titleId, false);

  await widgets.createButton({
    parentId: header,
    text: 'Save current',
    width: 118,
    height: HEADER_HEIGHT,
    compact: true,
    primary: true,
    action: () => { store.capturePreset(); },
  });

  // Same scroll surface as deepfield: clipped viewport + column content host
  // moved with setLayoutPosition on wheel.
  const scroll = await widgets.createScrollArea(panel, {
    width: innerWidth,
    height: VIEWPORT_HEIGHT,
    scrollbar: true,
    scrollStep: ROW_HEIGHT / 2,
    smooth: true,
    smoothDuration: 0.2,
  });

  const rows = new Map();
  let activeEdit = null;

  async function finishEdit () {
    if (!activeEdit) return;
    const edit = activeEdit;
    activeEdit = null;
    try { await edit.finish(); } catch (_) {}
  }

  async function createRow (preset) {
    const rootId = await UI.createElement(win, {
      item: {size: {x: scroll.contentWidth, y: ROW_HEIGHT}},
      layout: {type: 'none'},
    });
    await UI.attach(win, scroll.contentId, rootId);

    const bgId = await UI.createElement(win, {
      item: {size: {x: scroll.contentWidth, y: ROW_HEIGHT}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: scroll.contentWidth, y: ROW_HEIGHT}},
        colour: THEME.button,
        cornerRadius: LAYOUT.controlRadius,
      },
      contentAlign: 'fill',
    });
    await UI.attach(win, rootId, bgId);
    await UI.setHitTarget(win, bgId, false);

    const hitId = await UI.createElement(win, {
      item: {size: {x: scroll.contentWidth, y: ROW_HEIGHT}},
    });
    await UI.attach(win, rootId, hitId);
    await UI.setHitTarget(win, hitId, true);

    const row = await UI.createElement(win, {
      item: {size: {x: scroll.contentWidth, y: ROW_HEIGHT}},
      layout: {
        type: 'row',
        gap: 10,
        padding: {t: 4, r: 6, b: 4, l: 8},
        alignItems: 'center',
      },
    });
    await UI.attach(win, rootId, row);
    await UI.setHitTarget(win, row, false);

    const dotsHost = await UI.createElement(win, {
      item: {size: {x: DOT * 3 + 8, y: DOT}},
      layout: {type: 'row', gap: 4, alignItems: 'center'},
    });
    await UI.attach(win, row, dotsHost);
    await UI.setHitTarget(win, dotsHost, false);

    const dotIds = [];
    for (const device of store.list()) {
      const dotId = await UI.createElement(win, {
        item: {size: {x: DOT, y: DOT}},
        renderable: {
          type: 'circle',
          aabb: {min: {x: 0, y: 0}, max: {x: DOT, y: DOT}},
          colour: presetDotColour(preset.lights[device.id]),
        },
      });
      await UI.attach(win, dotsHost, dotId);
      await UI.setHitTarget(win, dotId, false);
      dotIds.push({deviceId: device.id, dotId});
    }

    const nameWidth = Math.max(80, scroll.contentWidth - (DOT * 3 + 8) - 10 - 34 - 20);
    const nameHeight = ROW_HEIGHT - 8;

    const nameShell = await UI.createElement(win, {
      item: {size: {x: nameWidth, y: nameHeight}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: nameWidth, y: nameHeight}},
        colour: THEME.inputBg,
        cornerRadius: LAYOUT.controlRadius,
      },
      layout: {
        type: 'row',
        padding: {t: 0, r: 8, b: 0, l: 8},
        alignItems: 'center',
      },
      contentAlign: 'fill',
    });
    await UI.attach(win, row, nameShell);
    await UI.setHitTarget(win, nameShell, true);

    const nameId = await UI.createElement(win, {
      item: {flexGrow: 1, size: {y: nameHeight}},
      renderable: {
        type: 'text',
        string: preset.name || ' ',
        font: FONT.label,
        size: TYPE.small,
        colour: TEXT.primary,
      },
      contentAlign: {x: 'start', y: 'centre'},
    });
    await UI.attach(win, nameShell, nameId);
    await UI.setHitTarget(win, nameId, false);

    await UI.setOnMouseEnter(win, nameShell, () => cursorEnter(win, nameShell));
    await UI.setOnMouseExit(win, nameShell, () => cursorExit(win, nameShell));
    await UI.setOnMouseDown(win, nameShell, async () => {
      await finishEdit();
      await UI.setEnabled(win, nameId, false);
      let finished = false;
      const input = await widgets.createInput({
        parentId: nameShell,
        width: nameWidth - 16,
        height: nameHeight - 4,
        value: preset.name,
        font: FONT.label,
        textSize: TYPE.small,
        commitOnInput: false,
        onCommit: (value) => {
          const next = String(value || '').trim();
          if (next && next !== preset.name) store.renamePreset(preset.id, next);
        },
      });
      const finish = async () => {
        if (finished) return;
        finished = true;
        if (activeEdit?.finish === finish) activeEdit = null;
        try { if (typeof input.blur === 'function') input.blur(); } catch (_) {}
        const live = store.listPresets().find((p) => p.id === preset.id);
        try {
          if (input.shellId) await UI.destroyElement(win, input.shellId);
        } catch (_) {}
        await UI.setTextString(win, nameId, live?.name || preset.name || ' ');
        await UI.setEnabled(win, nameId, true);
      };
      activeEdit = {finish};
      if (typeof input.focus === 'function') await input.focus();
      const watch = setInterval(() => {
        if (typeof input.isFocused === 'function' && input.isFocused()) return;
        clearInterval(watch);
        finish().catch(() => {});
      }, 120);
    });

    await widgets.createButton({
      parentId: row,
      text: '×',
      width: 28,
      height: nameHeight,
      compact: true,
      action: () => {
        finishEdit().then(() => store.removePreset(preset.id)).catch(() => {});
      },
    });

    await UI.setOnMouseDown(win, hitId, () => {
      store.applyPreset(preset.id).catch(() => {});
    });
    await UI.setOnMouseEnter(win, hitId, () => {
      cursorEnter(win, hitId);
      UI.setBoxColour(win, bgId, THEME.buttonHover).catch(() => {});
    });
    await UI.setOnMouseExit(win, hitId, () => {
      cursorExit(win, hitId);
      UI.setBoxColour(win, bgId, THEME.button).catch(() => {});
    });

    // Finish rename if the user scrolls the list.
    await UI.setOnMouseScroll(win, hitId, async (_w, _l, delta) => {
      await finishEdit();
      const rawDelta = typeof delta === 'object' && delta !== null
        ? Number(delta.y ?? delta.delta ?? delta.value)
        : Number(delta);
      if (!Number.isFinite(rawDelta) || rawDelta === 0) return;
      await scroll.setOffset(scroll.offset + (rawDelta * (ROW_HEIGHT / 2)));
    });

    return {rootId, bgId, nameId, dotIds, name: preset.name};
  }

  async function sync () {
    await finishEdit();
    const presets = store.listPresets();
    const nextIds = new Set(presets.map((p) => p.id));

    for (const [id, row] of [...rows.entries()]) {
      if (nextIds.has(id)) continue;
      try { await UI.destroyElement(win, row.rootId); } catch (_) {}
      rows.delete(id);
    }

    // Recreate in order when membership changes so column order matches store order.
    const known = [...rows.keys()].join('\0');
    const wanted = presets.map((p) => p.id).join('\0');
    if (known !== wanted) {
      for (const row of rows.values()) {
        try { await UI.destroyElement(win, row.rootId); } catch (_) {}
      }
      rows.clear();
      for (const preset of presets) {
        rows.set(preset.id, await createRow(preset));
      }
    } else {
      for (const preset of presets) {
        const row = rows.get(preset.id);
        if (!row) continue;
        if (preset.name !== row.name) {
          row.name = preset.name;
          await UI.setTextString(win, row.nameId, preset.name || ' ');
        }
        for (const {deviceId, dotId} of row.dotIds) {
          await UI.setCircleColour(win, dotId, presetDotColour(preset.lights[deviceId]));
        }
      }
    }

    await scroll.setContentHeight(listContentHeight(presets.length));
  }

  await sync();

  return {
    root: frameId,
    get height () { return height; },
    refresh: sync,
  };
}
