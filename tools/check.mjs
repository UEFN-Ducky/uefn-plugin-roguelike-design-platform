/* Self-check for the two rules that kept losing people's work.
   Run: node tools/check.mjs   (from the plugin folder)

   1. ONE write path: the panel writes design data through set_store and nothing else.
   2. A save can never happen before the store has been read, so a failed load
      cannot flush defaults over the design that is still on disk. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const ui = join(here, '..', 'ui');

/* Rebuild classic bundle from split sources before asserting. */
await import(pathToFileURL(join(here, 'bundle-ui.mjs')).href);

const html = readFileSync(join(ui, 'index.html'), 'utf8');
const bridge = readFileSync(join(ui, 'js', 'bridge.js'), 'utf8');
const parts = JSON.parse(readFileSync(join(ui, 'js', 'rgd-parts.json'), 'utf8')).parts;
assert.ok(Array.isArray(parts) && parts.length >= 2, 'rgd-parts.json missing parts');
const rgdSrc = readFileSync(join(ui, 'js', 'rgd.js'), 'utf8');
const partsJoined = parts.map((p) => readFileSync(join(ui, p), 'utf8').replace(/\s*$/, '')).join('\n\n');
assert.ok(rgdSrc.includes(partsJoined.slice(0, 200)), 'rgd.js does not start from bundled parts');
assert.match(rgdSrc, /document\.addEventListener\('DOMContentLoaded',\s*RGD\.init\)/, 'rgd.js missing DOMContentLoaded boot');
const allSrc = html + '\n' + bridge + '\n' + rgdSrc;

/* --- shell wiring ----------------------------------------------------- */
assert.match(html, /href="styles\.css"/, 'styles.css link missing');
assert.match(html, /src="js\/bridge\.js"/, 'bridge.js script missing');
assert.match(html, /src="js\/rgd\.js"/, 'rgd.js script missing');
assert.equal(html.includes('load-rgd.js'), false, 'fetch+eval loader must stay gone');
assert.equal((html.match(/<script>/g) || []).length, 0, 'inline <script> blocks should be gone');

/* --- rule 1: one store, one writer ------------------------------------ */
assert.equal(/localStorage\s*[.[]/.test(allSrc), false, 'a localStorage mirror is back — that is a second copy of the design');
const writeCalls = [...rgdSrc.matchAll(/rgdRpc\('set_store'/g)].length;
assert.equal(writeCalls, 1, `expected exactly 1 set_store call site, found ${writeCalls}`);
for (const tool of ['create_item', 'update_item', 'delete_item', 'create_npc', 'update_npc', 'delete_npc', 'create_level', 'update_level', 'delete_level', 'replace_state']) {
  assert.equal(rgdSrc.includes(`'${tool}'`), false, `panel still calls ${tool} — a second writer that clobbers set_store`);
}

/* --- load the panel module with a stub browser ------------------------ */
const sent = [];
const noop = () => {};
const el = new Proxy({}, {
  get: (_t, k) => (k === 'classList' ? { add: noop, remove: noop, toggle: noop, contains: () => false }
    : k === 'style' ? {}
    : k === 'dataset' ? {}
    : k === 'appendChild' || k === 'remove' || k === 'addEventListener' ? noop
    : k === 'querySelectorAll' ? () => []
    : ''),
  set: () => true,
});
const ctx = {
  console,
  crypto: { randomUUID: () => 'id-' + Math.random() },
  setTimeout,
  clearTimeout,
  document: { addEventListener: noop, getElementById: () => el, querySelectorAll: () => [], createElement: () => el, visibilityState: 'visible', body: el },
  lucide: { createIcons: noop },
  parent: { postMessage: (msg) => sent.push(msg) },
};
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.window.addEventListener = noop;
vm.createContext(ctx);
vm.runInContext(bridge, ctx);
vm.runInContext(rgdSrc, ctx);
// top-level `const RGD` lives in the context's lexical scope, not on the global object
const RGD = vm.runInContext('RGD', ctx);
assert.ok(RGD, 'panel module did not load');

/* --- rule 1b: legacy categories fold into the drop categories -------- */
const cases = [
  [{ name: 'Health Potion', category: 'Consumable', stats: { hp: 25 } }, 'Health'],
  [{ name: 'Iron Shield', category: 'Armor', stats: { defense: 4 } }, 'Shield'],
  [{ name: 'Swift Boots', category: 'Armor', stats: { speed: 60 } }, 'Speed'],
  [{ name: 'Damage Charm', category: 'Relic', stats: { attack: 5 } }, 'Damage'],
  [{ name: 'Scroll: Burn Infusion', category: 'Wizardry Scroll', stats: {} }, 'Scroll'],
  [{ name: 'Boss Key', category: 'Key', stats: {} }, 'Utility'],
  [{ name: 'Anything', category: 'Health', stats: {} }, 'Health'],
  [{ name: 'Gold Purse', category: 'Currency', stats: {}, currencyReward: { gold: 25 } }, 'Currency'],
  [{ name: 'Coin Pile', category: 'Consumable', stats: {}, currencyReward: { gold: 10 } }, 'Currency'],
];
for (const [drop, want] of cases) {
  assert.equal(RGD._dropCategory(drop), want, `${drop.name} should categorise as ${want}`);
}
assert.equal(html.includes('tab-currencies'), true, 'Currencies pane missing');
assert.equal(rgdSrc.includes("id:'currencies'"), true, 'Currencies nav tab missing');
assert.equal(rgdSrc.includes('currencyReward'), true, 'drops must carry currencyReward');
assert.equal(rgdSrc.includes('currencyDrop'), true, 'NPCs must carry currencyDrop');
assert.equal(html.includes('tab-progression'), true, 'Progression pane missing');
assert.equal(rgdSrc.includes("id:'progression'"), true, 'Progression nav tab missing');
assert.equal(rgdSrc.includes('prog-tree-world'), true, 'skill tree canvas missing');
assert.equal(typeof RGD._scaleAtLevel, 'function', 'scaling helper missing');
assert.equal(RGD._scaleAtLevel({base:20, perLevel:2.5, curve:'linear'}, 5), 30, 'linear damage at lv5');
assert.equal(typeof RGD._totalPointsAtLevel, 'function', 'points helper missing');

/* --- rule 1c: NPC type + role taxonomy -------------------------------- */
const npcCases = [
  [{ type: 'Enemy', behavior: 'Melee Chaser', stats: { range: 220 } }, 'Enemy', 'Melee'],
  [{ type: 'Elite', behavior: 'Heavy Charger', stats: {} }, 'Elite', 'Charger'],
  [{ type: 'Boss', behavior: 'Boss Slam', stats: { range: 320 } }, 'Boss', 'Melee'],
  [{ type: 'Merchant', behavior: 'Shopkeep', stats: {} }, 'Friendly', 'Support'],
  [{ type: 'Ally', behavior: 'Quest Giver', stats: {} }, 'Friendly', 'Civilian'],
  [{ type: 'Friendly', role: 'Support', behavior: 'Friendly Caster', stats: {} }, 'Friendly', 'Support'],
  [{ type: 'Enemy', behavior: 'Ranged Kiter', stats: { range: 2600 } }, 'Enemy', 'Ranged'],
  [{ type: 'Enemy', behavior: 'Caster', stats: { range: 2000 } }, 'Enemy', 'Caster'],
];
for (const [npc, wantType, wantRole] of npcCases) {
  assert.equal(RGD._npcType(npc), wantType, `${npc.behavior||npc.type} type → ${wantType}`);
  assert.equal(RGD._npcRole(npc), wantRole, `${npc.behavior||npc.type} role → ${wantRole}`);
}

/* --- rule 2: no write before the store has been read ----------------- */
assert.equal(RGD._hydrated(), false, 'panel should start un-hydrated');
const before = sent.length;
const res = await RGD._save({ flush: true });
assert.equal(res.ok, false, 'save before load must be refused, and never reported as ok');
assert.match(res.error, /not loaded/i, `unexpected refusal reason: ${res.error}`);
assert.equal(sent.length, before, 'refused save must not send anything to the backend');

/* --- rule 3: nothing may be gated on the main-window host object. It is absent in
   this sandboxed panel, which is what sent edits to a browser-only copy instead of
   the project store, and made build/spawn buttons run the local simulation. */
assert.equal(/\bhosted\(\)/.test(allSrc), false, 'panel is gating on the main-window host object again');

console.log('check.mjs OK —', cases.length, 'drop categories,', npcCases.length, 'npc taxonomies, one write path, write gated on load,', parts.length, 'ui parts → rgd.js');
