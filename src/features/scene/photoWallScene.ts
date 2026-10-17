import * as THREE from 'three';
import { PhotoItem } from '../../services/photoSearchService';
import { createPhotoCardTexture } from './photoTextureGenerator';
import { Spring1D, Spring3D, APPLE_SPRINGS, decayVelocity } from './spatialPhysics';
import { spatialAudio } from '../../utils/audio';

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
}

const LAYOUT_NAMES: SpatialMorphState[] = ['GRID', 'CYLINDER', 'SPHERE', 'HELIX', 'WAVE'];

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

  // Compute normalized UV coordinates across the rounded shape
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

  // Outer rounded rim geometry
  const points = shape.getPoints(segments);
  const rimGeometry = new THREE.BufferGeometry().setFromPoints(points);

  return { geometry, rimGeometry };
}

/**
 * Generates an optical depth-of-field radial background gradient
 * Replaces pitch black with warm-cool depth and vignetting
 */
function createSpatialDepthBackgroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const cx = canvas.width / 2;
  const cy = canvas.height * 0.45;
  const radius = canvas.width * 0.72;

  const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, radius);
  grad.addColorStop(0, '#262a34');    // Soft luminous spatial center
  grad.addColorStop(0.38, '#191b22'); // Smooth depth charcoal
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

  // Spatial Cards
  private cards: SpatialCard[] = [];
  private cardGroup: THREE.Group;
  private groundReflection: THREE.Mesh | null = null;

  // Continuous Morphing Factor: 0.0 = Grid, 1.0 = Cylinder, 2.0 = Sphere, 3.0 = Helix, 4.0 = Wave
  private morphSpring: Spring1D;
  private currentMorphFactor = 1.0;

  // Camera & Orbit Springs
  private cameraZSpring: Spring1D;
  private cameraBaseZ = 5.8;
  private orbitXSpring: Spring1D;
  private orbitYSpring: Spring1D;
  private panXSpring: Spring1D;
  private panYSpring: Spring1D;

  // Inertial Velocities
  private velocityOrbitX = 0;
  private velocityOrbitY = 0;

  // Auto-Play Cruise (when no hand gesture detected)
  private isAutoPlaying = true;
  private autoPlaySpeed = 0.052; // rad/s smooth cinematic orbit
  private autoPlayPauseTimer = 0; // seconds before resuming auto-play

  // Spatial Cursor Ring in 3D
  private spatialCursor: THREE.Mesh | null = null;

  // State
  private photos: PhotoItem[] = [];
  private selectedPhotoId: string | null = null;
  private hoveredPhotoId: string | null = null;
  private inspectRotX = 0;
  private inspectRotY = 0;
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
  private pointerButton = 0;

  // Raycasting math helpers
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();

    // 1. Scene with Rich Depth of Field Gradient (No pitch black!)
    this.scene = new THREE.Scene();
    this.scene.background = createSpatialDepthBackgroundTexture();
    this.scene.fog = new THREE.FogExp2(0x13151b, 0.016);

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
    this.camera.position.set(0, 0, this.cameraBaseZ);

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

    // 4. Groups
    this.cardGroup = new THREE.Group();
    this.scene.add(this.cardGroup);

    // 5. Apple-grade Springs
    this.morphSpring = new Spring1D(1.0, APPLE_SPRINGS.morph);
    this.cameraZSpring = new Spring1D(this.cameraBaseZ, APPLE_SPRINGS.camera);
    this.orbitXSpring = new Spring1D(0, APPLE_SPRINGS.camera);
    this.orbitYSpring = new Spring1D(0, APPLE_SPRINGS.camera);
    this.panXSpring = new Spring1D(0, APPLE_SPRINGS.camera);
    this.panYSpring = new Spring1D(0, APPLE_SPRINGS.camera);

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
      opacity: 0.28,
      depthWrite: false,
    });
    this.groundReflection = new THREE.Mesh(groundGeom, groundMat);
    this.groundReflection.rotation.x = -Math.PI / 2;
    this.groundReflection.position.y = -6.5;
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

    // Create 3D Rounded Card Geometry: 3.65 x 2.48 with generous smooth corner radius 0.32
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
        depthWrite: false,
        alphaTest: 0.02,
      });

      const mesh = new THREE.Mesh(geometry.clone(), mat);
      mesh.userData = { photoId: photo.id };

      // Outer rounded specular rim line
      const rimMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.25,
        linewidth: 1.5,
      });
      const rimLine = new THREE.LineLoop(rimGeometry.clone(), rimMat);
      rimLine.position.z = 0.006;
      mesh.add(rimLine);

      const initialZ = -10 - idx * 0.4;
      mesh.position.set(0, 0, initialZ);

      const scaleSpring = new Spring1D(0.2, APPLE_SPRINGS.heroFocus);
      scaleSpring.setTarget(1.0);

      const card: SpatialCard = {
        id: photo.id,
        photo,
        mesh,
        rimLine,
        springPos: new Spring3D(0, 0, initialZ, APPLE_SPRINGS.morph),
        springRot: new Spring3D(0, 0, 0, APPLE_SPRINGS.morph),
        springScale: scaleSpring,
        targetScale: 1.0,
        isHovered: false,
        isSelected: false,
        isFavorited: false,
        entranceDelay: idx * 0.035,
        opacitySpring: new Spring1D(0, { stiffness: 140, damping: 20, mass: 1.0 }),
      };

      this.cards.push(card);
      this.cardGroup.add(mesh);
    });

    spatialAudio.playPhotosLoaded();
  }

  private getPoseAtStage(
    stageIdx: number,
    itemIdx: number,
    total: number
  ): { pos: THREE.Vector3; rot: THREE.Euler } {
    const pos = new THREE.Vector3();
    const rot = new THREE.Euler();

    if (stageIdx === 0) {
      // 0: GRID MATRIX
      const cols = Math.min(4, Math.ceil(Math.sqrt(total * 1.3)));
      const rows = Math.ceil(total / cols);
      const col = itemIdx % cols;
      const row = Math.floor(itemIdx / cols);

      const x = (col - (cols - 1) / 2) * 4.1;
      const y = -(row - (rows - 1) / 2) * 2.8;
      const z = Math.sin(col * 0.6 + row * 0.4) * 0.5 - 0.5;

      pos.set(x, y, z);
      rot.set(0.02 * (row - rows / 2), 0.02 * (col - cols / 2), 0);
    } else if (stageIdx === 1) {
      // 1: CYLINDER ARC
      const radius = 6.8;
      const arcAngle = Math.PI * 1.15;
      const angleStep = arcAngle / Math.max(1, total - 1);
      const angle = -arcAngle / 2 + itemIdx * angleStep;

      const rowOffset = (itemIdx % 2 === 0 ? 0.8 : -0.8) * 0.85;

      const x = Math.sin(angle) * radius;
      const z = -Math.cos(angle) * radius + radius - 1.2;
      const y = rowOffset;

      pos.set(x, y, z);
      rot.set(0, angle, 0);
    } else if (stageIdx === 2) {
      // 2: SPHERE DOME
      const phi = Math.acos(-1 + (2 * (itemIdx + 0.5)) / total);
      const theta = Math.sqrt(total * Math.PI) * phi;
      const radius = 7.5;

      const x = radius * Math.cos(theta) * Math.sin(phi);
      const y = radius * Math.cos(phi) * 0.75;
      const z = -radius * Math.sin(theta) * Math.sin(phi) + radius - 2.5;

      pos.set(x, y, z);
      rot.set(-phi + Math.PI / 2, theta + Math.PI / 2, 0);
    } else if (stageIdx === 3) {
      // 3: SPIRAL HELIX
      const loops = 2.2;
      const angle = (itemIdx / total) * Math.PI * 2 * loops;
      const radius = 5.8;
      const heightRange = 10.5;
      const y = -(heightRange / 2) + (itemIdx / total) * heightRange;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 1.0;

      pos.set(x, y, z);
      rot.set(0.08, -angle + Math.PI / 2, 0.04);
    } else {
      // 4: WAVE FLOW
      const x = (itemIdx - (total - 1) / 2) * 3.8;
      const waveFreq = 0.55;
      const y = Math.sin(itemIdx * waveFreq) * 1.75;
      const z = Math.cos(itemIdx * waveFreq * 0.8) * 2.2 - 1.5;

      pos.set(x, y, z);
      const tangentY = Math.cos(itemIdx * waveFreq) * 1.75 * waveFreq;
      rot.set(-tangentY * 0.15, -0.05 * itemIdx, 0);
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

    // Smoothstep for organic spatial morphing
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

  public setMorphFactor(factor: number) {
    const clamped = THREE.MathUtils.clamp(factor, 0, 4.0);
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
    this.orbitXSpring.setTarget(0);
    this.orbitYSpring.setTarget(0);
    this.panXSpring.setTarget(0);
    this.panYSpring.setTarget(0);
    this.cameraZSpring.setTarget(this.cameraBaseZ);
    this.velocityOrbitX = 0;
    this.velocityOrbitY = 0;
    this.selectPhoto(null);
    spatialAudio.playResetChime();
  }

  public tiltElevation(amount: number) {
    this.orbitXSpring.setTarget(
      THREE.MathUtils.clamp(this.orbitXSpring.target + amount, -Math.PI / 3, Math.PI / 3)
    );
  }

  public selectPhoto(photoId: string | null) {
    if (this.selectedPhotoId === photoId) return;

    this.selectedPhotoId = photoId;
    this.inspectRotX = 0;
    this.inspectRotY = 0;

    let selectedItem: PhotoItem | null = null;

    this.cards.forEach((c) => {
      const isThis = c.id === photoId;
      c.isSelected = isThis;
      c.isHovered = false;

      // Update texture with selection glow
      c.mesh.material.map = createPhotoCardTexture(c.photo, false, isThis);
      c.mesh.material.needsUpdate = true;

      if (isThis) {
        selectedItem = c.photo;
        c.springScale.setTarget(1.35); // Enlarge in hero view
        c.mesh.renderOrder = 100;
        (c.rimLine.material as THREE.LineBasicMaterial).opacity = 1.0;
      } else {
        c.springScale.setTarget(photoId ? 0.85 : 1.0);
        c.mesh.renderOrder = 1;
        (c.rimLine.material as THREE.LineBasicMaterial).opacity = 0.22;
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
    isVictoryLike: boolean,
    handDistanceSpread: number | null
  ) {
    // Whenever any hand gesture is detected: PAUSE AUTO-PLAY IMMEDIATELY!
    this.isAutoPlaying = false;
    this.autoPlayPauseTimer = 3.0; // 3 seconds pause before resuming auto-cruise

    // 1. Thumbs Up: Toggle Favorite / Heart
    if (isThumbsUp) {
      this.toggleFavoriteCurrent();
      return;
    }

    // 2. Fist: Zoom Out or Dismiss Inspection
    if (isFist) {
      if (this.selectedPhotoId) {
        this.selectPhoto(null);
        return;
      }
    }

    // 3. Three-Finger Swipes: Continuous Layout Morphing
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

    // 4. Two-Hand Spread: Continuous shape morphing
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
        this.inspectRotY += panDelta.x * 0.25;
        this.inspectRotX += panDelta.y * 0.25;
      }
    } else {
      if (Math.abs(panDelta.x) > 0.001 || Math.abs(panDelta.y) > 0.001) {
        this.velocityOrbitY = panDelta.x * 0.35;
        this.velocityOrbitX = panDelta.y * 0.25;

        this.orbitYSpring.setTarget(this.orbitYSpring.target + panDelta.x * 0.35);
        this.orbitXSpring.setTarget(
          THREE.MathUtils.clamp(this.orbitXSpring.target + panDelta.y * 0.25, -Math.PI / 3, Math.PI / 3)
        );
      }

      if (Math.abs(rotationDelta) > 0.001) {
        this.orbitYSpring.setTarget(this.orbitYSpring.target + rotationDelta * 0.4);
      }
    }

    // 7. Single Point: Aim & Focus with Ethereal Contour Rim Glow
    // Pinch: Confirm and Enlarge
    if (normalizedPointer) {
      this.updatePointerRaycast(normalizedPointer.x, normalizedPointer.y, isPinching);
    }
  }

  private updatePointerRaycast(x: number, y: number, isPinching: boolean) {
    this.mouse.set(x, y);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Update 3D Spatial Cursor Ring position
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

        // "选聚焦时，照片发出轮廓光"
        this.cards.forEach((c) => {
          c.isHovered = c.id === hitPhotoId;
          c.mesh.material.map = createPhotoCardTexture(c.photo, c.isHovered, c.isSelected);
          c.mesh.material.needsUpdate = true;

          // Luminous rim highlight
          const rimMat = c.rimLine.material as THREE.LineBasicMaterial;
          rimMat.opacity = c.isHovered ? 0.95 : c.isSelected ? 1.0 : 0.22;

          if (!c.isSelected) {
            c.springScale.setTarget(c.isHovered ? 1.14 : 1.0); // Gentle pop forward
          }
        });
      }

      // "食指和拇指啮合确定放大当前聚焦的图片"
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
      this.isAutoPlaying = false;
      this.autoPlayPauseTimer = 3.0;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      this.pointerStartX = clientX;
      this.pointerStartY = clientY;
      this.lastPointerX = clientX;
      this.lastPointerY = clientY;
      this.pointerButton = 'button' in e ? e.button : 0;
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
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
          this.inspectRotY += dx * 2.0;
          this.inspectRotX += dy * 2.0;
        } else if (this.pointerButton === 2 || ('shiftKey' in e && e.shiftKey)) {
          this.panXSpring.setTarget(this.panXSpring.target + dx * 8);
          this.panYSpring.setTarget(this.panYSpring.target - dy * 8);
        } else {
          this.velocityOrbitY = dx * 1.5;
          this.velocityOrbitX = dy * 1.5;
          this.orbitYSpring.setTarget(this.orbitYSpring.target + dx * 1.5);
          this.orbitXSpring.setTarget(
            THREE.MathUtils.clamp(this.orbitXSpring.target + dy * 1.5, -Math.PI / 3, Math.PI / 3)
          );
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

          if (intersects.length > 0) {
            const hitPhotoId = intersects[0].object.userData.photoId as string;
            this.selectPhoto(hitPhotoId);
          } else if (this.selectedPhotoId) {
            this.selectPhoto(null);
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.isAutoPlaying = false;
      this.autoPlayPauseTimer = 3.0;

      const deltaZ = e.deltaY * 0.012;
      const targetZ = THREE.MathUtils.clamp(this.cameraZSpring.target + deltaZ, 3.8, 16.0);
      this.cameraZSpring.setTarget(targetZ);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      this.isAutoPlaying = false;
      this.autoPlayPauseTimer = 3.0;

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

    el.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
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

    // Auto-Play Cruise logic:
    // When no hand gestures detected, gallery slowly orbits and cycles
    if (this.autoPlayPauseTimer > 0) {
      this.autoPlayPauseTimer -= dt;
      if (this.autoPlayPauseTimer <= 0 && !this.selectedPhotoId && !this.isPointerDown) {
        this.isAutoPlaying = true;
      }
    }

    if (this.isAutoPlaying && !this.selectedPhotoId && !this.isPointerDown) {
      this.orbitYSpring.setTarget(this.orbitYSpring.target + this.autoPlaySpeed * dt);
      if (this.spatialCursor) {
        (this.spatialCursor.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }

    if (!this.isPointerDown) {
      this.velocityOrbitX = decayVelocity(this.velocityOrbitX, 0.9, dt);
      this.velocityOrbitY = decayVelocity(this.velocityOrbitY, 0.9, dt);
      if (Math.abs(this.velocityOrbitX) > 0.0001) {
        this.orbitXSpring.setTarget(this.orbitXSpring.target + this.velocityOrbitX * dt);
      }
      if (Math.abs(this.velocityOrbitY) > 0.0001) {
        this.orbitYSpring.setTarget(this.orbitYSpring.target + this.velocityOrbitY * dt);
      }
    }

    const camZ = this.cameraZSpring.update(dt);
    this.camera.position.z = camZ;

    const orbitX = this.orbitXSpring.update(dt);
    const orbitY = this.orbitYSpring.update(dt);
    const panX = this.panXSpring.update(dt);
    const panY = this.panYSpring.update(dt);

    this.cardGroup.position.set(panX, panY, 0);
    this.cardGroup.rotation.set(orbitX, orbitY, 0);

    const total = this.cards.length;

    this.cards.forEach((card, idx) => {
      if (card.entranceDelay > 0) {
        card.entranceDelay -= dt;
        return;
      }

      card.opacitySpring.setTarget(1.0);
      const op = card.opacitySpring.update(dt);
      card.mesh.material.opacity = op;

      if (card.isSelected) {
        // Enlarge in front of camera
        const targetWorldPos = new THREE.Vector3(0, 0, camZ - 2.8);
        const invGroup = this.cardGroup.matrixWorld.clone().invert();
        targetWorldPos.applyMatrix4(invGroup);

        card.springPos.setTarget(targetWorldPos.x, targetWorldPos.y, targetWorldPos.z);
        card.springRot.setTarget(-orbitX + this.inspectRotX, -orbitY + this.inspectRotY, 0);
      } else {
        const targetPose = this.computeContinuousPose(idx, total, this.currentMorphFactor);

        // Add subtle hover z-lift
        const zOffset = card.isHovered ? 0.35 : 0;
        card.springPos.setTarget(targetPose.pos.x, targetPose.pos.y, targetPose.pos.z + zOffset);
        card.springRot.setTarget(targetPose.rot.x, targetPose.rot.y, targetPose.rot.z);
      }

      const curPos = card.springPos.update(dt);
      card.mesh.position.set(curPos.x, curPos.y, curPos.z);

      const curRot = card.springRot.update(dt);
      card.mesh.rotation.set(curRot.x, curRot.y, curRot.z);

      const curScale = card.springScale.update(dt);
      card.mesh.scale.set(curScale, curScale, curScale);
    });

    if (this.onMorphProgressCallback) {
      const stageIdx = Math.min(Math.round(this.currentMorphFactor), 4);
      this.onMorphProgressCallback(this.currentMorphFactor, LAYOUT_NAMES[stageIdx]);
    }

    this.renderer.render(this.scene, this.camera);
  }

  public dispose() {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
    }
    this.cards.forEach((c) => {
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
