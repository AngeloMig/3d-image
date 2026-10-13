import { describe, expect, it } from 'vitest';
import {
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { buildDecalGeometry } from './decalGeometry';

/** Two parallel 1×1 panels: a "front" at z=+0.1 facing +Z and a "back" at z=-0.1 facing -Z. */
function garment() {
  const front = new PlaneGeometry(1, 1, 8, 8).translate(0, 0, 0.1);
  const back = new PlaneGeometry(1, 1, 8, 8).rotateY(Math.PI).translate(0, 0, -0.1);
  const merged = front.clone();
  // Simple manual merge of two indexed geometries.
  const pos = [...front.getAttribute('position').array, ...back.getAttribute('position').array];
  const nor = [...front.getAttribute('normal').array, ...back.getAttribute('normal').array];
  const uv = [...front.getAttribute('uv').array, ...back.getAttribute('uv').array];
  const offset = front.getAttribute('position').count;
  const idx = [...front.index!.array, ...[...back.index!.array].map((i) => i + offset)];
  merged.setAttribute('position', new Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  merged.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  merged.setIndex(idx);
  return new Mesh(merged, new MeshBasicMaterial({ side: DoubleSide }));
}

describe('buildDecalGeometry', () => {
  it('produces surface-hugging geometry clipped to the projector box', () => {
    const mesh = garment();
    const g = buildDecalGeometry(mesh, {
      position: new Vector3(0.1, 0.1, 0.1),
      quaternion: new Quaternion(),
      size: new Vector3(0.2, 0.1, 0.5), // deep enough to reach the back panel if culling failed
    })!;
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    expect(p.count).toBeGreaterThan(0);
    for (let i = 0; i < p.count; i++) {
      expect(p.getZ(i)).toBeCloseTo(0.1, 5); // only the front panel
      expect(p.getX(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(p.getX(i)).toBeLessThanOrEqual(0.2 + 1e-6);
      expect(uv.getX(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(uv.getX(i)).toBeLessThanOrEqual(1 + 1e-6);
    }
    expect(g.getAttribute('uv1')).toBeDefined();
  });

  it('projects onto the back when oriented backwards', () => {
    const g = buildDecalGeometry(garment(), {
      position: new Vector3(0, 0, -0.1),
      quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      size: new Vector3(0.2, 0.2, 0.5),
    })!;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) expect(p.getZ(i)).toBeCloseTo(-0.1, 5);
  });

  it('returns null when the box misses the mesh', () => {
    expect(
      buildDecalGeometry(garment(), {
        position: new Vector3(5, 5, 0),
        quaternion: new Quaternion(),
        size: new Vector3(0.1, 0.1, 0.1),
      }),
    ).toBeNull();
  });
});
