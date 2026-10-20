import * as THREE from 'three';
import { PhotoItem } from '../../services/photoSearchService';
import { createPhotoCardTexture } from './photoTextureGenerator';
import { Spring1D, Spring3D, APPLE_SPRINGS, decayVelocity } from './spatialPhysics';
import { spatialAudio } from '../../utils/audio';
import {
  calculateFocusEffect,
  calculateFacingWeight,
  wrapCoordinate,
  unwrapSpringBoundary,
  getSpherePoint,
  isDoubleClick,
  clampPanBounds,
} from './spatialMath';
import { LayoutDensityManager } from './layoutDensityManager';

export type SpatialMorphState = 'GRID' | 'CYLINDER' | 'SPHERE' | 'HELIX' | 'WAVE';

export interface SpatialCard {
  id: string;
  photo: PhotoItem;
  mesh: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  rimLine: THREE.LineLoop;
  springPos: Spring3D;
  springRot: Spring3D;
  springScale: Spring1D;
  targetScale: number;
  isHovered: boolean;
  isSelected: boolean;
  isFavorited: boolean;
  entranceDelay: number;
  opacitySpring: Spring1D;
  quaternionTarget: THREE.Quaternion;
}

const LAYOUT_NAMES: SpatialMorphState[] = ['GRID', 'CYLINDER', 'SPHERE', 'HELIX', 'WAVE'];

const LAYOUT_CAMERA_Z: Record<number, number> = {
  0: 7.2,  // GRID
  1: 8.8,  // CYLINDER (comfortable distance to view full multi-tier cylinder)
  2: 11.5, // SPHERE (Fixed sphere center at 0,0,0 with radius 6.8)
  3: 8.8,  // HELIX
  4: 8.5,  // WAVE
};

/**
 * Creates true 3D rounded plane geometry using THREE.Shape with normalized UV mapping
 */
function createRoundedCardGeometry(
  width: number,
  height: number,
  radius: number,
  segments = 32
): { geometry: THREE.ShapeGeometry; rimGeometry: THREE.BufferGeometry } {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const w = width;
  const h = height;
  const r = Math.min(radius, w / 2, h / 2);

  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + w, y + h - r);
  shape.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x + r, y + h);
  shape.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + r);
  shape.absarc(x + r, y + r, r, Math.PI, (Math.PI * 3) / 2, false);

  const geometry = new THREE.ShapeGeometry(shape, segments);

  const pos = geometry.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    uvs[i * 2] = (px - x) / w;
    uvs[i * 2 + 1] = (py - y) / h;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  const points = shape.getPoints(segments);
  const rimGeometry = new THREE.BufferGeometry().setFromPoints(points);

  return { geometry, rimGeometry };
}

/**
 * Generates an optical depth-of-field radial background gradient
 */
function createSpatialDepthBackgroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const cx = canvas.width / 2;
  const cy = canvas.height * 0.44;
  const radius = canvas.width * 0.75;

  const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, radius);
  grad.addColorStop(0, '#262a34');    // Soft luminous spatial center
  grad.addColorStop(0.36, '#191b22'); // Smooth depth charcoal
  grad.addColorStop(0.72, '#111217'); // Rich ambient slate
  grad.addColorStop(1.0, '#090a0d');  // Subtle optical vignette

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class PhotoWallScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animId: number | null = null;
  private clock: THREE.Clock;

  // Spatial Cards & Root Hierarchy
  private cards: SpatialCard[] = [];
  private cardGroup: THREE.Group;
  private groundReflection: THREE.Mesh | null = null;

  // Continuous Morphing Factor: 0 = Grid, 1 = Cylinder, 2 = Sphere, 3 = Helix, 4 = Wave
  private morphSpring: Spring1D;
  private currentMorphFactor = 1.0;

  // Camera distance spring
  private cameraZSpring: Spring1D;

  // Independent per-layout interaction transforms (DECOUPLED - NO ROTATION LEAKING!)
  private gridScrollY = 0;
  private gridTiltX = 0;
  private gridTiltY = 0;

  private cylinderAngle = 0;
  private sphereRotX = 0;
  private sphereRotY = 0;

  private helixScrollY = 0;
  private helixAngle = 0;

  private waveScrollX = 0;

  // Inertial Velocities
  private velocityX = 0;
  private velocityY = 0;

  // Ambient Movement (Silent, natural, pauses when user interacts)
  private ambientTime = 0;
  private ambientWeight = 1.0;
  private idleSeconds = 0;

  // Spatial Cursor Ring in 3D
  private spatialCursor: THREE.Mesh | null = null;

  // State
  private photos: PhotoItem[] = [];
  private selectedPhotoId: string | null = null;
  private hoveredPhotoId: string | null = null;
  private inspectRotX = 0;
  private inspectRotY = 0;

  // Detail Zoom State (Double click to zoom, single click to close)
  private isDetailZoomed = false;
  private detailPanX = 0;
  private detailPanY = 0;
  private clickTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastClickTimestamp = 0;
  private lastClickTargetId: string | null = null;
  private onDetailZoomCallback: ((isZoomed: boolean) => void) | null = null;

  private onSelectCallback: ((photo: PhotoItem | null) => void) | null = null;
  private onMorphProgressCallback: ((factor: number, stateName: SpatialMorphState) => void) | null = null;
  private onToggleZenCallback: (() => void) | null = null;
  private onFavoriteCallback: ((photoId: string, isFav: boolean) => void) | null = null;

  // Drag Pointer Tracking
  private isPointerDown = false;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Math helpers
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private tempMatrix = new THREE.Matrix4();
  private lookMatrix = new THREE.Matrix4();
  private qLook = new THREE.Quaternion();
  private qBase = new THREE.Quaternion();
  private qY180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  private upVec = new THREE.Vector3(0, 1, 0);

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();

    // 1. Scene with Rich Depth of Field Gradient (No pitch black!)
    this.scene = new THREE.Scene();
    this.scene.background = createSpatialDepthBackgroundTexture();
    this.scene.fog = new THREE.FogExp2(0x13151b, 0.015);

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
    this.camera.position.set(0, 0, LAYOUT_CAMERA_Z[1]);

    // 3. Renderer with high dynamic range and filmic tone
    const isHeadless = navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    container.appendChild(this.renderer.domElement);

    // 4. Clean Group Hierarchy: cardGroup is fixed at (0, 0, 0)
    this.cardGroup = new THREE.Group();
    this.scene.add(this.cardGroup);

    // 5. Springs
    this.morphSpring = new Spring1D(1.0, APPLE_SPRINGS.morph);
    this.cameraZSpring = new Spring1D(LAYOUT_CAMERA_Z[1], APPLE_SPRINGS.camera);

    this.initLighting();
    this.initGroundReflection();
    this.initSpatialCursor();
    this.bindEvents();

    this.animate = this.animate.bind(this);
    this.animId = requestAnimationFrame(this.animate);
  }

  private initLighting() {
    const hemiLight = new THREE.HemisphereLight(0xf5f7fb, 0x1b1d24, 1.25);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffefb, 1.35);
    keyLight.position.set(8, 14, 16);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdde4ec, 0.85);
    fillLight.position.set(-10, -5, 10);
    this.scene.add(fillLight);
  }

  private initGroundReflection() {
    const groundGeom = new THREE.PlaneGeometry(80, 80);
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0x181a21,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    this.groundReflection = new THREE.Mesh(groundGeom, groundMat);
    this.groundReflection.rotation.x = -Math.PI / 2;
    this.groundReflection.position.y = -6.8;
    this.scene.add(this.groundReflection);
  }

  private initSpatialCursor() {
    const ringGeom = new THREE.RingGeometry(0.08, 0.12, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.spatialCursor = new THREE.Mesh(ringGeom, ringMat);
    this.spatialCursor.renderOrder = 999;
    this.scene.add(this.spatialCursor);
  }

  /**
   * Set or update photo dataset using True 3D Rounded Geometry with clean borders
   */
  public setPhotos(photos: PhotoItem[]) {
    this.photos = photos;

    this.cards.forEach((c) => {
      this.cardGroup.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh.material.dispose();
      c.rimLine.geometry.dispose();
      (c.rimLine.material as THREE.Material).dispose();
    });
    this.cards = [];

    // 3D Rounded Card Geometry: 3.65 x 2.48 with generous smooth corner radius 0.32
    const cardWidth = 3.65;
    const cardHeight = 2.48;
    const cardCornerRadius = 0.32;
    const { geometry, rimGeometry } = createRoundedCardGeometry(cardWidth, cardHeight, cardCornerRadius, 32);

    photos.forEach((photo, idx) => {
      const texture = createPhotoCardTexture(photo, false, false);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: true,
        depthTest: true,
        alphaTest: 0.05,
      });

      const mesh = new THREE.Mesh(geometry.clone(), mat);
      mesh.userData = { photoId: photo.id };

      const rimMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: false,
      });
      const rimLine = new THREE.LineLoop(rimGeometry.clone(), rimMat);
      rimLine.position.z = 0.008;
      mesh.add(rimLine);

      // Initialize at target pose directly so no cards queue up at (0, 0, -10)
      const initPose = this.getPoseAtStage(Math.round(this.morphSpring.target), idx, photos.length);
      mesh.position.set(initPose.pos.x, initPose.pos.y, initPose.pos.z);
      mesh.rotation.copy(initPose.rot);

      const scaleSpring = new Spring1D(0.85, APPLE_SPRINGS.heroFocus);
      scaleSpring.setTarget(1.0);

      const card: SpatialCard = {
        id: photo.id,
        photo,
        mesh,
        rimLine,
        springPos: new Spring3D(initPose.pos.x, initPose.pos.y, initPose.pos.z, APPLE_SPRINGS.morph),
        springRot: new Spring3D(0, 0, 0, APPLE_SPRINGS.morph),
        springScale: scaleSpring,
        targetScale: 1.0,
        isHovered: false,
        isSelected: false,
        isFavorited: false,
        entranceDelay: idx * 0.02,
        opacitySpring: new Spring1D(0, { stiffness: 160, damping: 22, mass: 1.0 }),
        quaternionTarget: new THREE.Quaternion(),
      };

      this.cards.push(card);
      this.cardGroup.add(mesh);
    });

    spatialAudio.playPhotosLoaded();
  }

  /**
   * Layout Pose Calculation with Fixed Sphere Center & Independent Transforms
   */
  private getPoseAtStage(
    stageIdx: number,
    itemIdx: number,
    total: number
  ): { pos: THREE.Vector3; rot: THREE.Euler } {
    const pos = new THREE.Vector3();
    const rot = new THREE.Euler();

    if (stageIdx === 0) {
      // 0: GRID MATRIX - Clean, upright, seamless vertical flow
      const cols = Math.min(4, Math.ceil(Math.sqrt(total * 1.3)));
      const rows = Math.ceil(total / cols);
      const col = itemIdx % cols;
      const row = Math.floor(itemIdx / cols);

      const spanY = Math.max(8.0, rows * 2.85);
      const baseX = (col - (cols - 1) / 2) * 4.2;
      const rawY = -(row - (rows - 1) / 2) * 2.85 + this.gridScrollY;
      const wrappedY = wrapCoordinate(rawY, spanY);

      // Subtle cylindrical curvature across X so cards face observer naturally
      const curveAngle = (col - (cols - 1) / 2) * 0.08 + this.gridTiltY;
      const z = -Math.abs(col - (cols - 1) / 2) * 0.25;

      pos.set(baseX, wrappedY, z);
      rot.set(this.gridTiltX, curveAngle, 0);
    } else if (stageIdx === 1) {
      // 1: MULTI-TIER CYLINDER GALLERY (3~5 rows, parametric cylindrical coordinates)
      const cyl = LayoutDensityManager.getCylinderConfig({
        itemCount: total,
        aspect: this.camera.aspect,
        viewportWidth: this.container ? this.container.clientWidth : 1440,
        viewportHeight: this.container ? this.container.clientHeight : 900,
      });

      const col = itemIdx % cyl.cols;
      const row = Math.floor(itemIdx / cyl.cols);
      const centerRow = (cyl.rows - 1) / 2;

      // Stagger alternating rows for natural diamond lattice
      const rowStagger = (row % 2 === 1) ? cyl.angleStep * 0.5 : 0;
      const theta = col * cyl.angleStep + rowStagger + this.cylinderAngle;

      const x = Math.sin(theta) * cyl.radius;
      const z = Math.cos(theta) * cyl.radius - cyl.radius;
      const y = (row - centerRow) * cyl.verticalSpacing;

      pos.set(x, y, z);
      rot.set(0, theta, 0);
    } else if (stageIdx === 2) {
      // 2: SPHERE DOME - FIXED SPHERE CENTER AT (0, 0, 0)!
      const pt = getSpherePoint(itemIdx, total, 6.8);

      // Rotate point around fixed center (0, 0, 0)
      const cosY = Math.cos(this.sphereRotY);
      const sinY = Math.sin(this.sphereRotY);
      const cosX = Math.cos(this.sphereRotX);
      const sinX = Math.sin(this.sphereRotX);

      // Y-axis rotation first
      let rx = pt.x * cosY + pt.z * sinY;
      let ry = pt.y;
      let rz = -pt.x * sinY + pt.z * cosY;

      // X-axis elevation tilt
      const fy = ry * cosX - rz * sinX;
      const fz = ry * sinX + rz * cosX;

      pos.set(rx, fy, fz);

      // Card faces outward along sphere radius
      const normal = pos.clone().normalize();
      const lookTarget = pos.clone().add(normal);
      this.tempMatrix.lookAt(pos, lookTarget, this.upVec);
      rot.setFromRotationMatrix(this.tempMatrix);
    } else if (stageIdx === 3) {
      // 3: SPIRAL HELIX - DNA carousel with continuous vertical flow
      const loops = 2.4;
      const heightSpan = 11.0;
      const rawY = -(heightSpan / 2) + (itemIdx / total) * heightSpan + this.helixScrollY;
      const wrappedY = wrapCoordinate(rawY, heightSpan);

      const angle = (itemIdx / total) * Math.PI * 2 * loops + this.helixAngle;
      const radius = 5.8;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      pos.set(x, wrappedY, z);
      rot.set(0.04, -angle + Math.PI / 2, 0);
    } else {
      // 4: MULTI-ROW 3D WAVE WALL (Multi-tier undulating surface)
      const wave = LayoutDensityManager.getWaveConfig({
        itemCount: total,
        aspect: this.camera.aspect,
        viewportWidth: this.container ? this.container.clientWidth : 1440,
        viewportHeight: this.container ? this.container.clientHeight : 900,
      });

      const col = itemIdx % wave.cols;
      const row = Math.floor(itemIdx / wave.cols);
      const centerRow = (wave.rows - 1) / 2;

      const rawX = (col - (wave.cols - 1) / 2) * wave.spacingX + this.waveScrollX;
      const wrappedX = wrapCoordinate(rawX, wave.spanX);

      const wavePhase = (wrappedX * 0.28) + (row * 0.85);
      const y = (row - centerRow) * wave.spacingY + Math.sin(wavePhase) * wave.ampY;
      const z = Math.cos(wavePhase * 0.75) * wave.ampZ - Math.abs(col - (wave.cols - 1) / 2) * 0.12;

      pos.set(wrappedX, y, z);
      const slopeY = Math.cos(wavePhase) * wave.ampY * 0.28;
      rot.set(-slopeY * 0.2, -Math.sin(wavePhase * 0.75) * 0.22, 0);
    }

    return { pos, rot };
  }

  /**
   * Continuous interpolation between 5 spatial layouts
   */
  private computeContinuousPose(
    itemIdx: number,
    total: number,
    factor: number
  ): { pos: THREE.Vector3; rot: THREE.Euler } {
    const clampedFactor = THREE.MathUtils.clamp(factor, 0, 4.0);
    const stageA = Math.floor(clampedFactor);
    const stageB = Math.min(stageA + 1, 4);
    const t = clampedFactor - stageA;

    const smoothT = t * t * (3 - 2 * t);

    const poseA = this.getPoseAtStage(stageA, itemIdx, total);
    const poseB = this.getPoseAtStage(stageB, itemIdx, total);

    const pos = new THREE.Vector3().lerpVectors(poseA.pos, poseB.pos, smoothT);

    const rot = new THREE.Euler(
      THREE.MathUtils.lerp(poseA.rot.x, poseB.rot.x, smoothT),
      THREE.MathUtils.lerp(poseA.rot.y, poseB.rot.y, smoothT),
      THREE.MathUtils.lerp(poseA.rot.z, poseB.rot.z, smoothT)
    );

    return { pos, rot };
  }

  /**
   * Morph to layout: Dismiss hero view, smoothly adjust camera, decoupled from previous layout
   */
  public setMorphFactor(factor: number) {
    const clamped = THREE.MathUtils.clamp(factor, 0, 4.0);
    const targetStage = Math.round(clamped);

    // Dismiss any active selected hero so it returns cleanly to the wall
    if (this.selectedPhotoId) {
      this.selectPhoto(null);
    }

    // Adapt camera distance to target layout
    const targetCamZ = LAYOUT_CAMERA_Z[targetStage] || 6.8;
    this.cameraZSpring.setTarget(targetCamZ);

    this.morphSpring.setTarget(clamped);
    spatialAudio.playMorphShift();
  }

  public cycleNextMorph() {
    const next = (Math.round(this.morphSpring.target) + 1) % 5;
    this.setMorphFactor(next);
  }

  public cyclePrevMorph() {
    const prev = (Math.round(this.morphSpring.target) - 1 + 5) % 5;
    this.setMorphFactor(prev);
  }

  public resetView() {
    const nearestStage = Math.min(Math.round(this.morphSpring.target), 4);
    const targetCamZ = LAYOUT_CAMERA_Z[nearestStage] || 6.8;

    this.gridScrollY = 0;
    this.gridTiltX = 0;
    this.gridTiltY = 0;
    this.cylinderAngle = 0;
    this.sphereRotX = 0;
    this.sphereRotY = 0;
    this.helixScrollY = 0;
    this.helixAngle = 0;
    this.waveScrollX = 0;
    this.velocityX = 0;
    this.velocityY = 0;

    this.cameraZSpring.setTarget(targetCamZ);
    this.selectPhoto(null);
    spatialAudio.playResetChime();
  }

  public tiltElevation(amount: number) {
    this.sphereRotX = THREE.MathUtils.clamp(this.sphereRotX + amount, -Math.PI / 3, Math.PI / 3);
    this.gridTiltX = THREE.MathUtils.clamp(this.gridTiltX + amount * 0.5, -Math.PI / 4, Math.PI / 4);
  }

  public selectPhoto(photoId: string | null) {
    if (this.clickTimeoutId !== null) {
      clearTimeout(this.clickTimeoutId);
      this.clickTimeoutId = null;
    }

    if (this.selectedPhotoId === photoId) return;

    this.selectedPhotoId = photoId;
    this.inspectRotX = 0;
    this.inspectRotY = 0;
    this.isDetailZoomed = false;
    this.detailPanX = 0;
    this.detailPanY = 0;

    if (this.onDetailZoomCallback) {
      this.onDetailZoomCallback(false);
    }

    let selectedItem: PhotoItem | null = null;

    this.cards.forEach((c) => {
      const isThis = c.id === photoId;
      c.isSelected = isThis;
      c.isHovered = false;

      c.mesh.material.map = createPhotoCardTexture(c.photo, false, isThis);
      c.mesh.material.needsUpdate = true;

      if (isThis) {
        selectedItem = c.photo;
        c.springScale.setTarget(1.35); // Enlarge in hero view
        c.mesh.renderOrder = 300;
        c.mesh.material.depthTest = false; // Guaranteed on top
        (c.rimLine.material as THREE.LineBasicMaterial).opacity = 1.0;
        c.rimLine.renderOrder = 301;
      } else {
        c.springScale.setTarget(photoId ? 0.85 : 1.0);
        c.mesh.renderOrder = 1;
        c.mesh.material.depthTest = true;
        (c.rimLine.material as THREE.LineBasicMaterial).opacity = 0.22;
        c.rimLine.renderOrder = 2;
      }
    });

    if (this.onSelectCallback) {
      this.onSelectCallback(selectedItem);
    }

    if (photoId) {
      spatialAudio.playInspectOpen();
    } else {
      spatialAudio.playInspectClose();
    }
  }

  /**
   * Toggles local detail zoom (2.65x) on enlarged photo
   */
  public toggleDetailZoom(): boolean {
    if (!this.selectedPhotoId) return false;
    this.isDetailZoomed = !this.isDetailZoomed;
    if (!this.isDetailZoomed) {
      this.detailPanX = 0;
      this.detailPanY = 0;
      spatialAudio.playInspectClose();
    } else {
      spatialAudio.playInspectOpen();
    }
    if (this.onDetailZoomCallback) {
      this.onDetailZoomCallback(this.isDetailZoomed);
    }
    return this.isDetailZoomed;
  }

  public isDetailZoomActive(): boolean {
    return this.isDetailZoomed;
  }

  public setOnDetailZoomCallback(cb: (isZoomed: boolean) => void) {
    this.onDetailZoomCallback = cb;
  }

  public toggleFavoriteCurrent() {
    const targetId = this.selectedPhotoId || this.hoveredPhotoId;
    if (!targetId) return;

    const card = this.cards.find((c) => c.id === targetId);
    if (!card) return;

    card.isFavorited = !card.isFavorited;
    if (this.onFavoriteCallback) {
      this.onFavoriteCallback(card.id, card.isFavorited);
    }
    spatialAudio.playFavoritePulse();
  }

  public setOnSelectCallback(cb: (photo: PhotoItem | null) => void) {
    this.onSelectCallback = cb;
  }

  public setOnMorphProgressCallback(cb: (factor: number, stateName: SpatialMorphState) => void) {
    this.onMorphProgressCallback = cb;
  }

  public setOnToggleZenCallback(cb: () => void) {
    this.onToggleZenCallback = cb;
  }

  public setOnFavoriteCallback(cb: (photoId: string, isFav: boolean) => void) {
    this.onFavoriteCallback = cb;
  }

  /**
   * Apply Natural Spatial Gestures
   */
  public applyGesture(
    panDelta: { x: number; y: number },
    zoomDelta: number,
    rotationDelta: number,
    normalizedPointer: { x: number; y: number } | null,
    isPinching: boolean,
    isSwipeLeft: boolean,
    isSwipeRight: boolean,
    isSwipeUp: boolean,
    isSwipeDown: boolean,
    isFist: boolean,
    isThumbsUp: boolean,
    _isVictoryLike: boolean,
    handDistanceSpread: number | null
  ) {
    this.idleSeconds = 0;
    this.ambientWeight = 0;

    // 1. Thumbs Up
    if (isThumbsUp) {
      this.toggleFavoriteCurrent();
      return;
    }

    // 2. Gesture Control to Close Single Enlarged Photo:
    // Support Fist (握拳), Swipe Down (下滑推出), Swipe Up (上划关闭), or Two-Hand Close (双手合拢)
    if (this.selectedPhotoId) {
      if (isFist || isSwipeDown || isSwipeUp) {
        this.selectPhoto(null);
        return;
      }
      if (handDistanceSpread !== null && handDistanceSpread < 0.12) {
        this.selectPhoto(null);
        return;
      }
    }

    // 3. Three-Finger Swipes: Layout Morphing
    if (isSwipeRight) {
      this.cycleNextMorph();
      return;
    }
    if (isSwipeLeft) {
      this.cyclePrevMorph();
      return;
    }
    if (isSwipeUp) {
      this.tiltElevation(-0.35);
      return;
    }
    if (isSwipeDown) {
      this.tiltElevation(0.35);
      return;
    }

    // 4. Two-Hand Spread
    if (handDistanceSpread !== null && handDistanceSpread > 0.18) {
      const spreadNorm = THREE.MathUtils.clamp((handDistanceSpread - 0.2) / 0.5, 0, 1);
      const targetFactor = spreadNorm * 4.0;
      this.morphSpring.setTarget(targetFactor);
    }

    // 5. Open Palm Zoom In / Fist Zoom Out
    if (Math.abs(zoomDelta) > 0.001) {
      this.cameraZSpring.setTarget(
        THREE.MathUtils.clamp(this.cameraZSpring.target - zoomDelta * 0.35, 3.8, 16.0)
      );
    }

    // 6. Two-Finger Pan / Drag Orbit
    if (this.selectedPhotoId) {
      if (Math.abs(panDelta.x) > 0.001 || Math.abs(panDelta.y) > 0.001) {
        if (this.isDetailZoomed) {
          const pan = clampPanBounds(
            this.detailPanX + panDelta.x * 3.5,
            this.detailPanY - panDelta.y * 3.5,
            4.0,
            3.0
          );
          this.detailPanX = pan.x;
          this.detailPanY = pan.y;
        } else {
          this.inspectRotY += panDelta.x * 0.25;
          this.inspectRotX += panDelta.y * 0.25;
        }
      }
    } else {
      const nearestStage = Math.min(Math.round(this.morphSpring.target), 4);
      if (nearestStage === 0) {
        // Grid: pan Y & tilt
        this.gridScrollY += panDelta.y * 0.35;
        this.gridTiltY += panDelta.x * 0.15;
      } else if (nearestStage === 1) {
        this.cylinderAngle += panDelta.x * 0.3;
      } else if (nearestStage === 2) {
        this.sphereRotY += panDelta.x * 0.3;
        this.sphereRotX = THREE.MathUtils.clamp(this.sphereRotX + panDelta.y * 0.2, -Math.PI / 3, Math.PI / 3);
      } else if (nearestStage === 3) {
        this.helixScrollY += panDelta.y * 0.3;
        this.helixAngle += panDelta.x * 0.3;
      } else {
        this.waveScrollX += panDelta.x * 0.4;
      }

      if (Math.abs(rotationDelta) > 0.001) {
        this.sphereRotY += rotationDelta * 0.35;
      }
    }

    // 7. Single Point & Pinch
    if (normalizedPointer) {
      this.updatePointerRaycast(normalizedPointer.x, normalizedPointer.y, isPinching);
    }
  }

  private updatePointerRaycast(x: number, y: number, isPinching: boolean) {
    this.mouse.set(x, y);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Update 3D Spatial Cursor Ring
    if (this.spatialCursor) {
      const cursorDist = 4.2;
      const cursorPos = new THREE.Vector3(x, y, 0.5);
      cursorPos.unproject(this.camera);
      cursorPos.sub(this.camera.position).normalize().multiplyScalar(cursorDist).add(this.camera.position);
      this.spatialCursor.position.copy(cursorPos);
      this.spatialCursor.lookAt(this.camera.position);
      (this.spatialCursor.material as THREE.MeshBasicMaterial).opacity = 0.85;
    }

    const meshes = this.cards.map((c) => c.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hitPhotoId = intersects[0].object.userData.photoId as string;

      if (hitPhotoId !== this.hoveredPhotoId) {
        this.hoveredPhotoId = hitPhotoId;
        spatialAudio.playTactileTick();

        // Bring hovered card forward to the top layer - no wireframe clipping!
        this.cards.forEach((c) => {
          c.isHovered = c.id === hitPhotoId;
          c.mesh.material.map = createPhotoCardTexture(c.photo, c.isHovered, c.isSelected);
          c.mesh.material.needsUpdate = true;

          const rimMat = c.rimLine.material as THREE.LineBasicMaterial;
          rimMat.opacity = c.isHovered ? 0.95 : c.isSelected ? 1.0 : 0.22;

          if (c.isHovered) {
            c.mesh.renderOrder = 200; // Bring in front of all other cards!
            c.rimLine.renderOrder = 201;
            c.springScale.setTarget(1.15); // Tactile hover pop
          } else if (!c.isSelected) {
            c.mesh.renderOrder = 1;
            c.rimLine.renderOrder = 2;
            c.springScale.setTarget(1.0);
          }
        });
      }

      if (isPinching) {
        this.selectPhoto(hitPhotoId);
      }
    } else {
      if (this.hoveredPhotoId) {
        this.hoveredPhotoId = null;
        this.cards.forEach((c) => {
          if (c.isHovered) {
            c.isHovered = false;
            c.mesh.material.map = createPhotoCardTexture(c.photo, false, c.isSelected);
            c.mesh.material.needsUpdate = true;
            (c.rimLine.material as THREE.LineBasicMaterial).opacity = c.isSelected ? 1.0 : 0.22;
            if (!c.isSelected) {
              c.mesh.renderOrder = 1;
              c.rimLine.renderOrder = 2;
              c.springScale.setTarget(1.0);
            }
          }
        });
      }
    }
  }

  private bindEvents() {
    const el = this.renderer.domElement;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      this.isPointerDown = true;
      this.idleSeconds = 0;
      this.ambientWeight = 0;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      this.pointerStartX = clientX;
      this.pointerStartY = clientY;
      this.lastPointerX = clientX;
      this.lastPointerY = clientY;
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      this.idleSeconds = 0;
      this.ambientWeight = 0;

      const rect = el.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const normX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const normY = -(((clientY - rect.top) / rect.height) * 2 - 1);

      if (!this.isPointerDown) {
        this.updatePointerRaycast(normX, normY, false);
      } else {
        const dx = (clientX - this.lastPointerX) * 0.005;
        const dy = (clientY - this.lastPointerY) * 0.005;

        if (this.selectedPhotoId) {
          if (this.isDetailZoomed) {
            const pan = clampPanBounds(
              this.detailPanX + dx * 4.2,
              this.detailPanY - dy * 4.2,
              4.5,
              3.2
            );
            this.detailPanX = pan.x;
            this.detailPanY = pan.y;
          } else {
            this.inspectRotY += dx * 2.0;
            this.inspectRotX += dy * 2.0;
          }
        } else {
          this.velocityX = dx * 1.5;
          this.velocityY = dy * 1.5;

          const nearestStage = Math.min(Math.round(this.morphSpring.target), 4);
          if (nearestStage === 0) {
            this.gridScrollY += dy * 3.5;
            this.gridTiltY += dx * 0.8;
          } else if (nearestStage === 1) {
            this.cylinderAngle += dx * 1.5;
          } else if (nearestStage === 2) {
            this.sphereRotY += dx * 1.5;
            this.sphereRotX = THREE.MathUtils.clamp(this.sphereRotX + dy * 1.2, -Math.PI / 3, Math.PI / 3);
          } else if (nearestStage === 3) {
            this.helixScrollY += dy * 2.5;
            this.helixAngle += dx * 1.2;
          } else {
            this.waveScrollX += dx * 3.0;
          }
        }

        this.lastPointerX = clientX;
        this.lastPointerY = clientY;
      }
    };

    const onPointerUp = (e: MouseEvent | TouchEvent) => {
      if (this.isPointerDown) {
        this.isPointerDown = false;
        const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : (e as MouseEvent).clientX;
        const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : (e as MouseEvent).clientY;
        const moveDist = Math.hypot(clientX - this.pointerStartX, clientY - this.pointerStartY);

        if (moveDist < 6) {
          const rect = el.getBoundingClientRect();
          const normX = ((clientX - rect.left) / rect.width) * 2 - 1;
          const normY = -(((clientY - rect.top) / rect.height) * 2 - 1);

          this.mouse.set(normX, normY);
          this.raycaster.setFromCamera(this.mouse, this.camera);
          const intersects = this.raycaster.intersectObjects(
            this.cards.map((c) => c.mesh),
            false
          );

          const now = performance.now();
          const isDbl = isDoubleClick(now, this.lastClickTimestamp, 280);

          if (this.selectedPhotoId) {
            // 1. PHOTO IS CURRENTLY ENLARGED
            if (isDbl) {
              // DOUBLE CLICK: Toggle local detail zoom (2.65x)
              if (this.clickTimeoutId !== null) {
                clearTimeout(this.clickTimeoutId);
                this.clickTimeoutId = null;
              }
              this.lastClickTimestamp = 0;
              this.lastClickTargetId = null;
              this.toggleDetailZoom();
            } else {
              // SINGLE CLICK: Debounce for double-click; if no second click, CLOSE PHOTO!
              this.lastClickTimestamp = now;
              this.lastClickTargetId = this.selectedPhotoId;

              if (this.clickTimeoutId !== null) {
                clearTimeout(this.clickTimeoutId);
              }

              this.clickTimeoutId = setTimeout(() => {
                this.clickTimeoutId = null;
                // Single click closes enlarged photo and returns to gallery
                this.selectPhoto(null);
              }, 250);
            }
          } else {
            // 2. PHOTO WALL GALLERY MODE
            if (intersects.length > 0) {
              const hitPhotoId = intersects[0].object.userData.photoId as string;

              if (isDbl && this.lastClickTargetId === hitPhotoId) {
                // Double click from gallery: open directly into detail zoom
                if (this.clickTimeoutId !== null) {
                  clearTimeout(this.clickTimeoutId);
                  this.clickTimeoutId = null;
                }
                this.lastClickTimestamp = 0;
                this.lastClickTargetId = null;
                this.selectPhoto(hitPhotoId);
                this.isDetailZoomed = true;
                if (this.onDetailZoomCallback) {
                  this.onDetailZoomCallback(true);
                }
                spatialAudio.playInspectOpen();
              } else {
                // Single click on card: enlarge photo
                this.lastClickTimestamp = now;
                this.lastClickTargetId = hitPhotoId;

                if (this.clickTimeoutId !== null) {
                  clearTimeout(this.clickTimeoutId);
                }

                this.clickTimeoutId = setTimeout(() => {
                  this.clickTimeoutId = null;
                  this.selectPhoto(hitPhotoId);
                }, 240);
              }
            } else {
              if (this.clickTimeoutId !== null) {
                clearTimeout(this.clickTimeoutId);
                this.clickTimeoutId = null;
              }
              this.lastClickTimestamp = 0;
              this.lastClickTargetId = null;
            }
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.idleSeconds = 0;
      this.ambientWeight = 0;

      const deltaZ = e.deltaY * 0.012;
      const targetZ = THREE.MathUtils.clamp(this.cameraZSpring.target + deltaZ, 3.8, 16.0);
      this.cameraZSpring.setTarget(targetZ);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      this.idleSeconds = 0;
      this.ambientWeight = 0;

      if (e.key === 'Escape') {
        this.selectPhoto(null);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this.cycleNextMorph();
      } else if (e.key === 'ArrowRight') {
        this.cycleNextMorph();
      } else if (e.key === 'ArrowLeft') {
        this.cyclePrevMorph();
      } else if (e.key === 'ArrowUp') {
        this.tiltElevation(-0.2);
      } else if (e.key === 'ArrowDown') {
        this.tiltElevation(0.2);
      } else if (e.key === 'f' || e.key === 'F') {
        this.toggleFavoriteCurrent();
      }
    };

    const onResize = () => {
      if (!this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    const onDblClick = () => {
      if (this.clickTimeoutId !== null) {
        clearTimeout(this.clickTimeoutId);
        this.clickTimeoutId = null;
      }
      this.lastClickTimestamp = 0;
      this.lastClickTargetId = null;
      if (this.selectedPhotoId) {
        this.toggleDetailZoom();
      }
    };

    el.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    el.addEventListener('dblclick', onDblClick);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
  }

  private animate() {
    this.animId = requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.05);

    this.currentMorphFactor = this.morphSpring.update(dt);
    const nearestStage = Math.min(Math.round(this.currentMorphFactor), 4);
    const activeStageName = LAYOUT_NAMES[nearestStage];

    // Idle Detection & Seamless Ambient Movement
    if (!this.selectedPhotoId && !this.isPointerDown) {
      this.idleSeconds += dt;
      if (this.idleSeconds > 1.8) {
        this.ambientWeight = Math.min(1.0, this.ambientWeight + dt * 0.7);
      }
    } else {
      this.ambientWeight = Math.max(0, this.ambientWeight - dt * 2.5);
    }

    this.ambientTime += dt * this.ambientWeight;

    // Apply layout-specific continuous ambient motion when idle
    const ambientSpeed = 0.5 * this.ambientWeight * dt;
    if (activeStageName === 'GRID') {
      this.gridScrollY += ambientSpeed * 1.8; // Continuous smooth vertical flow!
      this.gridTiltY = decayVelocity(this.gridTiltY, 0.92, dt); // Gentle spring return
      this.gridTiltX = decayVelocity(this.gridTiltX, 0.92, dt);
    } else if (activeStageName === 'CYLINDER') {
      this.cylinderAngle += ambientSpeed * 0.45;
    } else if (activeStageName === 'SPHERE') {
      this.sphereRotY += ambientSpeed * 0.4; // Continuous rotation around fixed sphere center!
    } else if (activeStageName === 'HELIX') {
      this.helixScrollY += ambientSpeed * 1.5;
      this.helixAngle += ambientSpeed * 0.35;
    } else {
      this.waveScrollX += ambientSpeed * 2.0;
    }

    // Inertial velocity decay
    if (!this.isPointerDown) {
      this.velocityX = decayVelocity(this.velocityX, 0.9, dt);
      this.velocityY = decayVelocity(this.velocityY, 0.9, dt);
    }

    const camZ = this.cameraZSpring.update(dt);
    this.camera.position.z = camZ;

    const total = this.cards.length;
    const cameraPos = this.camera.position;

    this.cards.forEach((card, idx) => {
      if (card.entranceDelay > 0) {
        card.entranceDelay -= dt;
      } else {
        card.opacitySpring.setTarget(1.0);
      }
      const entranceOp = card.opacitySpring.update(dt);
      let targetOpacity = 1.0;

      if (card.isSelected) {
        // Enlarge directly in front of camera
        const targetScale = this.isDetailZoomed ? 2.65 : 1.35;
        card.springScale.setTarget(targetScale);
        card.springPos.setTarget(this.detailPanX, this.detailPanY, camZ - 2.8);

        if (this.isDetailZoomed) {
          // Keep orientation straight during local detail zoom for crystal clear viewing
          this.inspectRotX = decayVelocity(this.inspectRotX, 0.85, dt);
          this.inspectRotY = decayVelocity(this.inspectRotY, 0.85, dt);
        }

        card.springRot.setTarget(this.inspectRotX, this.inspectRotY, 0);
        card.mesh.material.opacity = 1.0;
        (card.rimLine.material as THREE.LineBasicMaterial).opacity = 1.0;
      } else {
        const targetPose = this.computeContinuousPose(idx, total, this.currentMorphFactor);

        let finalX = targetPose.pos.x;
        let finalY = targetPose.pos.y;
        let finalZ = targetPose.pos.z;

        // Calculate card normal dot product with vector to camera
        const toCam = cameraPos.clone().sub(new THREE.Vector3(finalX, finalY, finalZ)).normalize();
        const normal = new THREE.Vector3(0, 0, 1).applyEuler(targetPose.rot);
        const dotCamera = normal.dot(toCam);

        // Prominent Central Focus Zone:
        // As photos drift into the center, magnify AND move them closer toward camera!
        const focus = calculateFocusEffect(finalX, finalY, dotCamera > -0.2);
        finalZ += focus.zAdvance;

        // Lift hovered card forward to guarantee top layer hierarchy
        if (card.isHovered) {
          finalZ += 0.55;
        }

        // Boundary unwrap protection: if periodic wrap occurred, adjust current spring position
        // so the card continues seamlessly rather than leaping across the screen
        if (activeStageName === 'GRID' || activeStageName === 'HELIX') {
          const span = activeStageName === 'GRID' ? Math.max(8.0, Math.ceil(total / 4) * 2.85) : 11.0;
          card.springPos.y.value = unwrapSpringBoundary(card.springPos.y.value, finalY, span);
        } else if (activeStageName === 'WAVE') {
          const waveSpan = Math.max(12.0, Math.ceil(total / 3) * 4.2);
          card.springPos.x.value = unwrapSpringBoundary(card.springPos.x.value, finalX, waveSpan);
        }

        card.springPos.setTarget(finalX, finalY, finalZ);

        // Compute Facing Viewer Quaternion Correction (Billboarding)
        // 1. Base orientation from layout
        this.qBase.setFromEuler(targetPose.rot);

        // 2. Direct look-at camera quaternion (with Y 180 flip since card front is +Z)
        const cardPos = new THREE.Vector3(finalX, finalY, finalZ);
        this.lookMatrix.lookAt(cardPos, cameraPos, this.upVec);
        this.qLook.setFromRotationMatrix(this.lookMatrix);
        this.qLook.multiply(this.qY180);

        // Calculate facing weight and back-culling opacity
        const { weight: facingWeight, opacity: facingOpacity } = calculateFacingWeight(
          activeStageName,
          finalX,
          finalY,
          dotCamera,
          card.isHovered,
          focus.focusWeight
        );

        targetOpacity = Math.min(targetOpacity, facingOpacity);

        // Slerp between base layout rotation and facing-camera orientation
        card.quaternionTarget.slerpQuaternions(this.qBase, this.qLook, facingWeight);

        const hoverScale = card.isHovered ? 1.15 : 1.0;
        card.springScale.setTarget(focus.scaleBonus * hoverScale);
      }

      // Update position spring
      const curPos = card.springPos.update(dt);
      card.mesh.position.set(curPos.x, curPos.y, curPos.z);

      // Smoothly slerp card orientation
      if (!card.isSelected) {
        card.mesh.quaternion.slerp(card.quaternionTarget, Math.min(1.0, dt * 10));
      } else {
        const curRot = card.springRot.update(dt);
        card.mesh.rotation.set(curRot.x, curRot.y, curRot.z);
      }

      // Update scale spring
      const curScale = card.springScale.update(dt);
      card.mesh.scale.set(curScale, curScale, curScale);

      card.mesh.material.opacity = targetOpacity * entranceOp;
      if (!card.isSelected) {
        (card.rimLine.material as THREE.LineBasicMaterial).opacity =
          entranceOp * (card.isHovered ? 0.95 : 0.22);
      }
    });

    if (this.onMorphProgressCallback) {
      this.onMorphProgressCallback(this.currentMorphFactor, activeStageName);
    }

    this.renderer.render(this.scene, this.camera);
  }

  public dispose() {
    if (this.clickTimeoutId !== null) {
      clearTimeout(this.clickTimeoutId);
      this.clickTimeoutId = null;
    }
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
    }
    this.cards.forEach((c) => {
      this.cardGroup.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh.material.dispose();
      c.rimLine.geometry.dispose();
      (c.rimLine.material as THREE.Material).dispose();
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
