/**
 * Pure spatial mathematics for VisionOS gallery:
 * - Central focus zone scaling & depth advance
 * - Facing viewer correction weights
 * - Seamless looping wrap & spring unwrap boundary protection
 * - Sphere fixed-center coordinates
 */

export interface FocusZoneConfig {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  maxScaleBonus: number;
  maxZAdvance: number;
}

export const DEFAULT_FOCUS_CONFIG: FocusZoneConfig = {
  centerX: 0,
  centerY: 0,
  radiusX: 2.4,
  radiusY: 1.8,
  maxScaleBonus: 0.32, // Magnifies up to 1.32x in center
  maxZAdvance: 1.35,   // Moves 1.35 units forward toward camera
};

/**
 * Calculates smooth magnification and z-advance bonus when card is inside central focus zone
 */
export function calculateFocusEffect(
  x: number,
  y: number,
  isFacingForeground: boolean = true,
  config: FocusZoneConfig = DEFAULT_FOCUS_CONFIG
): { scaleBonus: number; zAdvance: number; focusWeight: number } {
  if (!isFacingForeground) {
    return { scaleBonus: 1.0, zAdvance: 0, focusWeight: 0 };
  }

  const dx = (x - config.centerX) / config.radiusX;
  const dy = (y - config.centerY) / config.radiusY;
  const dist = Math.hypot(dx, dy);

  if (dist >= 1.0) {
    return { scaleBonus: 1.0, zAdvance: 0, focusWeight: 0 };
  }

  // Smooth cubic ease-in-out curve
  const t = 1.0 - dist;
  const bump = t * t * (3 - 2 * t);

  return {
    scaleBonus: 1.0 + bump * config.maxScaleBonus,
    zAdvance: bump * config.maxZAdvance,
    focusWeight: bump,
  };
}

export function calculateFocusScale(
  x: number,
  y: number,
  isFacingForeground: boolean = true,
  config: FocusZoneConfig = DEFAULT_FOCUS_CONFIG
): number {
  return calculateFocusEffect(x, y, isFacingForeground, config).scaleBonus;
}

/**
 * Calculates facing viewer weight w in [0, 1] for billboarding
 */
export function calculateFacingWeight(
  layoutStage: 'GRID' | 'CYLINDER' | 'SPHERE' | 'HELIX' | 'WAVE',
  x: number,
  y: number,
  dotCamera: number,
  isHovered: boolean = false,
  focusWeight: number = 0
): { weight: number; opacity: number } {
  if (isHovered) {
    return { weight: 0.95, opacity: 1.0 };
  }

  if (layoutStage === 'GRID') {
    const distCenter = Math.hypot(x / 4.5, y / 3.2);
    const baseWeight = Math.max(0.25, 0.65 - distCenter * 0.25);
    const weight = Math.min(0.95, baseWeight + focusWeight * 0.35);
    return { weight, opacity: 1.0 };
  }

  if (layoutStage === 'SPHERE') {
    if (dotCamera >= 0.2) {
      const t = Math.min(1.0, (dotCamera - 0.2) / 0.75);
      const baseWeight = 0.25 + t * 0.55;
      const weight = Math.min(0.95, baseWeight + focusWeight * 0.3);
      return { weight, opacity: 1.0 };
    }
    // Behind horizon on sphere: fade gently to prevent back clutter
    const opacity = Math.max(0.15, 1.0 + (dotCamera - 0.2) * 1.6);
    return { weight: 0.1, opacity };
  }

  if (layoutStage === 'CYLINDER') {
    if (dotCamera > 0.15) {
      const baseWeight = 0.35 + dotCamera * 0.45;
      const weight = Math.min(0.95, baseWeight + focusWeight * 0.3);
      return { weight, opacity: 1.0 };
    }
    // Back half of cylinder: soft opacity
    const opacity = Math.max(0.18, 0.35 + dotCamera * 0.5);
    return { weight: 0.15, opacity };
  }

  if (layoutStage === 'HELIX') {
    const weight = dotCamera > 0 ? 0.35 + dotCamera * 0.4 + focusWeight * 0.25 : 0.2;
    const opacity = dotCamera < -0.2 ? 0.25 : 1.0;
    return { weight, opacity };
  }

  // WAVE
  const dist = Math.hypot(x / 5.0, y / 2.5);
  const baseWeight = Math.max(0.25, 0.65 - dist * 0.2);
  const weight = Math.min(0.95, baseWeight + focusWeight * 0.35);
  return { weight, opacity: 1.0 };
}

/**
 * Seamless periodic wrapping for endless flow within bounds [-span/2, span/2]
 */
export function wrapCoordinate(value: number, span: number): number {
  if (span <= 0) return value;
  const half = span / 2;
  let wrapped = (value + half) % span;
  if (wrapped < 0) wrapped += span;
  return wrapped - half;
}

/**
 * Critical Fix for Spring Boundary Jumps:
 * When target wraps around a toroidal boundary from +span/2 to -span/2,
 * shifts currentValue by +/- span so the spring does NOT fly across the viewport!
 */
export function unwrapSpringBoundary(currentValue: number, targetValue: number, span: number): number {
  if (span <= 0) return currentValue;
  const delta = targetValue - currentValue;
  const half = span / 2;
  if (delta > half) {
    return currentValue + span;
  }
  if (delta < -half) {
    return currentValue - span;
  }
  return currentValue;
}

/**
 * Generates fixed-center sphere point on radius R around (0, 0, 0)
 */
export function getSpherePoint(
  index: number,
  total: number,
  radius: number = 6.8
): { x: number; y: number; z: number; nx: number; ny: number; nz: number } {
  const safeTotal = Math.max(1, total);
  const phi = Math.acos(-1 + (2 * (index + 0.5)) / safeTotal);
  const theta = Math.sqrt(safeTotal * Math.PI) * phi;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);

  const nx = sinPhi * cosTheta;
  const ny = cosPhi * 0.9;
  const nz = sinPhi * sinTheta;

  return {
    x: nx * radius,
    y: ny * radius,
    z: nz * radius,
    nx,
    ny,
    nz,
  };
}

/**
 * Detects whether consecutive clicks fall within double-click threshold window
 */
export function isDoubleClick(currentTimeMs: number, lastClickTimeMs: number, maxIntervalMs = 280): boolean {
  if (lastClickTimeMs <= 0) return false;
  const elapsed = currentTimeMs - lastClickTimeMs;
  return elapsed > 0 && elapsed <= maxIntervalMs;
}

/**
 * Bounds detail pan coordinates to prevent image panning out of view
 */
export function clampPanBounds(
  x: number,
  y: number,
  maxPanX: number = 4.0,
  maxPanY: number = 3.0
): { x: number; y: number } {
  return {
    x: Math.max(-maxPanX, Math.min(maxPanX, x)),
    y: Math.max(-maxPanY, Math.min(maxPanY, y)),
  };
}
