/* Assert UI Screens Verse codegen emits chrome-less native buttons.
   Run from plugin folder:
     node tools/check-button-codegen.mjs
*/
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const ui = join(here, '..', 'ui', 'js');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

const modelPath = join(ui, 'rgd', 'ui', '02-model.js');
const versePath = join(ui, 'rgd', 'ui', '06-verse.js');
if (!existsSync(modelPath) || !existsSync(versePath)) fail('missing codegen sources');

const modelSrc = readFileSync(modelPath, 'utf8');
const verseSrc = readFileSync(versePath, 'utf8');

/* Minimal shell so the IIFE-body fragments can run and export helpers. */
const sandbox = {
  console,
  Math,
  Number,
  String,
  Object,
  Array,
  uid: (p) => p + '_1',
  uiTheme: () => ({ type: { body: 16, h3: 24, small: 12, tiny: 11 }, color: {} }),
  uiSize: (s) => (typeof s === 'number' ? s : 16),
  uiHex6: (tok) => String(tok || 'FFFFFF').replace(/^#/, '').slice(0, 6),
  result: null,
};
sandbox.global = sandbox;

const harness = `
(function(){
${modelSrc}
${verseSrc}
  global.result = { uiVerseCanvasFile, uiVerseDeviceFile, UI_TYPES, UI_BUTTON_STYLE };
})();
`;

try {
  vm.runInNewContext(harness, sandbox, { filename: 'button-codegen-harness.js' });
} catch (e) {
  fail('harness eval failed: ' + e.message);
}

if (!sandbox.result || typeof sandbox.result.uiVerseCanvasFile !== 'function') {
  fail('uiVerseCanvasFile not exported from 06-verse.js');
}
if (typeof sandbox.result.uiVerseDeviceFile !== 'function') {
  fail('uiVerseDeviceFile not exported from 06-verse.js');
}
sandbox.uiVerseCanvasFile = sandbox.result.uiVerseCanvasFile;
sandbox.uiVerseDeviceFile = sandbox.result.uiVerseDeviceFile;

const fixture = {
  name: 'Button Fixture',
  stage: 'hub',
  category: 'menu',
  notes: 'codegen check',
  verse: {
    klass: 'button_fixture_canvas',
    folder: 'GameDevices/Gameplay/Screens/Hub',
    file: 'button_fixture_canvas.verse',
  },
  root: {
    id: 'root',
    type: 'canvas',
    name: 'Root',
    props: {},
    slot: {},
    children: [
      {
        id: 'row1',
        type: 'overlay',
        name: 'Row · Easy',
        bind: 'Diff0Btn',
        props: { asButton: true, variant: 'row' },
        slot: { h: 'Fill', v: 'Fill', pad: [0, 0, 0, 0], aMin: [0, 0], aMax: [0, 0], off: [0, 0, 0, 0], align: [0, 0], z: 0, stc: false, dist: null },
        children: [
          {
            id: 'bg',
            type: 'rect',
            name: 'bg',
            props: { color: '151D2C', opacity: 0.9, w: 1200, h: 132 },
            slot: { h: 'Fill', v: 'Fill', pad: [0, 0, 0, 0], aMin: [0, 0], aMax: [0, 0], off: [0, 0, 0, 0], align: [0, 0], z: 0, stc: false, dist: null },
            children: [],
          },
        ],
      },
      {
        id: 'back',
        type: 'button',
        name: '[Back]',
        bind: 'BackBtn',
        props: { variant: 'quiet', text: 'Back', w: 180, h: 48 },
        slot: { h: 'Fill', v: 'Fill', pad: [0, 0, 0, 0], aMin: [0, 0], aMax: [0, 0], off: [120, 28, 180, 48], align: [0, 0], z: 0, stc: false, dist: null },
        children: [],
      },
    ],
  },
};

const code = sandbox.uiVerseCanvasFile(fixture);

if (!code.includes('button{') && !code.includes('button:')) {
  fail('expected native button emission');
}
if (!code.includes('Slot := button_slot')) {
  fail('expected button_slot wrapper');
}
if (code.includes('button_loud') || code.includes('button_regular') || code.includes('button_quiet')) {
  fail('legacy text-button classes still emitted');
}
if (!code.includes('var Diff0Btn<public> : button')) {
  fail('asButton container bind should be typed as button');
}
if (!code.includes('var BackBtn<public> : button')) {
  fail('label button bind should be typed as button');
}
if (!code.includes('DefaultText :=') || !code.includes('text_block')) {
  fail('label should come from text_block, not button DefaultText alone');
}

const deviceCode = sandbox.uiVerseDeviceFile(fixture);
if (!deviceCode.includes('PlayerUI.SetFocus(Builder.Diff0Btn)')) {
  fail('modal with a button must emit PlayerUI.SetFocus(Builder.<firstBtn>)');
}
if (!deviceCode.includes('InputMode := ui_input_mode.All')) {
  fail('modal with a button must keep InputMode.All');
}

const noBtnFixture = {
  ...fixture,
  name: 'No Button Fixture',
  verse: { ...fixture.verse, klass: 'no_button_fixture_canvas', file: 'no_button_fixture_canvas.verse' },
  root: {
    ...fixture.root,
    children: [
      {
        id: 'label',
        type: 'text',
        name: 'Title',
        bind: 'TitleText',
        props: { text: 'Hello', size: 24, color: 'E8EDF7' },
        slot: { h: 'Fill', v: 'Fill', pad: [0, 0, 0, 0], aMin: [0, 0], aMax: [0, 0], off: [0, 0, 0, 0], align: [0, 0], z: 0, stc: false, dist: null },
        children: [],
      },
    ],
  },
};
const noBtnDevice = sandbox.uiVerseDeviceFile(noBtnFixture);
if (noBtnDevice.includes('PlayerUI.SetFocus(')) {
  fail('modal without a button must not emit SetFocus');
}
if (noBtnDevice.includes('InputMode := ui_input_mode.All')) {
  fail('modal without a button must not claim InputMode.All');
}
if (!noBtnDevice.includes('InputMode := ui_input_mode.None')) {
  fail('modal without a button must emit InputMode.None');
}

console.log('OK: button codegen emits chrome-less native button + button_slot');
console.log('OK: modal device emits SetFocus; buttonless modal uses InputMode.None');
console.log('binds: Diff0Btn, BackBtn');
