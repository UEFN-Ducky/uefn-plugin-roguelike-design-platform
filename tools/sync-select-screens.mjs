/* Reseed class/difficulty/journey UI screens into store.json and write Verse canvases.
   Run: node tools/sync-select-screens.mjs
*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const plugin = join(here, '..');
const ui = join(plugin, 'ui', 'js');
const storePath =
  process.env.RGD_STORE ||
  'C:/Users/tas13/Documents/Fortnite Projects/Roguelike/.ducky/roguelike-design/store.json';
const projectRoot =
  process.env.UEFN_PROJECT ||
  'C:/Users/tas13/Documents/Fortnite Projects/Roguelike';

const IDS = ['scr_class_select', 'scr_difficulty', 'scr_journey_map'];

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

const tokensSrc = readFileSync(join(ui, 'rgd', 'ui', '01-tokens.js'), 'utf8');
const modelSrc = readFileSync(join(ui, 'rgd', 'ui', '02-model.js'), 'utf8');
const catalogueSrc = readFileSync(join(ui, 'rgd', 'ui', '03-catalogue.js'), 'utf8');
const verseSrc = readFileSync(join(ui, 'rgd', 'ui', '06-verse.js'), 'utf8');

const sandbox = {
  console,
  Math,
  Number,
  String,
  Object,
  Array,
  JSON,
  uid: (() => {
    let n = 0;
    return (p) => `${p || 'w'}_${++n}`;
  })(),
  state: { uiTheme: null },
  result: null,
};
sandbox.global = sandbox;

const harness = `
(function(){
${tokensSrc}
${modelSrc}
${catalogueSrc}
${verseSrc}
  global.result = { uiSeedScreens, uiVerseBundle };
})();
`;

try {
  vm.runInNewContext(harness, sandbox, { filename: 'sync-select-screens-harness.js' });
} catch (e) {
  fail('harness eval failed: ' + (e && e.stack ? e.stack : e));
}

if (!sandbox.result?.uiSeedScreens) fail('uiSeedScreens missing');
if (!existsSync(storePath)) fail('store not found: ' + storePath);

const store = JSON.parse(readFileSync(storePath, 'utf8'));
sandbox.state.uiTheme = store.uiTheme || null;
const seeded = sandbox.result.uiSeedScreens();
const byId = Object.fromEntries(seeded.filter((s) => s && s.id).map((s) => [s.id, s]));

if (!Array.isArray(store.uiScreens)) store.uiScreens = [];
const written = [];
const binds = {};

for (const id of IDS) {
  const fresh = byId[id];
  if (!fresh?.root) fail('seed missing ' + id);
  const idx = store.uiScreens.findIndex((s) => s && s.id === id);
  if (idx >= 0) {
    store.uiScreens[idx] = {
      ...store.uiScreens[idx],
      name: fresh.name,
      notes: fresh.notes,
      stage: fresh.stage,
      category: fresh.category,
      verse: fresh.verse,
      root: fresh.root,
    };
  } else {
    store.uiScreens.push(fresh);
  }
  const screen = store.uiScreens.find((s) => s.id === id);
  const bundle = sandbox.result.uiVerseBundle(screen);
  const canvasAbs = join(projectRoot, bundle.canvasPath);
  mkdirSync(dirname(canvasAbs), { recursive: true });
  writeFileSync(canvasAbs, bundle.canvasCode, 'utf8');
  written.push(bundle.canvasPath);
  binds[id] = (bundle.binds || []).map((b) => b.name).filter((n) => /Btn$/.test(n));
}

writeFileSync(storePath, JSON.stringify(store, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ ok: true, written, binds }, null, 2));
