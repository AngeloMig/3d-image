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
import { buildDecalGeometry, mergeDecalGeometries } from './decalGeometry';

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

  it('handles fabric shells with inward normals and skips the inner layer', () => {
    // Outer layer at z=0.105 with normals pointing INTO the garment (common in CLO exports),
    // inner layer at z=0.1 with outward normals: only the outer (visible) one gets the decal.
    const outer = new PlaneGeometry(1, 1, 8, 8).translate(0, 0, 0.105);
    const n = outer.getAttribute('normal');
    for (let i = 0; i < n.count; i++) n.setZ(i, -1);
    const inner = new PlaneGeometry(1, 1, 8, 8).translate(0, 0, 0.1);
    const projector = {
      position: new Vector3(0, 0, 0.105),
      quaternion: new Quaternion(),
      size: new Vector3(0.2, 0.2, 0.1),
      orientation: -1 as const,
    };
    const onOuter = buildDecalGeometry(new Mesh(outer), projector)!;
    expect(onOuter.getAttribute('position').count).toBeGreaterThan(0);
    // Output normals face the viewer even though the mesh's point inwards.
    expect(onOuter.getAttribute('normal').getZ(0)).toBeCloseTo(1, 5);
    expect(buildDecalGeometry(new Mesh(inner), projector)).toBeNull();
    // Without a hint the majority inside the box decides (outer only → still found).
    const { orientation: _, ...noHint } = projector;
    expect(buildDecalGeometry(new Mesh(outer.clone()), noHint)).not.toBeNull();
  });

  it('merges pieces cut from several meshes', () => {
    const left = new PlaneGeometry(0.5, 1, 4, 8).translate(-0.25, 0, 0.1);
    const right = new PlaneGeometry(0.5, 1, 4, 8).translate(0.25, 0, 0.1);
    const projector = {
      position: new Vector3(0, 0, 0.1),
      quaternion: new Quaternion(),
      size: new Vector3(0.3, 0.2, 0.1),
    };
    const parts = [left, right].map((g) => buildDecalGeometry(new Mesh(g), projector)!);
    const counts = parts.map((g) => g.getAttribute('position').count);
    const merged = mergeDecalGeometries(parts)!;
    expect(merged.getAttribute('position').count).toBe(counts[0]! + counts[1]!);
    expect(merged.getAttribute('uv1').count).toBe(merged.getAttribute('position').count);
  });
});
