/* Concatenate ui/js/rgd/*.js → ui/js/rgd.js for classic <script src>.
   Run: node tools/bundle-ui.mjs   (from the plugin folder) */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ui = join(here, '..', 'ui');
const manifest = JSON.parse(readFileSync(join(ui, 'js', 'rgd-parts.json'), 'utf8'));
const parts = manifest.parts;
if (!Array.isArray(parts) || !parts.length) {
  throw new Error('rgd-parts.json has no parts');
}

const body = parts.map((p) => readFileSync(join(ui, p), 'utf8').replace(/\s*$/, '')).join('\n\n');
const out = `${body}\n\ndocument.addEventListener('DOMContentLoaded', RGD.init);\n`;
const dest = join(ui, 'js', 'rgd.js');
writeFileSync(dest, out, 'utf8');
console.log('bundle-ui: wrote', dest, '(' + parts.length + ' parts)');
