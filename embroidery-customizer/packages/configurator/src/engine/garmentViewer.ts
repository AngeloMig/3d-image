import {
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Euler,
  HemisphereLight,
  LinearSRGBColorSpace,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PMREMGenerator,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Spherical,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { ModelAdapter, NormalizedPoint, SurfaceConfig } from '@embroidery/shared';
import { buildDecalGeometry } from './decalGeometry';

export type ViewName = 'home' | 'front' | 'back';
export type Facing = 'front' | 'back' | 'side';

export interface DecalInput {
  canvas: HTMLCanvasElement;
  /** Bumped whenever the canvas pixels change. */
  version: number;
  surface: SurfaceConfig;
  center: NormalizedPoint;
  /** Full canvas size (incl. padding) in cm. */
  widthCm: number;
  heightCm: number;
  rotationDeg: number;
}

export interface ViewerCallbacks {
  onProgress?(ratio: number): void;
  onFacingChange?(facing: Facing): void;
  /** Cumulative drag delta in cm (screen-right / up positive) since the drag started. */
  onDesignDrag?(dxCm: number, dyCm: number, phase: 'start' | 'move' | 'end'): void;
  onContextLost?(): void;
}

export interface GarmentInfo {
  /** Dominant colour of the authored base-colour texture (for the "original" swatch). */
  originalColorHex: string | null;
  sizeWarning: string | null;
}

const TINT_UNIFORMS = Symbol('tint');

interface TintUniforms {
  uEmbTint: { value: Color };
  uEmbRefLum: { value: number };
  uEmbTintMix: { value: number };
}

/** Patch a PBR material so the base colour texture can be re-tinted while keeping its detail. */
function installTint(material: MeshStandardMaterial, refLum: number): TintUniforms {
  const uniforms: TintUniforms = {
    uEmbTint: { value: new Color(1, 1, 1) },
    uEmbRefLum: { value: Math.max(0.02, refLum) },
    uEmbTintMix: { value: 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uEmbTint;\nuniform float uEmbRefLum;\nuniform float uEmbTintMix;',
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float embLum = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  float embDetail = embLum / uEmbRefLum;
  // Body fabric: re-colour while keeping the authored shading (detail ratio around 1).
  vec3 embTinted = uEmbTint * min( embDetail, 1.15 );
  // Much brighter texels are authored trim / contrast stitching (ringer sleeves, V-neck,
  // seam threads): keep them as designed instead of flooding them with the new colour.
  float embBody = 1.0 - smoothstep( 1.7, 2.8, embDetail );
  sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, embTinted, uEmbTintMix * embBody );
  diffuseColor *= sampledDiffuseColor;
#endif`,
      );
  };
  material.customProgramCacheKey = () => 'embroidery-tint-v1';
  (material as unknown as Record<symbol, TintUniforms>)[TINT_UNIFORMS] = uniforms;
  material.needsUpdate = true;
  return uniforms;
}

/** Median luminance / colour of the base texture sampled where the mesh actually uses it. */
function analyseBaseColor(mesh: Mesh, map: Texture | null): { lum: number; hex: string | null } {
  const image = map?.image as CanvasImageSource | undefined;
  const uv = mesh.geometry.getAttribute('uv');
  const index = mesh.geometry.index;
  if (!image || !uv || typeof document === 'undefined') return { lum: 0.5, hex: null };
  try {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { lum: 0.5, hex: null };
    ctx.drawImage(image, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const samples: { lum: number; rgb: [number, number, number] }[] = [];
    const tri = index ? index.count / 3 : uv.count / 3;
    const toLinear = (c8: number) => {
      const s = c8 / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    for (let t = 0; t < tri; t += 1) {
      const ids = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k));
      const u = ids.reduce((s, i) => s + uv.getX(i), 0) / 3;
      const v = ids.reduce((s, i) => s + uv.getY(i), 0) / 3;
      // glTF UV origin is top-left (texture.flipY === false)
      const px = Math.min(size - 1, Math.max(0, Math.floor(u * size)));
      const py = Math.min(size - 1, Math.max(0, Math.floor((map!.flipY ? 1 - v : v) * size)));
      const o = (py * size + px) * 4;
      const rgb: [number, number, number] = [data[o]!, data[o + 1]!, data[o + 2]!];
      samples.push({
        lum: 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]),
        rgb,
      });
    }
    samples.sort((a, b) => a.lum - b.lum);
    const mid = samples[Math.floor(samples.length / 2)];
    if (!mid) return { lum: 0.5, hex: null };
    const hex = `#${mid.rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    return { lum: mid.lum, hex };
  } catch {
    return { lum: 0.5, hex: null };
  }
}

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class GarmentViewer {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(26, 1, 0.01, 100);
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly pmrem: PMREMGenerator;
  private readonly disposers: (() => void)[] = [];

  private model: Object3D | null = null;
  private meshes: Mesh[] = [];
  private tints: TintUniforms[] = [];
  private bounds = new Box3();
  private worldPerCm = 0.01;
  private homeDistance = 2;
  private normalMap: Texture | null = null;

  private decalMesh: Mesh | null = null;
  private decalMaterial: MeshStandardMaterial | null = null;
  private decalTexture: CanvasTexture | null = null;
  private decalKey = '';
  private decalVersion = -1;
  private decalSurface: SurfaceConfig | null = null;

  private frame = 0;
  private tween: { from: Spherical; to: Spherical; start: number; duration: number } | null = null;
  private facing: Facing = 'front';
  private dragEnabled = false;
  private drag: { pointerId: number; start: Vector3 } | null = null;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly adapter: ModelAdapter,
    private readonly callbacks: ViewerCallbacks = {},
  ) {
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const canvas = this.renderer.domElement;
    canvas.className = 'emb-viewer__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    this.pmrem = new PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    this.scene.environment = this.pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.85;
    envScene.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      (m.material as Material | undefined)?.dispose?.();
    });

    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(-1.2, 2, 2.4);
    const rim = new DirectionalLight(0xffffff, 0.9);
    rim.position.set(1.5, 1.2, -2);
    this.scene.add(key, rim, new HemisphereLight(0xffffff, 0x8a8478, 0.35));

    // Design drag listener must be registered BEFORE OrbitControls so it can veto orbiting.
    const onDown = (e: PointerEvent) => this.onPointerDown(e);
    const onMove = (e: PointerEvent) => this.onPointerMove(e);
    const onUp = (e: PointerEvent) => this.onPointerUp(e);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    this.disposers.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    });

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.8;
    this.controls.minPolarAngle = Math.PI / 2 - 0.65;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.45;
    const onChange = () => this.requestRender();
    this.controls.addEventListener('change', onChange);
    this.disposers.push(() => this.controls.removeEventListener('change', onChange));

    const onLost = (e: Event) => {
      e.preventDefault();
      this.callbacks.onContextLost?.();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    this.disposers.push(() => canvas.removeEventListener('webglcontextlost', onLost));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /* ------------------------------------------------------------------ loading */

  async load(url: string): Promise<GarmentInfo> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url, (e) => {
      if (e.lengthComputable && e.total > 0) this.callbacks.onProgress?.(e.loaded / e.total);
    });
    if (this.disposed) {
      gltf.scene.traverse((o) => this.disposeObject(o));
      throw new Error('Viewer was disposed while loading.');
    }

    const model = gltf.scene;
    const allowed = this.adapter.embroideryMeshNames;
    const meshes: Mesh[] = [];
    model.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    if (meshes.length === 0) throw new Error('The 3D model contains no meshes.');

    let originalColorHex: string | null = null;
    for (const mesh of meshes) {
      if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (!(mat instanceof MeshStandardMaterial)) continue;
        // Preserve authored PBR textures; only make sure they're filtered well at grazing angles.
        for (const tex of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap]) {
          if (tex) tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        }
        mat.side = DoubleSide;
        mat.roughness *= this.adapter.fabricRoughnessScale; // shader clamps the product to ≤ 1
        if (mat.normalMap && !this.normalMap) this.normalMap = mat.normalMap;
        const analysis = analyseBaseColor(mesh, mat.map);
        originalColorHex ??= analysis.hex;
        this.tints.push(installTint(mat, analysis.lum));
      }
    }
    this.meshes = allowed.length ? meshes.filter((m) => allowed.includes(m.name)) : meshes;

    // Centre the garment on the origin so the camera orbits its middle.
    const box = new Box3().setFromObject(model);
    const centre = box.getCenter(new Vector3());
    model.position.sub(centre);
    model.updateMatrixWorld(true);
    this.bounds.setFromObject(model);
    const size = this.bounds.getSize(new Vector3());
    const expected = this.adapter.expectedSize;
    this.worldPerCm = size.x / (expected.x * this.adapter.cmPerUnit);
    const ratioDrift =
      Math.abs(size.y / size.x - expected.y / expected.x) / (expected.y / expected.x);
    const sizeWarning =
      ratioDrift > 0.03
        ? `Model proportions differ from the "${this.adapter.id}" calibration by ${(ratioDrift * 100).toFixed(1)}% — check placements.`
        : null;
    if (sizeWarning) console.warn(`[embroidery] ${sizeWarning}`);

    this.model = model;
    this.scene.add(model);
    this.resize();
    this.setView('home', false);
    if (this.decalSurface) this.decalKey = ''; // rebuild any decal requested before load
    this.requestRender();
    return { originalColorHex, sizeWarning };
  }

  get isLoaded(): boolean {
    return this.model !== null;
  }

  /** Introspection for automated tests and debugging (no side effects). */
  debugState() {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const s = new Spherical().setFromVector3(offset);
    const decalGeometry = this.decalMesh?.geometry;
    let decalCenter: number[] | null = null;
    if (decalGeometry && this.decalMesh?.visible) {
      decalGeometry.computeBoundingBox();
      const c = decalGeometry.boundingBox!.getCenter(new Vector3());
      decalCenter = [c.x, c.y, c.z].map((n) => Math.round(n * 1000) / 1000);
    }
    return {
      loaded: this.isLoaded,
      theta: s.theta,
      phi: s.phi,
      distance: s.radius,
      homeDistance: this.homeDistance,
      facing: this.facing,
      bounds: this.bounds.isEmpty() ? null : [this.bounds.min.toArray(), this.bounds.max.toArray()],
      decalVisible: !!this.decalMesh?.visible,
      decalTriangles: decalGeometry ? decalGeometry.getAttribute('position').count / 3 : 0,
      decalCenter,
      tint: this.tints.map((t) => ({
        mix: t.uEmbTintMix.value,
        color: t.uEmbTint.value.getHexString(SRGBColorSpace),
      })),
      drawCalls: this.renderer.info.render.calls,
    };
  }

  /* ---------------------------------------------------------------- garment */

  /** null = original authored texture colour. */
  setGarmentColor(hex: string | null): void {
    for (const t of this.tints) {
      // setStyle converts the sRGB hex into the linear working colour space.
      if (hex) t.uEmbTint.value.setStyle(hex, SRGBColorSpace);
      t.uEmbTintMix.value = hex ? 1 : 0;
    }
    this.requestRender();
  }

  /* ----------------------------------------------------------------- decal */

  setDecal(input: DecalInput | null): void {
    if (!input) {
      if (this.decalMesh) this.decalMesh.visible = false;
      this.decalSurface = null;
      this.decalKey = '';
      this.requestRender();
      return;
    }
    this.decalSurface = input.surface;
    this.ensureDecalMaterial(input.canvas);

    if (input.version !== this.decalVersion && this.decalTexture) {
      if (this.decalTexture.image !== input.canvas) this.decalTexture.image = input.canvas;
      const img = this.decalTexture.image as HTMLCanvasElement;
      const sizeChanged =
        (this.decalTexture.userData.w as number | undefined) !== img.width ||
        (this.decalTexture.userData.h as number | undefined) !== img.height;
      if (sizeChanged) {
        // Immutable GPU storage: reallocate when the canvas dimensions change.
        this.decalTexture.dispose();
        this.decalTexture.userData.w = img.width;
        this.decalTexture.userData.h = img.height;
      }
      this.decalTexture.needsUpdate = true;
      this.decalVersion = input.version;
    }

    const key = [
      input.surface.id,
      input.center.x.toFixed(5),
      input.center.y.toFixed(5),
      input.widthCm.toFixed(3),
      input.heightCm.toFixed(3),
      input.rotationDeg,
    ].join('|');
    if (this.model && key !== this.decalKey) {
      this.rebuildDecal(input);
      this.decalKey = key;
    }
    this.requestRender();
  }

  private ensureDecalMaterial(canvas: HTMLCanvasElement): void {
    if (this.decalMaterial) return;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.premultiplyAlpha = true;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.userData.w = canvas.width;
    texture.userData.h = canvas.height;
    this.decalTexture = texture;

    let normalMap: Texture | null = null;
    if (this.normalMap) {
      normalMap = this.normalMap.clone();
      normalMap.channel = 1; // sample with the garment's own UVs (decal attribute `uv1`)
      normalMap.colorSpace = LinearSRGBColorSpace;
      normalMap.needsUpdate = true;
    }
    this.decalMaterial = new MeshStandardMaterial({
      map: texture,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      roughness: 0.52,
      metalness: 0,
      side: DoubleSide,
      normalMap,
    });
    if (normalMap) this.decalMaterial.normalScale.set(0.6, 0.6);
  }

  private normalizedToWorld(p: NormalizedPoint): Vector2 {
    const min = this.bounds.min;
    const size = this.bounds.getSize(new Vector3());
    return new Vector2(min.x + p.x * size.x, min.y + p.y * size.y);
  }

  /** Cast along the surface's facing axis to find the outermost garment point. */
  private surfacePoint(surface: SurfaceConfig, p: NormalizedPoint): Vector3 | null {
    const target = this.normalizedToWorld(p);
    const dir = surface.facing === '-z' ? new Vector3(0, 0, 1) : new Vector3(0, 0, -1);
    const originZ = surface.facing === '-z' ? this.bounds.min.z - 1 : this.bounds.max.z + 1;
    // Spiral search guards against tiny holes (e.g. the neckline) under the anchor.
    const step = this.worldPerCm * 0.75;
    for (let ring = 0; ring < 6; ring++) {
      const offsets =
        ring === 0
          ? [[0, 0]]
          : [
              [0, -ring],
              [ring, 0],
              [-ring, 0],
              [0, ring],
            ];
      for (const [dx, dy] of offsets) {
        this.raycaster.set(new Vector3(target.x + dx! * step, target.y + dy! * step, originZ), dir);
        const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
        if (hit) return new Vector3(target.x, target.y, hit.point.z);
      }
    }
    return null;
  }

  private rebuildDecal(input: DecalInput): void {
    const point = this.surfacePoint(input.surface, input.center);
    if (!point || !this.decalMaterial) return;
    const rotation = (-input.rotationDeg * Math.PI) / 180;
    const quaternion = new Quaternion().setFromEuler(
      input.surface.facing === '-z' ? new Euler(0, Math.PI, rotation) : new Euler(0, 0, rotation),
    );
    const size = new Vector3(
      input.widthCm * this.worldPerCm,
      input.heightCm * this.worldPerCm,
      this.adapter.decalDepthCm * this.worldPerCm,
    );
    // Only the garment mesh(es); decal geometry is produced in world space.
    let geometry = null;
    for (const mesh of this.meshes) {
      geometry = buildDecalGeometry(
        mesh,
        { position: point, quaternion, size },
        this.worldPerCm * 0.04,
      );
      if (geometry) break;
    }
    if (!geometry) return;
    if (!this.decalMesh) {
      this.decalMesh = new Mesh(geometry, this.decalMaterial);
      this.decalMesh.name = 'embroidery_decal';
      this.decalMesh.renderOrder = 2;
      this.scene.add(this.decalMesh);
    } else {
      this.decalMesh.geometry.dispose();
      this.decalMesh.geometry = geometry;
    }
    this.decalMesh.visible = true;
  }

  /* ---------------------------------------------------------------- camera */

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.bounds.isEmpty()) {
      const size = this.bounds.getSize(new Vector3());
      const tanV = Math.tan((this.camera.fov * Math.PI) / 360);
      const fitH = size.y / 2 / tanV;
      const fitW = Math.max(size.x, size.z) / 2 / (tanV * this.camera.aspect);
      const previousHome = this.homeDistance;
      // Extra margin on small/narrow stages where the toolbar and hint overlap the canvas.
      const margin = h < 420 ? 1.32 : 1.2;
      this.homeDistance = Math.max(fitH, fitW) * margin + size.z / 2;
      // Aim slightly below centre so the garment sits above the floating toolbar.
      const target = new Vector3(0, -size.y * (h < 420 ? 0.07 : 0.04), 0);
      this.camera.position.add(target.clone().sub(this.controls.target)); // keep the view direction
      this.controls.target.copy(target);
      this.controls.minDistance = this.homeDistance * 0.38;
      this.controls.maxDistance = this.homeDistance * 1.45;
      // Keep the same relative zoom when the container changes size.
      const current = this.camera.position.distanceTo(this.controls.target);
      if (current > 0 && previousHome > 0) {
        const ratio = current / previousHome;
        this.camera.position
          .sub(this.controls.target)
          .setLength(this.homeDistance * ratio)
          .add(this.controls.target);
      }
    }
    this.requestRender();
  }

  private viewSpherical(view: ViewName): Spherical {
    const theta = view === 'back' ? Math.PI : view === 'home' ? 0.38 : 0;
    const phi = view === 'home' ? Math.PI / 2 - 0.1 : Math.PI / 2 - 0.04;
    return new Spherical(this.homeDistance, phi, theta);
  }

  setView(view: ViewName, animate = true): void {
    const to = this.viewSpherical(view);
    const offset = this.camera.position.clone().sub(this.controls.target);
    const from = new Spherical().setFromVector3(offset);
    if (!animate || prefersReducedMotion() || from.radius === 0) {
      this.tween = null;
      this.camera.position.setFromSpherical(to).add(this.controls.target);
      this.camera.lookAt(this.controls.target);
      this.controls.update();
      this.requestRender();
      return;
    }
    // Take the short way round.
    let dTheta = to.theta - from.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    to.theta = from.theta + dTheta;
    this.tween = { from, to, start: performance.now(), duration: 650 };
    this.requestRender();
  }

  rotateBy(dTheta: number, dPhi = 0): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const s = new Spherical().setFromVector3(offset);
    s.theta += dTheta;
    s.phi = Math.min(
      this.controls.maxPolarAngle,
      Math.max(this.controls.minPolarAngle, s.phi + dPhi),
    );
    this.camera.position.setFromSpherical(s).add(this.controls.target);
    this.controls.update();
    this.requestRender();
  }

  zoomBy(factor: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const d = Math.min(
      this.controls.maxDistance,
      Math.max(this.controls.minDistance, offset.length() * factor),
    );
    this.camera.position.copy(this.controls.target).add(offset.setLength(d));
    this.controls.update();
    this.requestRender();
  }

  /* --------------------------------------------------------------- render */

  requestRender(): void {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => this.renderFrame());
  }

  private renderFrame(): void {
    this.frame = 0;
    if (this.disposed) return;
    let animating = false;
    if (this.tween) {
      const t = Math.min(1, (performance.now() - this.tween.start) / this.tween.duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      const s = new Spherical(
        this.tween.from.radius + (this.tween.to.radius - this.tween.from.radius) * e,
        this.tween.from.phi + (this.tween.to.phi - this.tween.from.phi) * e,
        this.tween.from.theta + (this.tween.to.theta - this.tween.from.theta) * e,
      );
      this.camera.position.setFromSpherical(s).add(this.controls.target);
      this.camera.lookAt(this.controls.target);
      if (t >= 1) this.tween = null;
      animating = true;
    }
    const moved = this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateFacing();
    if (animating || moved) this.requestRender();
  }

  private updateFacing(): void {
    const dir = this.camera.position.clone().sub(this.controls.target);
    const theta = Math.atan2(dir.x, dir.z);
    const facing: Facing =
      Math.abs(theta) < 1.05 ? 'front' : Math.abs(theta) > Math.PI - 1.05 ? 'back' : 'side';
    if (facing !== this.facing) {
      this.facing = facing;
      this.callbacks.onFacingChange?.(facing);
    }
  }

  /** Snapshot of the current view as a data URL (used for review + cart thumbnails). */
  capture(maxSize = 360, view?: 'front' | 'back'): string | null {
    if (!this.model) return null;
    const saved = this.camera.position.clone();
    const tween = this.tween;
    this.tween = null;
    try {
      if (view) {
        this.camera.position.setFromSpherical(this.viewSpherical(view)).add(this.controls.target);
        this.camera.lookAt(this.controls.target);
      }
      this.renderer.render(this.scene, this.camera); // drawing buffer is valid right after render
      const src = this.renderer.domElement;
      const scale = Math.min(1, maxSize / Math.max(src.width, src.height));
      const c = document.createElement('canvas');
      c.width = Math.round(src.width * scale);
      c.height = Math.round(src.height * scale);
      c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', 0.85);
    } catch {
      return null;
    } finally {
      if (view) {
        this.camera.position.copy(saved);
        this.camera.lookAt(this.controls.target);
      }
      this.tween = tween;
      this.requestRender();
    }
  }

  /* ------------------------------------------------------- drag on garment */

  setDragEnabled(enabled: boolean): void {
    this.dragEnabled = enabled;
    if (!enabled) this.renderer.domElement.style.cursor = '';
  }

  private pointerRay(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private hitsDecal(e: PointerEvent): boolean {
    if (!this.decalMesh?.visible || !this.decalSurface) return false;
    this.pointerRay(e);
    const garment = this.raycaster.intersectObjects(this.meshes, false)[0];
    const decal = this.raycaster.intersectObject(this.decalMesh, false)[0];
    return !!decal && (!garment || decal.distance <= garment.distance + this.worldPerCm * 0.5);
  }

  private garmentPoint(e: PointerEvent): Vector3 | null {
    this.pointerRay(e);
    return this.raycaster.intersectObjects(this.meshes, false)[0]?.point ?? null;
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.dragEnabled || e.button !== 0 || !this.hitsDecal(e)) return;
    const start = this.garmentPoint(e);
    if (!start) return;
    this.controls.enabled = false; // checked by OrbitControls in its own pointerdown handler
    this.drag = { pointerId: e.pointerId, start };
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.renderer.domElement.style.cursor = 'grabbing';
    this.callbacks.onDesignDrag?.(0, 0, 'start');
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.drag && e.pointerId === this.drag.pointerId) {
      const p = this.garmentPoint(e);
      if (!p) return;
      const mirror = this.decalSurface?.facing === '-z' ? -1 : 1;
      this.callbacks.onDesignDrag?.(
        ((p.x - this.drag.start.x) / this.worldPerCm) * mirror,
        (p.y - this.drag.start.y) / this.worldPerCm,
        'move',
      );
      return;
    }
    if (this.dragEnabled && e.pointerType === 'mouse' && e.buttons === 0) {
      this.renderer.domElement.style.cursor = this.hitsDecal(e) ? 'grab' : '';
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    this.controls.enabled = true;
    this.renderer.domElement.style.cursor = this.dragEnabled ? 'grab' : '';
    try {
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    this.callbacks.onDesignDrag?.(0, 0, 'end');
  }

  /* --------------------------------------------------------------- cleanup */

  private disposeObject(o: Object3D): void {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of materials) {
      if (!m) continue;
      for (const value of Object.values(m))
        if ((value as Texture | null)?.isTexture) (value as Texture).dispose();
      m.dispose();
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.disposers.forEach((d) => d());
    this.controls.dispose();
    if (this.model) this.model.traverse((o) => this.disposeObject(o));
    if (this.decalMesh) this.decalMesh.geometry.dispose();
    this.decalMaterial?.normalMap?.dispose();
    this.decalMaterial?.dispose();
    this.decalTexture?.dispose();
    this.scene.environment?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
