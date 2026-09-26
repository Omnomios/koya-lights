import * as UI from 'Helix/UserInterface';
import * as Log from 'Helix/Log';
import {Element} from '/rom/std/koya-ui.js';
import {InputText} from '/rom/std/koya-controls.js';
import {FONT, LAYOUT, TEXT, TEXT_RGBA, THEME, TYPE} from '../theme.js';
import {cursorEnter, cursorExit, useCursor} from './cursor.js';
import {pressPop, scaleTo, transformHost, play} from './juice.js';

const HOVER_SCALE = 1.04;

function numberOr (value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function textOrBlank (value) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.length > 0 ? text : ' ';
}

export function requireElement (elementId, what) {
  const id = Number(elementId);
  if (Number.isFinite(id) && id > 0) return id;
  Log.error(`[shellyHub] element creation failed (${what}) id=${String(elementId)}`);
  return 0;
}

// Box-based panel chrome (no deepfield plate textures required).
export async function createSlicedPanel (windowId, element) {
  const {x: width, y: height} = element.item.size;
  const colour = element.renderable?.colour || THEME.modalPanel;
  const id = await UI.createElement(windowId, {
    ...element,
    renderable: {
      type: 'box',
      aabb: {min: {x: 0, y: 0}, max: {x: width, y: height}},
      colour,
      cornerRadius: element.renderable?.cornerRadius ?? LAYOUT.radius,
    },
  });
  return id;
}

// Bordered card: a 1px border colour frame around a filled body. Returns the
// body id, which carries the caller's layout.
export async function createCard (windowId, parentId, {
  width,
  height,
  fill = THEME.panel,
  border = THEME.border,
  radius = LAYOUT.radius,
  layout,
}) {
  const frameId = await UI.createElement(windowId, {
    item: {size: {x: width, y: height}},
    renderable: {
      type: 'box',
      aabb: {min: {x: 0, y: 0}, max: {x: width, y: height}},
      colour: border,
      cornerRadius: radius,
    },
    layout: {type: 'column', padding: {t: 1, r: 1, b: 1, l: 1}},
  });
  const bodyId = await UI.createElement(windowId, {
    item: {size: {x: width - 2, y: height - 2}},
    renderable: {
      type: 'box',
      aabb: {min: {x: 0, y: 0}, max: {x: width - 2, y: height - 2}},
      colour: fill,
      cornerRadius: Math.max(0, radius - 1),
    },
    layout,
  });
  await UI.attach(windowId, parentId, frameId);
  await UI.attach(windowId, frameId, bodyId);
  return {frameId, bodyId};
}

export class UiWidgets {
  constructor ({windowId, stdWindow = null}) {
    this.windowId = windowId;
    this.stdWindow = stdWindow || {
      id: windowId,
      createElement: (options = {}) => Element.create(windowId, options),
    };
    this.textCache = new Map();
  }

  async captureUiPointer (elementId) {
    if (!Number.isFinite(elementId) || elementId <= 0) return;
    await UI.setHitTarget(this.windowId, elementId, true);
  }

  async setText (elementId, text, options = {}) {
    const id = Number(elementId);
    if (!Number.isFinite(id) || id <= 0) {
      Log.error(`[shellyHub] text update skipped, bad element id=${String(elementId)}`);
      return;
    }
    const next = textOrBlank(text);
    if (!options.force && this.textCache.get(id) === next) return;
    await UI.setTextString(this.windowId, id, next)
      .then(() => {
        this.textCache.set(id, next);
      })
      .catch((error) => {
        this.textCache.delete(id);
        Log.error(`[shellyHub] text update failed element=${id}: ${error}`);
      });
  }

  async createSeparator (parentId, width) {
    const separatorId = await UI.createElement(this.windowId, {
      item: {size: {x: Math.max(1, width), y: 1}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: Math.max(1, width), y: 1}},
        colour: THEME.separator,
      },
    });
    await UI.attach(this.windowId, parentId, separatorId);
    return separatorId;
  }

  async createText (parentId, options = {}) {
    const item = options.item || {size: {x: 1, y: 18}};
    const textId = await UI.createElement(this.windowId, {
      item,
      renderable: {
        type: 'text',
        string: textOrBlank(options.string),
        font: options.font || FONT.body,
        size: options.size || TYPE.body,
        colour: options.colour || TEXT.primary,
        justify: options.justify || 'left',
      },
      contentAlign: options.contentAlign || {x: 'start', y: 'centre'},
    });
    requireElement(textId, `text "${textOrBlank(options.string)}"`);
    this.textCache.set(textId, textOrBlank(options.string));
    await Promise.all([
      UI.attach(this.windowId, parentId, textId),
      UI.setHitTarget(this.windowId, textId, false),
    ]);
    return textId;
  }

  async createButton ({
    parentId,
    text,
    width,
    height = LAYOUT.buttonHeight,
    action,
    active = false,
    compact = false,
    primary = false,
  }) {
    const safeWidth = Math.max(1, numberOr(width, 80));
    const safeHeight = Math.max(1, numberOr(height, LAYOUT.buttonHeight));
    const state = {hovered: false, active};
    const restBorder = primary ? THEME.accent : THEME.borderStrong;
    const restFill = primary ? THEME.buttonActive : THEME.button;

    const shellId = await UI.createElement(this.windowId, {
      item: {size: {x: safeWidth, y: safeHeight}},
      renderable: transformHost(safeWidth, safeHeight),
      layout: {type: 'none'},
    });
    const bgId = await UI.createElement(this.windowId, {
      item: {size: {x: safeWidth, y: safeHeight}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: safeWidth, y: safeHeight}},
        colour: active ? THEME.buttonActive : restFill,
        cornerRadius: LAYOUT.controlRadius,
      },
    });
    // inset > 0 renders a Box as a hollow ring, so the border is its own element.
    const borderId = await UI.createElement(this.windowId, {
      item: {size: {x: safeWidth, y: safeHeight}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: safeWidth, y: safeHeight}},
        colour: active ? THEME.accent : restBorder,
        inset: 1,
        cornerRadius: LAYOUT.controlRadius,
      },
    });
    const labelId = await UI.createElement(this.windowId, {
      item: {size: {x: safeWidth, y: safeHeight}},
      renderable: {
        type: 'text',
        string: text,
        font: FONT.label,
        size: compact ? TYPE.small : TYPE.body,
        colour: active || primary ? TEXT.active : TEXT.primary,
        justify: 'center',
      },
      contentAlign: {x: 'centre', y: 'centre'},
    });
    requireElement(labelId, `button label "${text}"`);
    this.textCache.set(labelId, text);

    const applyVisual = async () => {
      const fill = state.active
        ? THEME.buttonActive
        : (state.hovered ? THEME.buttonHover : restFill);
      const border = state.active || state.hovered ? THEME.accent : restBorder;
      await Promise.all([
        UI.setBoxColour(this.windowId, bgId, fill),
        UI.setBoxColour(this.windowId, borderId, border),
      ]);
    };

    await Promise.all([
      UI.attach(this.windowId, parentId, shellId),
      UI.attach(this.windowId, shellId, bgId),
      UI.attach(this.windowId, shellId, borderId),
      UI.attach(this.windowId, shellId, labelId),
      UI.setHitTarget(this.windowId, borderId, false),
      UI.setHitTarget(this.windowId, labelId, false),
      this.captureUiPointer(shellId),
      UI.setOnMouseEnter(this.windowId, shellId, async () => {
        state.hovered = true;
        cursorEnter(this.windowId, shellId);
        scaleTo(this.windowId, shellId, HOVER_SCALE);
        if (!state.active) await applyVisual();
      }),
      UI.setOnMouseExit(this.windowId, shellId, async () => {
        state.hovered = false;
        cursorExit(this.windowId, shellId);
        scaleTo(this.windowId, shellId, 1, 0.2);
        if (!state.active) await applyVisual();
      }),
      UI.setOnMouseDown(this.windowId, shellId, () => {
        pressPop(this.windowId, shellId, {rest: state.hovered ? HOVER_SCALE : 1});
        if (typeof action === 'function') action();
      }),
    ]);

    return {
      shellId,
      bgId,
      labelId,
      setActive: async (nextActive) => {
        state.active = nextActive === true;
        await applyVisual();
      },
      setText: async (nextText) => this.setText(labelId, nextText, {force: true}),
    };
  }

  async createInput ({
    parentId,
    width,
    placeholder,
    onCommit,
    value = '',
    font = FONT.mono,
    height = LAYOUT.inputHeight,
    textSize = 13,
    commitOnInput = true,
  }) {
    const safeWidth = Math.max(48, numberOr(width, 72));
    const safeHeight = Math.max(20, numberOr(height, LAYOUT.inputHeight));
    const fieldShellId = await createSlicedPanel(this.windowId, {
      item: {size: {x: safeWidth, y: safeHeight}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: safeWidth, y: safeHeight}},
        colour: THEME.inputBg,
        cornerRadius: LAYOUT.controlRadius,
      },
      layout: {type: 'none'},
    });
    const fieldShell = await Element.fromId(this.windowId, fieldShellId);
    await fieldShell.attach(parentId);
    await this.captureUiPointer(fieldShell.id);

    let input = null;
    await fieldShell.setOnMouseDown(async () => {
      if (input) await input.focus();
    });
    await useCursor(this.windowId, fieldShell.id, 'text');

    const focus = await Element.create(this.windowId, {
      item: {size: {x: safeWidth, y: safeHeight}},
      renderable: {
        type: 'box',
        aabb: {min: {x: 0, y: 0}, max: {x: safeWidth, y: safeHeight}},
        colour: THEME.inputFocus,
        cornerRadius: LAYOUT.controlRadius,
      },
      contentAlign: 'fill',
    });
    const foreground = await Element.create(this.windowId, {
      item: {size: {x: Math.max(1, safeWidth - 16), y: safeHeight}},
      renderable: {
        type: 'text',
        string: value || ' ',
        font,
        size: textSize,
        colour: TEXT.primary,
      },
      contentAlign: {x: 'start', y: 'centre'},
    });
    const commit = () => {
      if (typeof onCommit === 'function' && input) onCommit(input.getValue());
    };
    input = await InputText.create(this.stdWindow, {
      focus,
      foreground,
      size: {x: safeWidth, y: safeHeight},
      padding: {l: 8, r: 8, t: 0, b: 0},
      placeholder,
      value,
      textColour: TEXT_RGBA.primary,
      placeholderColour: TEXT_RGBA.muted,
      caretColour: THEME.accent,
      onInput: commitOnInput ? commit : null,
      onBlur: commit,
      onSubmit: () => {
        commit();
        input.blur();
      },
    });
    await input.master.attach(fieldShell);
    input.shellId = fieldShell.id;
    return input;
  }

  // Deepfield-style clipped scroll surface. Wheel on viewport or content moves
  // the content host via setLayoutPosition. Smooth scrolling uses a Koya
  // position clip (docs: animations are visual-only) to ease the jump while
  // layout/hits sit at the destination — same catch-up pattern as clip tests.
  async createScrollArea (parentId, {
    width,
    height,
    scrollbar = false,
    scrollStep = LAYOUT.scrollStep,
    smooth = true,
    smoothDuration = 0.2,
  }) {
    let safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const step = Math.max(1, numberOr(scrollStep, LAYOUT.scrollStep));
    const duration = Math.max(0.05, numberOr(smoothDuration, 0.2));
    const scrollbarWidth = 8;
    const [viewportId, contentId, scrollbarId, scrollbarTrackId, scrollbarThumbId] = await Promise.all([
      UI.createElement(this.windowId, {
        item: {size: {x: safeWidth, y: safeHeight}},
        clipToBounds: true,
        contentAlign: 'fill',
      }),
      // Transparent host so position keyframes can inherit onto column children.
      UI.createElement(this.windowId, {
        item: {size: {x: safeWidth, y: safeHeight}},
        renderable: {
          type: 'box',
          aabb: {min: {x: 0, y: 0}, max: {x: safeWidth, y: safeHeight}},
          colour: [0, 0, 0, 0],
        },
        contentAlign: 'fill',
        layout: {type: 'column', gap: LAYOUT.gap, alignItems: 'start'},
      }),
      scrollbar ? UI.createElement(this.windowId, {
        item: {size: {x: scrollbarWidth, y: safeHeight}},
        layout: {type: 'none'},
      }) : Promise.resolve(0),
      scrollbar ? UI.createElement(this.windowId, {
        item: {size: {x: 2, y: safeHeight}},
        contentAlign: 'fill',
        renderable: {
          type: 'box',
          aabb: {min: {x: 0, y: 0}, max: {x: 2, y: safeHeight}},
          colour: THEME.borderStrong,
        },
      }) : Promise.resolve(0),
      scrollbar ? UI.createElement(this.windowId, {
        item: {size: {x: 6, y: safeHeight}},
        contentAlign: 'fill',
        renderable: {
          type: 'box',
          aabb: {min: {x: 0, y: 0}, max: {x: 6, y: safeHeight}},
          colour: THEME.accent,
        },
      }) : Promise.resolve(0),
    ]);

    const state = {
      offset: 0,
      // Last settled (or in-flight target) used as the from-point when stacking wheel ticks.
      visual: 0,
      viewportHeight: safeHeight,
      contentHeight: safeHeight,
      draggingScrollbar: false,
    };

    const scrollbarMetrics = () => {
      const maxScroll = Math.max(0, state.contentHeight - state.viewportHeight);
      const thumbHeight = Math.min(
        state.viewportHeight,
        Math.max(24, Math.round(state.viewportHeight * state.viewportHeight / Math.max(1, state.contentHeight))),
      );
      return {
        maxScroll,
        thumbHeight,
        thumbTravel: Math.max(0, state.viewportHeight - thumbHeight),
      };
    };
    const applyScrollbar = async () => {
      if (!scrollbarId) return;
      const {maxScroll, thumbHeight, thumbTravel} = scrollbarMetrics();
      const thumbY = maxScroll > 0 ? Math.round((state.offset / maxScroll) * thumbTravel) : 0;
      await Promise.all([
        UI.setEnabled(this.windowId, scrollbarId, maxScroll > 0),
        UI.setLayoutSize(this.windowId, scrollbarId, {x: scrollbarWidth, y: state.viewportHeight}),
        UI.setLayoutSize(this.windowId, scrollbarTrackId, {x: 2, y: state.viewportHeight}),
        UI.setLayoutSize(this.windowId, scrollbarThumbId, {x: 6, y: thumbHeight}),
        UI.setLayoutPosition(this.windowId, scrollbarThumbId, {x: 2, y: thumbY}),
      ]);
    };
    const applyLayoutOffset = async (offset) => {
      await UI.setLayoutPosition(this.windowId, contentId, {x: 0, y: -offset});
      await applyScrollbar();
    };
    const setOffset = async (nextOffset, {animate = smooth} = {}) => {
      const maxScroll = Math.max(0, state.contentHeight - state.viewportHeight);
      const target = Math.max(0, Math.min(maxScroll, Number(nextOffset) || 0));
      const from = state.visual;
      const catchUp = target - from;
      state.offset = target;
      state.visual = target;

      if (!animate || Math.abs(catchUp) < 0.5) {
        await play(this.windowId, contentId, [{time: 0.001, position: {x: 0, y: 0}}]);
        await applyLayoutOffset(target);
        return;
      }

      // Layout/hits jump to the destination; a compensating position clip eases
      // the visible content from `from` → `target` (Koya anims do not move layout).
      await applyLayoutOffset(target);
      await play(this.windowId, contentId, [
        {time: 0.0, position: {x: 0, y: catchUp}},
        {time: duration, position: {x: 0, y: 0}, ease: 'outCubic'},
      ]);
    };
    const setContentHeight = async (nextHeight) => {
      state.contentHeight = Math.max(state.viewportHeight, numberOr(nextHeight, state.viewportHeight));
      await UI.setLayoutSize(this.windowId, contentId, {x: safeWidth, y: state.contentHeight});
      await setOffset(state.offset, {animate: false});
    };
    const setViewportHeight = async (nextHeight) => {
      state.viewportHeight = Math.max(1, numberOr(nextHeight, state.viewportHeight));
      await UI.setLayoutSize(this.windowId, viewportId, {x: safeWidth, y: state.viewportHeight});
      await setContentHeight(state.contentHeight);
    };
    const updateScrollbarFromPoint = (localPoint) => {
      const {maxScroll, thumbHeight, thumbTravel} = scrollbarMetrics();
      if (maxScroll <= 0 || thumbTravel <= 0) return;
      const pointY = Number(localPoint?.y);
      if (!Number.isFinite(pointY)) return;
      const thumbY = Math.max(0, Math.min(thumbTravel, pointY - (thumbHeight * 0.5)));
      setOffset((thumbY / thumbTravel) * maxScroll, {animate: false}).catch(() => {});
    };
    const endScrollbarDrag = () => {
      state.draggingScrollbar = false;
    };
    const onWheel = async (_windowPoint, _localPoint, delta) => {
      const rawDelta = typeof delta === 'object' && delta !== null
        ? Number(delta.y ?? delta.delta ?? delta.value)
        : Number(delta);
      if (!Number.isFinite(rawDelta) || rawDelta === 0) return;
      // Stack onto the in-flight target so rapid ticks keep accelerating.
      await setOffset(state.offset + (rawDelta * step), {animate: true});
    };

    await Promise.all([
      UI.attach(this.windowId, parentId, viewportId),
      UI.attach(this.windowId, viewportId, contentId),
      scrollbarId ? UI.attach(this.windowId, viewportId, scrollbarId) : Promise.resolve(),
      scrollbarId ? UI.attach(this.windowId, scrollbarId, scrollbarTrackId) : Promise.resolve(),
      scrollbarId ? UI.attach(this.windowId, scrollbarId, scrollbarThumbId) : Promise.resolve(),
      scrollbarId ? UI.setLayoutPosition(this.windowId, scrollbarId, {x: safeWidth - scrollbarWidth, y: 0}) : Promise.resolve(),
      scrollbarId ? UI.setLayoutPosition(this.windowId, scrollbarTrackId, {x: 4, y: 0}) : Promise.resolve(),
      scrollbarId ? UI.setHitTarget(this.windowId, scrollbarTrackId, false) : Promise.resolve(),
      scrollbarId ? UI.setHitTarget(this.windowId, scrollbarThumbId, false) : Promise.resolve(),
      scrollbarId ? this.captureUiPointer(scrollbarId) : Promise.resolve(),
      scrollbarId ? UI.setOnMouseDown(this.windowId, scrollbarId, (_windowPoint, localPoint) => {
        state.draggingScrollbar = true;
        updateScrollbarFromPoint(localPoint);
      }) : Promise.resolve(),
      scrollbarId ? UI.setOnMouseMove(this.windowId, scrollbarId, (_windowPoint, localPoint) => {
        if (state.draggingScrollbar) updateScrollbarFromPoint(localPoint);
      }) : Promise.resolve(),
      scrollbarId ? UI.setOnMouseUp(this.windowId, scrollbarId, endScrollbarDrag) : Promise.resolve(),
      scrollbarId ? UI.setOnMouseExit(this.windowId, scrollbarId, endScrollbarDrag) : Promise.resolve(),
      this.captureUiPointer(viewportId),
      UI.setOnMouseScroll(this.windowId, viewportId, onWheel),
      UI.setOnMouseScroll(this.windowId, contentId, onWheel),
    ]);
    await applyScrollbar();

    return {
      viewportId,
      contentId,
      contentWidth: safeWidth - (scrollbar ? scrollbarWidth : 0),
      get viewportHeight () { return state.viewportHeight; },
      get contentHeight () { return state.contentHeight; },
      get offset () { return state.offset; },
      setContentHeight,
      setViewportHeight,
      setOffset,
    };
  }
}
