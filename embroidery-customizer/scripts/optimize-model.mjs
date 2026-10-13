#!/usr/bin/env node
/**
 * Optimizes a source garment GLB for storefront delivery.
 *
 *   node scripts/optimize-model.mjs [source.glb] [output.glb]
 *
 * - Keeps geometry topology (no simplification) so embroidery decals stay calibrated.
 * - Keeps every original material + texture (base colour, normal, metallic/roughness),
 *   re-encoded as WebP (EXT_texture_webp) and capped at 1024px.
 * - Quantizes + meshopt-compresses vertex data (EXT_meshopt_compression).
 *   The viewer registers three's MeshoptDecoder, so this is supported out of the box.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, process.argv[2] ?? 'models/source/tshirt-source.glb');
const output = resolve(root, process.argv[3] ?? 'apps/demo/public/models/tshirt.glb');
const extensionCopy = resolve(
  root,
  'extensions/embroidery-customizer/assets/embroidery-tshirt.glb',
);

mkdirSync(dirname(output), { recursive: true });

const cli = resolve(root, 'node_modules/.bin/gltf-transform');
execFileSync(
  cli,
  [
    'optimize',
    source,
    output,
    '--compress',
    'meshopt',
    '--texture-compress',
    'webp',
    '--texture-size',
    '1024',
    '--simplify',
    'false',
    '--flatten',
    'false',
    '--join',
    'false',
    '--instance',
    'false',
    '--palette',
    'false',
    '--prune-solid-textures',
    'false',
  ],
  { stdio: 'inherit' },
);

try {
  mkdirSync(dirname(extensionCopy), { recursive: true });
  copyFileSync(output, extensionCopy);
} catch (error) {
  console.warn('Could not copy model into the theme extension assets:', error);
}

const kb = (file) => `${(statSync(file).size / 1024).toFixed(0)} KB`;
console.log(`\nSource:    ${kb(source)}  ${source}`);
console.log(`Optimized: ${kb(output)}  ${output}`);
