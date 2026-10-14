#!/usr/bin/env node
/**
 * Turns the downloaded garment models into light storefront GLBs.
 *
 *   node scripts/prepare-garments.mjs            # all garments
 *   node scripts/prepare-garments.mjs polo       # one garment
 *
 * Sources live in models/source/raw/ (git-ignored, Sketchfab/CLO3D exports). For each garment:
 * - drops stitch-thread meshes (hundreds of thousands of triangles, invisible at web size),
 * - welds + simplifies the fabric (keeps UV seams and borders so textures and decals stay put),
 * - keeps every remaining material/texture, re-encoded as WebP ≤ 1024 px (normal maps 512 px),
 * - quantizes + meshopt-compresses vertex data.
 * Output: apps/demo/public/models/<id>.glb and public/models/<id>.glb (served by the app).
 */
import { mkdirSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** ratio = share of triangles kept by simplify (1 = no simplification). */
export const GARMENTS = [
  { id: 'crew-tee', source: 'tshirt.glb', drop: [], ratio: 0.12 },
  { id: 'sport-tee', source: 't-shirt.glb', drop: [/Topstitch/i], ratio: 1 },
  { id: 'polo', source: 'short_sleeve_polo.glb', drop: [], ratio: 0.15 },
  { id: 'long-sleeve', source: 'long_sleeve_t-_shirt.glb', drop: [/^Material2868$/], ratio: 0.15 },
];

const only = process.argv[2];
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const kb = (f) => `${(statSync(f).size / 1024).toFixed(0)} KB`;
const tris = (doc) =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);

for (const g of GARMENTS.filter((x) => !only || x.id === only)) {
  const src = join(root, 'models/source/raw', g.source);
  const doc = await io.read(src);
  const before = tris(doc);

  // 1. Drop stitch-thread meshes by material name.
  let dropped = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const names = mesh.listPrimitives().map((p) => p.getMaterial()?.getName() ?? '');
    if (names.length && names.every((n) => g.drop.some((re) => re.test(n)))) {
      node.setMesh(null);
      dropped += 1;
    }
  }

  // 2. Clean, weld, simplify, compress.
  await doc.transform(
    prune(),
    dedup(),
    weld(),
    ...(g.ratio < 1
      ? [
          simplify({
            simplifier: MeshoptSimplifier,
            ratio: g.ratio,
            error: 0.0008,
            lockBorder: true,
          }),
        ]
      : []),
    // Fabric weave (normal maps) is high-frequency noise: 512 px looks the same at web size.
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      slots: /^normalTexture$/,
      resize: [512, 512],
      quality: 82,
    }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );

  const out = join(root, 'apps/demo/public/models', `${g.id}.glb`);
  mkdirSync(dirname(out), { recursive: true });
  await io.write(out, doc);
  const appCopy = join(root, 'public/models', `${g.id}.glb`);
  mkdirSync(dirname(appCopy), { recursive: true });
  copyFileSync(out, appCopy);
  console.log(
    `${g.id.padEnd(12)} ${kb(src).padStart(9)} → ${kb(out).padStart(7)}  ` +
      `triangles ${Math.round(before).toLocaleString()} → ${Math.round(tris(doc)).toLocaleString()}` +
      (dropped ? `  (dropped ${dropped} stitch meshes)` : ''),
  );
}
