import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix3,
  Matrix4,
  Vector3,
  type Mesh,
  type Quaternion,
} from 'three';

export interface DecalProjector {
  /** World-space centre of the projector box (a point on the garment surface). */
  position: Vector3;
  /** World-space orientation; the box's local +Z points out of the surface towards the viewer. */
  quaternion: Quaternion;
  /** Box size in world units: x = width, y = height, z = projection depth. */
  size: Vector3;
  /**
   * Orientation of the visible fabric surface: 1 = its normals point towards the projector,
   * -1 = away (inward-facing export). Triangles of the other orientation (the inner side of a
   * two-sided fabric shell) are skipped. Omitted = decided by majority inside the box.
   */
  orientation?: 1 | -1;
}

/** One clipped polygon vertex carrying every attribute we interpolate. */
interface ClipVertex {
  p: [number, number, number]; // projector space
  w: [number, number, number]; // world position
  n: [number, number, number]; // world normal
  uv: [number, number]; // source mesh uv (for the garment normal map)
}

const lerp3 = (a: number[], b: number[], t: number): [number, number, number] => [
  a[0]! + (b[0]! - a[0]!) * t,
  a[1]! + (b[1]! - a[1]!) * t,
  a[2]! + (b[2]! - a[2]!) * t,
];

function lerpVertex(a: ClipVertex, b: ClipVertex, t: number): ClipVertex {
  return {
    p: lerp3(a.p, b.p, t),
    w: lerp3(a.w, b.w, t),
    n: lerp3(a.n, b.n, t),
    uv: [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t],
  };
}

/** Sutherland–Hodgman clip of a convex polygon against `axis * sign <= half`. */
function clipPolygon(
  poly: ClipVertex[],
  axis: 0 | 1 | 2,
  sign: 1 | -1,
  half: number,
): ClipVertex[] {
  const out: ClipVertex[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!;
    const prev = poly[(i + poly.length - 1) % poly.length]!;
    const dc = cur.p[axis] * sign - half;
    const dp = prev.p[axis] * sign - half;
    if (dc <= 0) {
      if (dp > 0) out.push(lerpVertex(prev, cur, dp / (dp - dc)));
      out.push(cur);
    } else if (dp <= 0) {
      out.push(lerpVertex(prev, cur, dp / (dp - dc)));
    }
  }
  return out;
}

/**
 * Projects an oriented box onto a mesh and returns geometry that hugs the real surface.
 * - `uv`  : decal texture coordinates (0..1 across the box)
 * - `uv1` : the garment's own UVs, so the decal can reuse the fabric normal map
 * Triangles facing away from the projector (inner/back panels) are skipped.
 */
export function buildDecalGeometry(
  mesh: Mesh,
  projector: DecalProjector,
  surfaceOffset = 0,
): BufferGeometry | null {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  if (!position || !normal) return null;

  mesh.updateWorldMatrix(true, false);
  const world = mesh.matrixWorld;
  const normalMatrix = new Matrix3().getNormalMatrix(world);
  const projectorMatrix = new Matrix4().compose(
    projector.position,
    projector.quaternion,
    new Vector3(1, 1, 1),
  );
  const toProjector = projectorMatrix.clone().invert();
  const projectorRotationInv = new Matrix3().setFromMatrix4(toProjector);

  const count = position.count;
  const pw = new Float32Array(count * 3); // world
  const pp = new Float32Array(count * 3); // projector
  const nw = new Float32Array(count * 3); // world normals
  const npz = new Float32Array(count); // normal z in projector space
  const v = new Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(world);
    pw.set([v.x, v.y, v.z], i * 3);
    v.applyMatrix4(toProjector);
    pp.set([v.x, v.y, v.z], i * 3);
    v.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
    nw.set([v.x, v.y, v.z], i * 3);
    npz[i] = v.applyMatrix3(projectorRotationInv).z;
  }

  const hx = projector.size.x / 2;
  const hy = projector.size.y / 2;
  const hz = projector.size.z / 2;
  const index = geometry.index;
  const triCount = index ? index.count / 3 : count / 3;

  const outPos: number[] = [];
  const outNormal: number[] = [];
  const outUv: number[] = [];
  const outUv1: number[] = [];

  const vertexAt = (i: number): ClipVertex => ({
    p: [pp[i * 3]!, pp[i * 3 + 1]!, pp[i * 3 + 2]!],
    w: [pw[i * 3]!, pw[i * 3 + 1]!, pw[i * 3 + 2]!],
    n: [nw[i * 3]!, nw[i * 3 + 1]!, nw[i * 3 + 2]!],
    uv: uv ? [uv.getX(i), uv.getY(i)] : [0, 0],
  });

  const tri = (t: number): [number, number, number] =>
    index
      ? [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)]
      : [t * 3, t * 3 + 1, t * 3 + 2];
  // Cheap reject: all three vertices outside the same box plane.
  const outsideBox = (a: number, b: number, c: number) => {
    for (let axis = 0; axis < 3; axis++) {
      const h = axis === 0 ? hx : axis === 1 ? hy : hz;
      const va = pp[a * 3 + axis]!;
      const vb = pp[b * 3 + axis]!;
      const vc = pp[c * 3 + axis]!;
      if ((va > h && vb > h && vc > h) || (va < -h && vb < -h && vc < -h)) return true;
    }
    return false;
  };

  // Some exports (e.g. CLO fabric shells) have inward-pointing normals; they render fine
  // double-sided. Use the visible surface's orientation (or, failing that, the majority inside
  // the box) and treat it as facing outwards so the facing test and surface offset work.
  let facing = 0;
  if (projector.orientation === undefined)
    for (let t = 0; t < triCount; t++) {
      const [a, b, c] = tri(t);
      if (!outsideBox(a, b, c)) facing += npz[a]! + npz[b]! + npz[c]!;
    }
  const flip = projector.orientation ?? (facing < 0 ? -1 : 1);

  for (let t = 0; t < triCount; t++) {
    const [a, b, c] = tri(t);

    // Only surfaces that face the projector (skips inner fabric and the opposite panel).
    if ((flip * (npz[a]! + npz[b]! + npz[c]!)) / 3 < 0.08) continue;
    if (outsideBox(a, b, c)) continue;

    let poly = [vertexAt(a), vertexAt(b), vertexAt(c)];
    poly = clipPolygon(poly, 0, 1, hx);
    if (poly.length) poly = clipPolygon(poly, 0, -1, hx);
    if (poly.length) poly = clipPolygon(poly, 1, 1, hy);
    if (poly.length) poly = clipPolygon(poly, 1, -1, hy);
    if (poly.length) poly = clipPolygon(poly, 2, 1, hz);
    if (poly.length) poly = clipPolygon(poly, 2, -1, hz);
    if (poly.length < 3) continue;

    for (let k = 1; k < poly.length - 1; k++) {
      for (const pv of [poly[0]!, poly[k]!, poly[k + 1]!]) {
        const len = (Math.hypot(pv.n[0], pv.n[1], pv.n[2]) || 1) * flip;
        const nx = pv.n[0] / len;
        const ny = pv.n[1] / len;
        const nz = pv.n[2] / len;
        outPos.push(
          pv.w[0] + nx * surfaceOffset,
          pv.w[1] + ny * surfaceOffset,
          pv.w[2] + nz * surfaceOffset,
        );
        outNormal.push(nx, ny, nz);
        outUv.push(pv.p[0] / projector.size.x + 0.5, pv.p[1] / projector.size.y + 0.5);
        outUv1.push(pv.uv[0], pv.uv[1]);
      }
    }
  }

  if (outPos.length === 0) return null;
  const decal = new BufferGeometry();
  decal.setAttribute('position', new Float32BufferAttribute(outPos, 3));
  decal.setAttribute('normal', new Float32BufferAttribute(outNormal, 3));
  decal.setAttribute('uv', new Float32BufferAttribute(outUv, 2));
  decal.setAttribute('uv1', new Float32BufferAttribute(outUv1, 2));
  decal.computeBoundingSphere();
  return decal;
}

/**
 * Concatenates decal pieces cut from several garment meshes (a garment split into panels, or
 * one exported as several chunks) into one non-indexed geometry with the same attributes.
 */
export function mergeDecalGeometries(parts: BufferGeometry[]): BufferGeometry | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  const merged = new BufferGeometry();
  for (const [name, size] of [
    ['position', 3],
    ['normal', 3],
    ['uv', 2],
    ['uv1', 2],
  ] as const) {
    const arrays = parts.map((p) => p.getAttribute(name).array as Float32Array);
    const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let offset = 0;
    for (const a of arrays) {
      out.set(a, offset);
      offset += a.length;
    }
    merged.setAttribute(name, new Float32BufferAttribute(out, size));
  }
  for (const p of parts) p.dispose();
  return merged;
}
