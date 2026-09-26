import * as UI from 'Helix/UserInterface';
import {FONT, TEXT, THEME, TRACK, TYPE} from '../theme.js';
import {createDevicePanel, DEVICE_PANEL_HEIGHT} from './devicePanel.js';
import {createPresetsPanel} from './presetsPanel.js';
import {createToggle} from './toggle.js';
import {hide, play, rise, transformHost} from './juice.js';

const PAD_X = 24;
const GAP = 18;

export async function createShell (win, {
  store,
  widgets,
  openColourPicker,
  size,
}) {
  const stage = await UI.createElement(win, {
    item: {size: {x: size.x, y: size.y}},
    layout: {type: 'none'},
  });
  await UI.attachRoot(win, stage);

  const root = await UI.createElement(win, {
    item: {size: {x: size.x, y: size.y}},
    renderable: {
      type: 'box',
      aabb: {min: {x: 0, y: 0}, max: {x: size.x, y: size.y}},
      colour: THEME.shell,
    },
    layout: {
      type: 'column',
      gap: GAP,
      padding: {t: 20, r: PAD_X, b: 20, l: PAD_X},
      alignItems: 'start',
    },
    contentAlign: 'fill',
  });
  await UI.attach(win, stage, root);
  // Kept hidden while building so the entrance starts from a clean frame.
  await play(win, root, [{time: 0.001, opacity: 0}]);

  const contentWidth = size.x - PAD_X * 2;

  const header = await UI.createElement(win, {
    item: {size: {x: contentWidth, y: 44}},
    renderable: transformHost(contentWidth, 44),
    layout: {type: 'row', gap: 12, alignItems: 'center'},
  });
  await UI.attach(win, root, header);

  const markId = await UI.createElement(win, {
    item: {size: {x: 3, y: 36}},
    renderable: {
      type: 'box',
      aabb: {min: {x: 0, y: 0}, max: {x: 3, y: 36}},
      colour: THEME.accent,
      cornerRadius: 1.5,
    },
  });
  await UI.attach(win, header, markId);
  await UI.setHitTarget(win, markId, false);

  const brandCol = await UI.createElement(win, {
    item: {flexGrow: 1, size: {y: 44}},
    layout: {type: 'column', gap: 4, alignItems: 'start'},
  });
  await UI.attach(win, header, brandCol);

  const brandId = await UI.createElement(win, {
    item: {size: {x: 320, y: 26}},
    renderable: {
      type: 'text',
      string: 'SHELLYHUB',
      font: FONT.display,
      size: TYPE.heading,
      colour: TEXT.primary,
      letterSpacing: TRACK.heading,
    },
    contentAlign: {x: 'start', y: 'centre'},
  });
  await UI.attach(win, brandCol, brandId);
  await UI.setHitTarget(win, brandId, false);

  const subtitleId = await UI.createElement(win, {
    item: {size: {x: 320, y: 14}},
    renderable: {
      type: 'text',
      string: 'RGBW LIGHTING CONTROL',
      font: FONT.label,
      size: TYPE.micro,
      colour: TEXT.accent,
      letterSpacing: TRACK.label,
    },
    contentAlign: {x: 'start', y: 'centre'},
  });
  await UI.attach(win, brandCol, subtitleId);
  await UI.setHitTarget(win, subtitleId, false);

  const allLabelId = await UI.createElement(win, {
    item: {size: {x: 36, y: 44}},
    renderable: {
      type: 'text',
      string: 'ALL',
      font: FONT.label,
      size: TYPE.micro,
      colour: TEXT.muted,
      letterSpacing: TRACK.label,
    },
    contentAlign: {x: 'end', y: 'centre'},
  });
  await UI.attach(win, header, allLabelId);
  await UI.setHitTarget(win, allLabelId, false);

  const allToggle = await createToggle(win, header, {
    width: 52,
    height: 28,
    onClick: () => {
      const anyOn = store.list().some((d) => d.on);
      store.applyAll({on: !anyOn}).catch(() => {});
    },
  });

  const separatorId = await widgets.createSeparator(root, contentWidth);
  await UI.setOrigin(win, separatorId, {x: 0, y: 0.5});

  const presetsPanel = await createPresetsPanel(win, root, {
    store,
    width: contentWidth,
    widgets,
  });

  const row = await UI.createElement(win, {
    item: {size: {x: contentWidth, y: DEVICE_PANEL_HEIGHT}},
    layout: {type: 'row', gap: 12, alignItems: 'start'},
  });
  await UI.attach(win, root, row);

  const devices = store.list();
  const gaps = 12 * Math.max(0, devices.length - 1);
  const panelWidth = Math.floor((contentWidth - gaps) / Math.max(1, devices.length));
  const devicePanels = [];
  for (const device of devices) {
    const panel = await createDevicePanel(win, row, {
      store,
      deviceId: device.id,
      width: panelWidth,
      openColourPicker,
    });
    devicePanels.push(panel);
  }

  // Modals need absolute positioning, which the flex column above ignores.
  const modalHost = await UI.createElement(win, {
    item: {size: {x: size.x, y: size.y}},
    layout: {type: 'none'},
  });
  await UI.attach(win, stage, modalHost);
  await UI.setHitTarget(win, modalHost, false);

  const cards = [...devicePanels.map((p) => p.root)];
  await Promise.all([
    play(win, header, [{time: 0.001, opacity: 0, position: {x: -16, y: 0}}]),
    play(win, separatorId, [{time: 0.001, scale: {x: 0, y: 1}}]),
    // Presets must not get position-keyed entrance anims — they desync the
    // clipped scroller's layout hits from what is drawn.
    play(win, presetsPanel.root, [{time: 0.001, opacity: 0}]),
    ...cards.map((id) => hide(win, id)),
  ]);
  await play(win, root, [{time: 0.001, opacity: 1}]);
  play(win, header, [
    {time: 0.45, opacity: 1, position: {x: 0, y: 0}, ease: 'outCubic'},
  ]);
  play(win, separatorId, [
    {time: 0, scale: {x: 0, y: 1}},
    {time: 0.1, scale: {x: 0, y: 1}},
    {time: 0.6, scale: {x: 1, y: 1}, ease: 'outQuart'},
  ]);
  play(win, presetsPanel.root, [
    {time: 0.2, opacity: 0},
    {time: 0.55, opacity: 1, ease: 'outCubic'},
  ]);
  cards.forEach((id, i) => rise(win, id, 0.14 + i * 0.07));

  async function refreshAllToggle () {
    const anyOn = store.list().some((d) => d.on);
    await allToggle.setOn(anyOn, THEME.accent);
  }

  async function refresh () {
    await presetsPanel.refresh();
    await refreshAllToggle();
    for (const panel of devicePanels) {
      await panel.refresh();
    }
  }

  return {root, modalHost, refresh};
}
