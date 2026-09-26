import * as UI from 'Helix/UserInterface';
import * as Log from 'Helix/Log';
import * as Image from 'Koya/Image';
import {createSlicedPanel} from './widgets.js';
import {createRenderQueue} from './render_queue.js';
import {cursorEnter, cursorExit} from './cursor.js';
import {centrePivot, play, pressPop, scaleTo} from './juice.js';
import {LAYOUT, TEXT, THEME, TYPE} from '../theme.js';

const CLOSE_SECONDS = 0.14;

const PANEL_WIDTH = 330;
const SV_HEIGHT = 170;
const HUE_HEIGHT = 16;
const SWATCH_SIZE = 40;
const PRESET_SIZE = 28;
const PRESETS = [
  {name: 'red', rgb: [255, 0, 0]},
  {name: 'green', rgb: [0, 255, 0]},
  {name: 'blue', rgb: [0, 0, 255]},
  {name: 'purple', rgb: [255, 0, 255]},
  {name: 'white', rgb: [255, 255, 255]},
];

const HUE_TEXTURE_KEY = 'ui/colour-hue';
const SV_BASE_TEXTURE_KEY = 'ui/colour-sv-base';
const SV_SHADE_TEXTURE_KEY = 'ui/colour-sv-shade';

function clamp (value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampChannel (value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return clamp(Math.round(parsed), 0, 255);
}

export function hsvToRgb (h, s, v) {
  const c = v * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function rgbToHsv (r, g, b) {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * (((bn - rn) / delta) + 2);
    else h = 60 * (((rn - gn) / delta) + 4);
  }
  if (h < 0) h += 360;
  return {h, s: max <= 0 ? 0 : delta / max, v: max};
}

export class ColourPickerModal {
  constructor ({widgets, viewport}) {
    this.widgets = widgets;
    this.viewport = viewport;
    this.windowId = widgets.windowId;
    this.overlayId = 0;
    this.panelId = 0;
    this.svShellId = 0;
    this.svBaseId = 0;
    this.svCursorId = 0;
    this.hueShellId = 0;
    this.hueCursorId = 0;
    this.swatchId = 0;
    this.inputs = {};
    this.onPick = null;
    this.visible = false;
    this.hue = 0;
    this.sat = 1;
    this.val = 1;
    this.alpha = 255;
    this.svDragging = false;
    this.hueDragging = false;
    this.regenerateSvBase = createRenderQueue(async () => {
      const {r, g, b} = hsvToRgb(this.hue, 1, 1);
      await Image.gradient(this.windowId, {
        type: 'linear',
        dst: SV_BASE_TEXTURE_KEY,
        width: 128,
        height: 1,
        mipmaps: false,
        linear: {from: {x: 0, y: 0.5}, to: {x: 1, y: 0.5}},
        stops: [
          {at: 0, colour: [1, 1, 1, 1]},
          {at: 1, colour: [r / 255, g / 255, b / 255, 1]},
        ],
      });
    }, 'colour picker');
  }

  svWidth () {
    return PANEL_WIDTH - (LAYOUT.pad * 2);
  }

  panelHeight () {
    return LAYOUT.pad * 2 + 24 + 1 + SV_HEIGHT + HUE_HEIGHT + LAYOUT.rowHeight * 2 +
      PRESET_SIZE + Math.max(SWATCH_SIZE, LAYOUT.buttonHeight) + (LAYOUT.gap * 8);
  }

  rgb () {
    return hsvToRgb(this.hue, this.sat, this.val);
  }

  valueString () {
    const {r, g, b} = this.rgb();
    return `${r},${g},${b},${this.alpha}`;
  }

  async create (parentId) {
    const width = this.viewport.x;
    const height = this.viewport.y;

    await Image.gradient(this.windowId, {
      type: 'linear',
      dst: HUE_TEXTURE_KEY,
      width: 360,
      height: 1,
      mipmaps: false,
      linear: {from: {x: 0, y: 0.5}, to: {x: 1, y: 0.5}},
      stops: [
        {at: 0, colour: [1, 0, 0, 1]},
        {at: 1 / 6, colour: [1, 1, 0, 1]},
        {at: 2 / 6, colour: [0, 1, 0, 1]},
        {at: 3 / 6, colour: [0, 1, 1, 1]},
        {at: 4 / 6, colour: [0, 0, 1, 1]},
        {at: 5 / 6, colour: [1, 0, 1, 1]},
        {at: 1, colour: [1, 0, 0, 1]},
      ],
    });
    await Image.gradient(this.windowId, {
      type: 'linear',
      dst: SV_SHADE_TEXTURE_KEY,
      width: 1,
      height: 128,
      mipmaps: false,
      linear: {from: {x: 0.5, y: 0}, to: {x: 0.5, y: 1}},
      stops: [
        {at: 0, colour: [0, 0, 0, 0]},
        {at: 1, colour: [0, 0, 0, 1]},
      ],
    });
    await this.regenerateSvBase();

    this.overlayId = await UI.createElement(this.windowId, {
      item: {size: {x: width, y: height}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: width, y: height}},
        colour: THEME.scrim,
      },
      layout: {type: 'none'},
    });
    await UI.setEnabled(this.windowId, this.overlayId, false);
    await UI.attach(this.windowId, parentId, this.overlayId);
    await UI.setLayoutPosition(this.windowId, this.overlayId, {x: 0, y: 0});
    await this.widgets.captureUiPointer(this.overlayId);
    await UI.setOnMouseDown(this.windowId, this.overlayId, () => {
      this.close().catch(() => {});
    });

    const panelHeight = this.panelHeight();
    this.panelId = await createSlicedPanel(this.windowId, {
      item: {size: {x: PANEL_WIDTH, y: panelHeight}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: PANEL_WIDTH, y: panelHeight}},
        colour: THEME.modalPanel,
      },
      layout: {
        type: 'column',
        gap: LAYOUT.gap,
        padding: {t: LAYOUT.pad, r: LAYOUT.pad, b: LAYOUT.pad, l: LAYOUT.pad},
        alignItems: 'start',
      },
    });
    await UI.attach(this.windowId, this.overlayId, this.panelId);
    await centrePivot(this.windowId, this.panelId);
    await this.positionPanel();
    await UI.setOnMouseDown(this.windowId, this.panelId, () => {});

    const innerWidth = this.svWidth();
    const headerRowId = await UI.createElement(this.windowId, {
      item: {size: {x: innerWidth, y: 24}},
      layout: {type: 'row', gap: LAYOUT.gap, alignItems: 'start'},
    });
    await UI.attach(this.windowId, this.panelId, headerRowId);
    await this.widgets.createText(headerRowId, {
      item: {flexGrow: 1, size: {y: 24}},
      string: 'Select Colour',
      size: TYPE.body,
      colour: TEXT.accent,
    });
    await this.widgets.createButton({
      parentId: headerRowId,
      text: 'Cancel',
      width: 64,
      height: 22,
      action: () => this.close().catch(() => {}),
      compact: true,
    });
    await this.widgets.createSeparator(this.panelId, innerWidth);

    await this.createSvBox(innerWidth);
    await this.createHueStrip(innerWidth);
    await this.createChannelInputs(innerWidth);
    await this.createPresets(innerWidth);
    await this.createFooter(innerWidth);

    // A disable issued in the same tick as the subtree's attaches is lost.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await this.setVisible(false);
  }

  async createSvBox (width) {
    this.svShellId = await UI.createElement(this.windowId, {
      item: {size: {x: width, y: SV_HEIGHT}},
      layout: {type: 'none'},
    });
    await UI.attach(this.windowId, this.panelId, this.svShellId);
    await this.widgets.captureUiPointer(this.svShellId);

    this.svBaseId = await UI.createElement(this.windowId, {
      item: {size: {x: width, y: SV_HEIGHT}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: width, y: SV_HEIGHT}},
        colour: [1, 1, 1, 1],
      },
    });
    await UI.attach(this.windowId, this.svShellId, this.svBaseId);
    await UI.setHitTarget(this.windowId, this.svBaseId, false);
    await UI.setTexture(this.windowId, this.svBaseId, `/ram/${SV_BASE_TEXTURE_KEY}`)
      .catch((error) => Log.error(`[shellyHub] sv base texture failed: ${error}`));

    const shadeId = await UI.createElement(this.windowId, {
      item: {size: {x: width, y: SV_HEIGHT}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: width, y: SV_HEIGHT}},
        colour: [1, 1, 1, 1],
      },
    });
    await UI.attach(this.windowId, this.svShellId, shadeId);
    await UI.setHitTarget(this.windowId, shadeId, false);
    await UI.setTexture(this.windowId, shadeId, `/ram/${SV_SHADE_TEXTURE_KEY}`)
      .catch((error) => Log.error(`[shellyHub] sv shade texture failed: ${error}`));

    this.svCursorId = await UI.createElement(this.windowId, {
      item: {size: {x: 12, y: 12}},
      renderable: {
        type: 'circle',
        aabb: {min: {x: 0, y: 0}, max: {x: 12, y: 12}},
        colour: [1, 1, 1, 0.95],
        inset: 2,
      },
    });
    await UI.attach(this.windowId, this.svShellId, this.svCursorId);
    await UI.setHitTarget(this.windowId, this.svCursorId, false);

    const updateFromPoint = (localPoint) => {
      const x = clamp(Number(localPoint?.x) || 0, 0, width);
      const y = clamp(Number(localPoint?.y) || 0, 0, SV_HEIGHT);
      this.sat = width <= 0 ? 0 : x / width;
      this.val = SV_HEIGHT <= 0 ? 0 : 1 - (y / SV_HEIGHT);
      this.syncFromHsv().catch(() => {});
    };
    await UI.setOnMouseDown(this.windowId, this.svShellId, (_windowPoint, localPoint) => {
      this.svDragging = true;
      updateFromPoint(localPoint);
    });
    await UI.setOnMouseMove(this.windowId, this.svShellId, (_windowPoint, localPoint) => {
      if (this.svDragging) updateFromPoint(localPoint);
    });
    await UI.setOnMouseUp(this.windowId, this.svShellId, () => {
      this.svDragging = false;
    });
    await UI.setOnMouseEnter(this.windowId, this.svShellId, () => {
      cursorEnter(this.windowId, this.svShellId, 'crosshair');
    });
    await UI.setOnMouseExit(this.windowId, this.svShellId, () => {
      this.svDragging = false;
      cursorExit(this.windowId, this.svShellId);
    });
  }

  async createHueStrip (width) {
    this.hueShellId = await UI.createElement(this.windowId, {
      item: {size: {x: width, y: HUE_HEIGHT}},
      layout: {type: 'none'},
    });
    await UI.attach(this.windowId, this.panelId, this.hueShellId);
    await this.widgets.captureUiPointer(this.hueShellId);

    const stripId = await UI.createElement(this.windowId, {
      item: {size: {x: width, y: HUE_HEIGHT}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: width, y: HUE_HEIGHT}},
        colour: [1, 1, 1, 1],
      },
    });
    await UI.attach(this.windowId, this.hueShellId, stripId);
    await UI.setHitTarget(this.windowId, stripId, false);
    await UI.setTexture(this.windowId, stripId, `/ram/${HUE_TEXTURE_KEY}`)
      .catch((error) => Log.error(`[shellyHub] hue strip texture failed: ${error}`));

    this.hueCursorId = await UI.createElement(this.windowId, {
      item: {size: {x: 3, y: HUE_HEIGHT}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: 3, y: HUE_HEIGHT}},
        colour: [1, 1, 1, 0.95],
      },
    });
    await UI.attach(this.windowId, this.hueShellId, this.hueCursorId);
    await UI.setHitTarget(this.windowId, this.hueCursorId, false);

    const updateFromPoint = (localPoint) => {
      const x = clamp(Number(localPoint?.x) || 0, 0, width);
      this.hue = width <= 0 ? 0 : clamp((x / width) * 360, 0, 359.999);
      this.syncFromHsv({hueChanged: true}).catch(() => {});
    };
    await UI.setOnMouseDown(this.windowId, this.hueShellId, (_windowPoint, localPoint) => {
      this.hueDragging = true;
      updateFromPoint(localPoint);
    });
    await UI.setOnMouseMove(this.windowId, this.hueShellId, (_windowPoint, localPoint) => {
      if (this.hueDragging) updateFromPoint(localPoint);
    });
    await UI.setOnMouseUp(this.windowId, this.hueShellId, () => {
      this.hueDragging = false;
    });
    await UI.setOnMouseEnter(this.windowId, this.hueShellId, () => {
      cursorEnter(this.windowId, this.hueShellId, 'crosshair');
    });
    await UI.setOnMouseExit(this.windowId, this.hueShellId, () => {
      this.hueDragging = false;
      cursorExit(this.windowId, this.hueShellId);
    });
  }

  async createChannelInputs (width) {
    const channels = [['r', 'R'], ['g', 'G'], ['b', 'B'], ['a', 'A']];
    const pairWidth = Math.floor((width - LAYOUT.gap) / 2);
    const inputWidth = pairWidth - 20 - LAYOUT.gap;
    for (let rowIndex = 0; rowIndex < 2; rowIndex++) {
      const rowId = await UI.createElement(this.windowId, {
        item: {size: {x: width, y: LAYOUT.rowHeight}},
        layout: {type: 'row', gap: LAYOUT.gap, alignItems: 'start'},
      });
      await UI.attach(this.windowId, this.panelId, rowId);
      await UI.setHitTarget(this.windowId, rowId, false);
      for (const [key, label] of channels.slice(rowIndex * 2, rowIndex * 2 + 2)) {
        await this.widgets.createText(rowId, {
          item: {size: {x: 20, y: LAYOUT.rowHeight}},
          string: label,
          size: TYPE.body,
          colour: TEXT.secondary,
        });
        this.inputs[key] = await this.widgets.createInput({
          parentId: rowId,
          width: inputWidth,
          placeholder: '0-255',
          onCommit: () => this.commitChannelInputs(),
        });
      }
    }
  }

  async createPresets (width) {
    const rowId = await UI.createElement(this.windowId, {
      item: {size: {x: width, y: PRESET_SIZE}},
      layout: {type: 'row', gap: LAYOUT.gap, alignItems: 'center'},
    });
    await UI.attach(this.windowId, this.panelId, rowId);

    for (const preset of PRESETS) {
      const [r, g, b] = preset.rgb;
      const shellId = await UI.createElement(this.windowId, {
        item: {size: {x: PRESET_SIZE, y: PRESET_SIZE}},
        layout: {type: 'none'},
        renderable: {
          type: 'box',
          aabb: {min: {x: 0, y: 0}, max: {x: PRESET_SIZE, y: PRESET_SIZE}},
          colour: [0, 0, 0, 0],
          origin: {x: 0.5, y: 0.5},
        },
      });
      await UI.attach(this.windowId, rowId, shellId);
      await UI.setHitTarget(this.windowId, shellId, true);

      const fillId = await UI.createElement(this.windowId, {
        item: {size: {x: PRESET_SIZE, y: PRESET_SIZE}},
        renderable: {
          type: 'box',
          aabb: {min: {x: 0, y: 0}, max: {x: PRESET_SIZE, y: PRESET_SIZE}},
          colour: [r / 255, g / 255, b / 255, 1],
          cornerRadius: 6,
        },
      });
      await UI.attach(this.windowId, shellId, fillId);
      await UI.setHitTarget(this.windowId, fillId, false);

      const borderId = await UI.createElement(this.windowId, {
        item: {size: {x: PRESET_SIZE, y: PRESET_SIZE}},
        renderable: {
          type: 'box',
          aabb: {min: {x: 0, y: 0}, max: {x: PRESET_SIZE, y: PRESET_SIZE}},
          colour: THEME.swatchBorder,
          inset: 1,
          cornerRadius: 6,
        },
      });
      await UI.attach(this.windowId, shellId, borderId);
      await UI.setHitTarget(this.windowId, borderId, false);

      await UI.setOnMouseEnter(this.windowId, shellId, () => {
        cursorEnter(this.windowId, shellId);
        scaleTo(this.windowId, shellId, 1.08);
        UI.setBoxColour(this.windowId, borderId, THEME.accent).catch(() => {});
      });
      await UI.setOnMouseExit(this.windowId, shellId, () => {
        cursorExit(this.windowId, shellId);
        scaleTo(this.windowId, shellId, 1, 0.18);
        UI.setBoxColour(this.windowId, borderId, THEME.swatchBorder).catch(() => {});
      });
      await UI.setOnMouseDown(this.windowId, shellId, () => {
        pressPop(this.windowId, shellId, {rest: 1.08});
        this.applyRgb(r, g, b);
      });
    }
  }

  applyRgb (r, g, b) {
    const {h, s, v} = rgbToHsv(clampChannel(r), clampChannel(g), clampChannel(b));
    const hueChanged = Math.abs(h - this.hue) > 0.001;
    this.hue = h;
    this.sat = s;
    this.val = v;
    this.syncFromHsv({hueChanged}).catch(() => {});
  }

  async createFooter (width) {
    const rowId = await UI.createElement(this.windowId, {
      item: {size: {x: width, y: Math.max(SWATCH_SIZE, LAYOUT.buttonHeight)}},
      layout: {type: 'row', gap: LAYOUT.gap, alignItems: 'start'},
    });
    await UI.attach(this.windowId, this.panelId, rowId);
    await UI.setHitTarget(this.windowId, rowId, false);

    const swatchShellId = await UI.createElement(this.windowId, {
      item: {size: {x: SWATCH_SIZE, y: SWATCH_SIZE}},
      layout: {type: 'none'},
    });
    await UI.attach(this.windowId, rowId, swatchShellId);
    await UI.setHitTarget(this.windowId, swatchShellId, false);
    this.swatchId = await UI.createElement(this.windowId, {
      item: {size: {x: SWATCH_SIZE, y: SWATCH_SIZE}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: SWATCH_SIZE, y: SWATCH_SIZE}},
        colour: [1, 1, 1, 1],
        cornerRadius: 6,
      },
    });
    await UI.attach(this.windowId, swatchShellId, this.swatchId);
    await UI.setHitTarget(this.windowId, this.swatchId, false);
    const swatchBorderId = await UI.createElement(this.windowId, {
      item: {size: {x: SWATCH_SIZE, y: SWATCH_SIZE}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: SWATCH_SIZE, y: SWATCH_SIZE}},
        colour: THEME.swatchBorder,
        inset: 1,
        cornerRadius: 6,
      },
    });
    await UI.attach(this.windowId, swatchShellId, swatchBorderId);
    await UI.setHitTarget(this.windowId, swatchBorderId, false);

    const spacerId = await UI.createElement(this.windowId, {item: {flexGrow: 1, size: {y: 1}}});
    await UI.attach(this.windowId, rowId, spacerId);
    await UI.setHitTarget(this.windowId, spacerId, false);

    await this.widgets.createButton({
      parentId: rowId,
      text: 'Apply',
      width: 84,
      height: SWATCH_SIZE,
      action: () => {
        const onPick = this.onPick;
        const value = this.valueString();
        this.close().catch(() => {});
        if (typeof onPick === 'function') onPick(value);
      },
      compact: true,
    });
  }

  async updateCursors () {
    const width = this.svWidth();
    const svX = clamp(Math.round(this.sat * width) - 6, -6, width - 6);
    const svY = clamp(Math.round((1 - this.val) * SV_HEIGHT) - 6, -6, SV_HEIGHT - 6);
    await UI.setLayoutPosition(this.windowId, this.svCursorId, {x: svX, y: svY});
    const hueX = clamp(Math.round((this.hue / 360) * width) - 1, 0, width - 3);
    await UI.setLayoutPosition(this.windowId, this.hueCursorId, {x: hueX, y: 0});
  }

  async updateSwatch () {
    const {r, g, b} = this.rgb();
    await UI.setBoxColour(
      this.windowId,
      this.swatchId,
      [r / 255, g / 255, b / 255, this.alpha / 255],
    ).catch((error) => Log.error(`[shellyHub] swatch colour failed: ${error}`));
  }

  async updateInputs () {
    const {r, g, b} = this.rgb();
    const values = {r, g, b, a: this.alpha};
    for (const [key, input] of Object.entries(this.inputs)) {
      if (!input || (typeof input.isFocused === 'function' && input.isFocused())) continue;
      const next = String(values[key]);
      if (input.getValue() !== next) await input.setValue(next);
    }
  }

  async syncFromHsv ({hueChanged = false} = {}) {
    if (hueChanged) await this.regenerateSvBase();
    await this.updateCursors();
    await this.updateSwatch();
    await this.updateInputs();
  }

  commitChannelInputs () {
    const r = clampChannel(this.inputs.r?.getValue());
    const g = clampChannel(this.inputs.g?.getValue());
    const b = clampChannel(this.inputs.b?.getValue());
    this.alpha = clampChannel(this.inputs.a?.getValue() ?? this.alpha);
    const {h, s, v} = rgbToHsv(r, g, b);
    const hueChanged = Math.abs(h - this.hue) > 0.001;
    this.hue = h;
    this.sat = s;
    this.val = v;
    this.syncFromHsv({hueChanged}).catch(() => {});
  }

  async positionPanel () {
    const x = Math.max(16, Math.round((this.viewport.x - PANEL_WIDTH) * 0.5));
    const y = Math.max(16, Math.round((this.viewport.y - this.panelHeight()) * 0.5));
    await UI.setLayoutPosition(this.windowId, this.panelId, {x, y});
  }

  async setVisible (visible) {
    this.visible = visible === true;
    this.visibilityToken = (this.visibilityToken || 0) + 1;
    await UI.setEnabled(this.windowId, this.overlayId, this.visible);
  }

  playOpen () {
    play(this.windowId, this.overlayId, [
      {time: 0, opacity: 0},
      {time: 0.18, opacity: 1, ease: 'outQuad'},
    ]);
    play(this.windowId, this.panelId, [
      {time: 0, scale: {x: 0.9, y: 0.9}, position: {x: 0, y: 14}},
      {time: 0.2, scale: {x: 1.02, y: 1.02}, position: {x: 0, y: -2}, ease: 'outCubic'},
      {time: 0.32, scale: {x: 1, y: 1}, position: {x: 0, y: 0}, ease: 'inOutQuad'},
    ]);
  }

  // Stays enabled until the fade ends; a reopen in the meantime wins.
  playClose () {
    play(this.windowId, this.overlayId, [{time: CLOSE_SECONDS, opacity: 0, ease: 'inQuad'}]);
    play(this.windowId, this.panelId, [
      {time: CLOSE_SECONDS, scale: {x: 0.94, y: 0.94}, position: {x: 0, y: 8}, ease: 'inQuad'},
    ]);
    this.visible = false;
    const token = (this.visibilityToken || 0) + 1;
    this.visibilityToken = token;
    setTimeout(() => {
      if (this.visibilityToken !== token) return;
      UI.setEnabled(this.windowId, this.overlayId, false).catch(() => {});
    }, CLOSE_SECONDS * 1000 + 20);
  }

  async open ({current, onPick} = {}) {
    this.onPick = onPick;
    let r = 255;
    let g = 255;
    let b = 255;
    let a = 255;
    if (typeof current === 'string') {
      const parts = current.split(/[,\s]+/).filter((part) => part.length > 0).map(Number);
      if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
        [r, g, b] = parts;
        if (parts.length > 3 && Number.isFinite(parts[3])) a = parts[3];
      }
    } else if (current && typeof current === 'object') {
      r = clampChannel(current.r);
      g = clampChannel(current.g);
      b = clampChannel(current.b);
      a = clampChannel(current.a ?? 255);
    }
    const {h, s, v} = rgbToHsv(clampChannel(r), clampChannel(g), clampChannel(b));
    this.hue = h;
    this.sat = s;
    this.val = v;
    this.alpha = clampChannel(a);
    this.svDragging = false;
    this.hueDragging = false;
    await this.syncFromHsv({hueChanged: true});
    const wasVisible = this.visible;
    await this.setVisible(true);
    if (!wasVisible) this.playOpen();
  }

  async close () {
    this.onPick = null;
    this.svDragging = false;
    this.hueDragging = false;
    if (this.visible) this.playClose();
  }

  async relayout (viewport) {
    this.viewport = viewport;
    await UI.setLayoutSize(this.windowId, this.overlayId, {x: viewport.x, y: viewport.y});
    await this.positionPanel();
  }
}
