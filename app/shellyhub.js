import * as Log from 'Helix/Log';
import * as Compositor from 'Koya/Compositor';
import * as Event from 'Helix/Event';
import * as Engine from 'Helix/Engine';
import {WINDOW_SIZE, POLL_MS} from './config.js';
import {THEME} from './theme.js';
import {createStore} from './store.js';
import {UiWidgets} from './ui/widgets.js';
import {ColourPickerModal} from './ui/colour_picker.js';
import {createShell} from './ui/shell.js';
import {resetCursor} from './ui/cursor.js';

export default function main () {
  Log.info('[shellyHub] main()');
  (async () => {
    try {
      const displays = await Compositor.listDisplays();
      const display = displays.length > 0 ? displays[0].display : '';
      const win = await Compositor.createWindow({
        role: 'window',
        title: 'ShellyHub',
        appId: 'org.shellyhub.app',
        size: WINDOW_SIZE,
        display,
        msaaSamples: 4,
        acceptPointerEvents: true,
        keyboardInteractivity: 'on_demand',
      });
      await Compositor.setClearColor(win, THEME.shell[0], THEME.shell[1], THEME.shell[2], 1.0);

      const store = createStore();
      const widgets = new UiWidgets({windowId: win});
      const colourPicker = new ColourPickerModal({
        widgets,
        viewport: {x: WINDOW_SIZE.x, y: WINDOW_SIZE.y},
      });

      let colourTargetId = null;
      const openColourPicker = ({targetId, current, onPick}) => {
        colourTargetId = targetId;
        store.setColourModalOpen(targetId, true);
        colourPicker.open({
          current,
          onPick: (value) => {
            store.setColourModalOpen(colourTargetId || 'all', false);
            colourTargetId = null;
            if (typeof onPick === 'function') onPick(value);
          },
        }).catch((error) => Log.error('[shellyHub] colour picker open failed: ' + error));
      };

      const originalClose = colourPicker.close.bind(colourPicker);
      colourPicker.close = async () => {
        if (colourTargetId) {
          store.setColourModalOpen(colourTargetId, false);
          colourTargetId = null;
        }
        await originalClose();
        await resetCursor(win);
      };

      const shell = await createShell(win, {
        store,
        widgets,
        openColourPicker,
        size: WINDOW_SIZE,
      });
      await colourPicker.create(shell.modalHost);
      await store.refreshAll();
      await shell.refresh();

      let refreshQueued = false;
      store.subscribe(() => {
        if (refreshQueued) return;
        refreshQueued = true;
        setTimeout(() => {
          refreshQueued = false;
          shell.refresh().catch((error) => Log.error('[shellyHub] UI refresh failed: ' + error));
        }, 0);
      });

      let pollTimer = null;
      const schedulePoll = () => {
        pollTimer = setTimeout(async () => {
          try {
            await store.refreshAll();
          } catch (error) {
            Log.error('[shellyHub] poll failed: ' + error);
          }
          schedulePoll();
        }, POLL_MS);
      };
      schedulePoll();

      Event.on('windowClosed', ({id}) => {
        if (id !== win) return;
        if (pollTimer) clearTimeout(pollTimer);
        store.stop();
        Engine.quit();
      });

      Log.info('[shellyHub] ready');
    } catch (error) {
      Log.error('[shellyHub] bootstrap failed: ' + error);
      try {
        Engine.quit();
      } catch (_) {}
    }
  })();
}
