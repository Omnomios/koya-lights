import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {test} from 'node:test';

// Exercise the real control code with a deterministic boundary around Koya's
// native UI. No display or reachable Shelly devices are required.
async function harness () {
  const handlers = new Map();
  const elements = new Map();
  let nextId = 1;
  const context = vm.createContext({setTimeout, clearTimeout});
  const exports = {
    async createElement (_win, options) {
      const id = nextId++;
      elements.set(id, options);
      return id;
    },
    async addAnimation () { return nextId++; },
  };
  for (const name of ['attach', 'setHitTarget', 'setBoxColour', 'setCircleColour', 'setTexture',
    'setTextString', 'setEnabled', 'setLayoutPosition', 'setLayoutSize', 'updateAnimation',
    'startAnimation', 'setOrigin', 'destroyElement']) exports[name] = async () => true;
  for (const kind of ['Press', 'Activate', 'Hover', 'Scroll']) {
    exports[`setOn${kind}`] = async (_win, id, fn) => {
      handlers.set(`${id}:${kind}`, fn);
      return true;
    };
  }
  const cache = new Map();
  function synthetic (id, values) {
    const mod = new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, {context, identifier: id});
    cache.set(id, mod);
  }
  synthetic('Helix/UserInterface', exports);
  synthetic('Helix/Log', {info: () => {}, warn: () => {}, error: assert.fail});
  synthetic('Koya/Compositor', {setCursor: async () => {}});
  synthetic('Koya/Image', {gradient: async () => {}});
  synthetic('/rom/std/koya-ui.js', {Element: {}});
  synthetic('/rom/std/koya-controls.js', {InputText: {}});
  async function load (id, parent = path.resolve('app/ui/test.js')) {
    const resolved = id.startsWith('.') ? path.resolve(path.dirname(parent), id) : id;
    if (cache.has(resolved)) return cache.get(resolved);
    const mod = new vm.SourceTextModule(await readFile(resolved, 'utf8'), {context, identifier: resolved});
    cache.set(resolved, mod);
    await mod.link((child, referring) => load(child, referring.identifier));
    return mod;
  }
  async function module (name) {
    const mod = await load(`./${name}.js`);
    await mod.evaluate();
    return mod.namespace;
  }
  async function emit (id, kind, phase, x = 0, y = 0, interactionId = 'finger-1') {
    const handler = handlers.get(`${id}:${kind}`);
    assert.ok(handler, `${kind} registered on ${id}`);
    await handler({kind: kind.toLowerCase(), phase, local: {x, y}, interactionId});
  }
  return {module, handlers, elements, emit, stub: synthetic};
}

async function sliderFixture () {
  const h = await harness();
  const {createSlider} = await h.module('slider');
  const changes = [], commits = [], cancellations = [];
  let held = false;
  const slider = await createSlider(1, 0, {
    width: 100, label: 'Brightness', value: 25,
    onChange: value => changes.push(value),
    onDragStart: () => { held = true; },
    onDragEnd: value => { held = false; commits.push(value); },
    onDragCancel: () => { held = false; cancellations.push(true); },
  });
  const id = Number([...h.handlers.keys()].find(key => key.endsWith(':Press')).split(':')[0]);
  return {...h, slider, id, changes, commits, cancellations, held: () => held};
}

test('slider keeps capture after hover leave and commits the final clamped release', async () => {
  const h = await sliderFixture();
  await h.emit(h.id, 'Press', 'start', 40);
  await h.emit(h.id, 'Hover', 'leave');
  assert.equal(h.held(), true);
  assert.equal(h.commits.length, 0);
  await h.emit(h.id, 'Press', 'change', 70);
  await h.emit(h.id, 'Press', 'end', 140);
  assert.equal(h.slider.getValue(), 100);
  assert.deepEqual(h.commits, [100]);
  assert.equal(h.held(), false);
});

test('slider cancellation restores the previous value without sending a command', async () => {
  const h = await sliderFixture();
  await h.emit(h.id, 'Press', 'start', 40);
  await h.emit(h.id, 'Press', 'change', 80);
  await h.emit(h.id, 'Press', 'cancel', -20);
  await h.emit(h.id, 'Press', 'end', 100); // stale release cannot commit
  assert.equal(h.slider.getValue(), 25);
  assert.equal(h.changes.at(-1), 25);
  assert.deepEqual(h.commits, []);
  assert.equal(h.cancellations.length, 1);
  assert.equal(h.held(), false);
  await h.emit(h.id, 'Press', 'start', 60);
  await h.emit(h.id, 'Press', 'end', 60);
  assert.deepEqual(h.commits, [60]);
});

test('a second contact cannot change or finish an owned slider', async () => {
  const h = await sliderFixture();
  await h.emit(h.id, 'Press', 'start', 40);
  for (const phase of ['start', 'change', 'end', 'cancel']) {
    await h.emit(h.id, 'Press', phase, 90, 0, 'finger-2');
  }
  assert.equal(h.slider.getValue(), 40);
  assert.equal(h.held(), true);
  await h.emit(h.id, 'Press', 'end', 45);
  assert.deepEqual(h.commits, [45]);
});

test('toggle actions use qualified activation and ignore hover movement', async () => {
  const h = await harness();
  const {createToggle} = await h.module('toggle');
  let clicks = 0;
  const toggle = await createToggle(1, 0, {onClick: () => { clicks++; }});
  assert.equal(h.handlers.has(`${toggle.shellId}:Press`), false);
  await h.emit(toggle.shellId, 'Hover', 'enter');
  await h.emit(toggle.shellId, 'Hover', 'move');
  await h.emit(toggle.shellId, 'Hover', 'leave');
  assert.equal(clicks, 0);
  await h.emit(toggle.shellId, 'Activate');
  assert.equal(clicks, 1);
});

test('colour surfaces clamp captured coordinates and recover after cancellation', async () => {
  const h = await harness();
  const {ColourPickerModal} = await h.module('colour_picker');
  const picker = new ColourPickerModal({widgets: {windowId: 1, captureUiPointer: async () => {}}, viewport: {x: 500, y: 500}});
  picker.syncFromHsv = async () => {};
  await picker.createSvBox(100);
  await picker.createHueStrip(100);
  await h.emit(picker.svShellId, 'Press', 'start', 25, 40);
  await h.emit(picker.svShellId, 'Hover', 'leave');
  await h.emit(picker.svShellId, 'Press', 'change', -40, 500);
  assert.equal(picker.sat, 0);
  assert.equal(picker.val, 0);
  await h.emit(picker.svShellId, 'Press', 'end', 150, -10);
  assert.equal(picker.sat, 1);
  assert.equal(picker.val, 1);
  await h.emit(picker.hueShellId, 'Press', 'start', 50);
  await h.emit(picker.hueShellId, 'Press', 'cancel');
  await h.emit(picker.hueShellId, 'Press', 'change', 80);
  assert.equal(picker.hue, 180);
  await h.emit(picker.hueShellId, 'Press', 'start', 0);
  await h.emit(picker.hueShellId, 'Press', 'end', 100);
  assert.equal(picker.hue, 359.999);
});

test('preset scrolling distinguishes wheel steps from touchpad pixels and captures scrollbar', async () => {
  const h = await harness();
  const {UiWidgets} = await h.module('widgets');
  const widgets = new UiWidgets({windowId: 1});
  let observed = 0;
  const area = await widgets.createScrollArea(0, {
    width: 200, height: 100, scrollbar: true, scrollStep: 20, smooth: false,
    onScroll: () => { observed++; },
  });
  await area.setContentHeight(400);
  const wheel = h.handlers.get(`${area.viewportId}:Scroll`);
  assert.equal(h.handlers.has(`${area.contentId}:Scroll`), false);
  await wheel({scroll: {x: 0, y: 2}, unit: 'step'});
  assert.equal(area.offset, 40);
  await wheel({scroll: {x: 0, y: 2.5}, unit: 'pixel'});
  assert.equal(area.offset, 42.5);
  await wheel({scroll: {x: 5, y: 0}, unit: 'pixel'});
  assert.equal(observed, 2);
  const scrollbar = Number([...h.handlers.keys()].find(key => key.endsWith(':Press')).split(':')[0]);
  await h.emit(scrollbar, 'Press', 'start', 0, 20);
  await h.emit(scrollbar, 'Press', 'change', 0, 150);
  assert.equal(area.offset, 300);
  await h.emit(scrollbar, 'Press', 'cancel');
  await h.emit(scrollbar, 'Press', 'change', 0, 0);
  assert.equal(area.offset, 300);
});

test('buttons register activation instead of triggering commands on press', async () => {
  const h = await harness();
  const {UiWidgets} = await h.module('widgets');
  let calls = 0;
  const button = await new UiWidgets({windowId: 1}).createButton({parentId: 0, text: 'Apply', width: 80, action: () => { calls++; }});
  assert.equal(h.handlers.has(`${button.shellId}:Press`), false);
  await h.emit(button.shellId, 'Hover', 'enter');
  await h.emit(button.shellId, 'Hover', 'leave');
  assert.equal(calls, 0);
  await h.emit(button.shellId, 'Activate');
  assert.equal(calls, 1);
});

test('startup waits for the engine ready event and reports initialization failures', async () => {
  const h = await harness();
  const failure = new Error('window initialization failed');
  let options;
  let ready;
  let quits = 0;
  const errors = [];
  h.stub('Koya/Compositor', {
    listDisplays: async value => { options = value; return [{display: 'test-display'}]; },
    createWindow: async () => { throw failure; },
  });
  h.stub('Helix/Log', {info: () => {}, error: message => errors.push(message)});
  h.stub('Helix/Engine', {quit: () => { quits++; }});
  h.stub('Helix/Event', {on: (event, callback) => {
    assert.equal(event, 'ready');
    ready = callback;
  }});
  h.stub(path.resolve('app/store.js'), {createStore: assert.fail});
  h.stub(path.resolve('app/ui/widgets.js'), {UiWidgets: class {}});
  h.stub(path.resolve('app/ui/colour_picker.js'), {ColourPickerModal: class {}});
  h.stub(path.resolve('app/ui/shell.js'), {createShell: assert.fail});
  h.stub(path.resolve('app/ui/cursor.js'), {resetCursor: assert.fail});
  const {default: main} = await h.module('../shellyhub');
  assert.equal(main(), undefined);
  assert.equal(options, undefined);
  assert.equal(typeof ready, 'function');
  await ready();
  assert.equal(options.backend, 'wayland');
  assert.equal(quits, 1);
  assert.match(errors[0], /window initialization failed/);
});
