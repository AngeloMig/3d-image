#!/usr/bin/env node
/**
 * Builds the storefront bundle into the theme app extension and post-processes the loader.
 *
 *   node scripts/build-storefront.mjs            → extensions/embroidery-customizer/assets
 *   node scripts/build-storefront.mjs --theme    → also copies into the host theme's assets/
 *                                                  (for the theme-native homepage section)
 */
import { build } from 'vite';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extAssets = join(root, 'extensions/embroidery-customizer/assets');
const themeAssets = resolve(root, '..', 'assets');

process.chdir(root);
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

const files = readdirSync(extAssets).filter((f) => f.startsWith('embroidery-'));
for (const f of files) {
  const kb = (readFileSync(join(extAssets, f)).length / 1024).toFixed(1);
  console.log(`  ${f.padEnd(56)} ${kb.padStart(8)} KB`);
}

if (process.argv.includes('--theme')) {
  if (!existsSync(themeAssets)) {
    console.error(`Theme assets folder not found at ${themeAssets}`);
    process.exit(1);
  }
  for (const f of files) copyFileSync(join(extAssets, f), join(themeAssets, f));
  console.log(`\nCopied ${files.length} files into the theme: ${themeAssets}`);
}
