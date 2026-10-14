#!/usr/bin/env node
/**
 * Builds the storefront bundle into the theme app extension and post-processes the loader.
 *
 *   node scripts/build-storefront.mjs            → extensions/embroidery-customizer/assets
 *   node scripts/build-storefront.mjs --theme    → also copies into the host theme's assets/
 *                                                  (for the theme-native homepage section)
 */
import { build } from 'vite';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extAssets = join(root, 'extensions/embroidery-customizer/assets');
const themeAssets = resolve(root, '..', 'assets');

// Theme app extensions only accept these asset types (no fonts, no .glb).
const ALLOWED = /\.(js|css|json|png|jpe?g|svg|wasm)$/;
const ours = (dir) => readdirSync(dir).filter((f) => f.startsWith('embroidery-'));

process.chdir(root);
// Start clean so renamed/removed chunks don't linger.
for (const f of ours(extAssets)) rmSync(join(extAssets, f));
await build({ configFile: join(root, 'vite.extension.config.ts'), logLevel: 'warn' });

// Shopify injects block JavaScript as a classic <script>; it may be included by several blocks.
// Wrap it so top-level bindings don't leak or collide, and make repeat inclusions a no-op.
const loaderPath = join(extAssets, 'embroidery-loader.js');
const loader = readFileSync(loaderPath, 'utf8');
if (!loader.startsWith('/*embroidery-loader*/')) {
  writeFileSync(
    loaderPath,
    `/*embroidery-loader*/(()=>{if(window.__embroideryLoader)return;window.__embroideryLoader=1;\n${loader}\n})();\n`,
  );
}

const files = ours(extAssets);
const rejected = files.filter((f) => !ALLOWED.test(f));
if (rejected.length) {
  console.error(`Shopify won't accept these extension assets: ${rejected.join(', ')}`);
  process.exit(1);
}
for (const f of files) {
  const kb = (readFileSync(join(extAssets, f)).length / 1024).toFixed(1);
  console.log(`  ${f.padEnd(56)} ${kb.padStart(8)} KB`);
}

if (process.argv.includes('--theme')) {
  if (!existsSync(themeAssets)) {
    console.error(`Theme assets folder not found at ${themeAssets}`);
    process.exit(1);
  }
  // Replace our previous build in the theme (fonts live inside JS chunks).
  for (const f of ours(themeAssets)) rmSync(join(themeAssets, f));
  for (const f of files) copyFileSync(join(extAssets, f), join(themeAssets, f));
  // Themes may ship .glb assets (the app block gets them from the app instead):
  // every calibrated garment, as embroidery-<garment>.glb.
  const models = readdirSync(join(root, 'public/models')).filter((f) => f.endsWith('.glb'));
  for (const m of models) copyFileSync(join(root, 'public/models', m), join(themeAssets, `embroidery-${m}`));
  console.log(`\nCopied ${files.length + models.length} files into the theme: ${themeAssets}`);
}
