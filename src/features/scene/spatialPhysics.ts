/**
 * Apple-grade Spring Physics & Inertia Engine
 * Frame-rate independent 2nd-order spring damper simulation
 */

export interface SpringConfig {
  stiffness: number; // spring tension (e.g. 180 - 320)
  damping: number;   // damping friction (e.g. 18 - 28)
  mass: number;      // mass (usually 1.0)
}

export const APPLE_SPRINGS = {
  // Gentle fluid layout transition
  morph: { stiffness: 120, damping: 20, mass: 1.0 },
  // Responsive camera follow
  camera: { stiffness: 160, damping: 24, mass: 1.0 },
  // Tactile hero card pop / jelly expansion
  heroFocus: { stiffness: 220, damping: 22, mass: 0.9 },
  // Soft rubber-band overscroll return
  rubberBand: { stiffness: 260, damping: 30, mass: 1.2 },
  // Quick gesture response
  gestureTracking: { stiffness: 300, damping: 28, mass: 0.8 },
};

export class Spring1D {
  public value: number;
  public target: number;
  public velocity: number = 0;
  private config: SpringConfig;

  constructor(initial: number = 0, config: SpringConfig = APPLE_SPRINGS.camera) {
    this.value = initial;
    this.target = initial;
    this.config = config;
  }

  public setTarget(target: number) {
    this.target = target;
  }

  public set(value: number) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  public update(dt: number): number {
    // Clamp delta time to avoid instability on long pauses/tab switches
    const delta = Math.min(dt, 0.064);
    if (delta <= 0) return this.value;

    const springForce = -this.config.stiffness * (this.value - this.target);
    const dampingForce = -this.config.damping * this.velocity;
    const acceleration = (springForce + dampingForce) / this.config.mass;

    this.velocity += acceleration * delta;
    this.value += this.velocity * delta;

    // Settle threshold to avoid infinite tiny ticks
    if (Math.abs(this.value - this.target) < 0.0001 && Math.abs(this.velocity) < 0.0001) {
      this.value = this.target;
      this.velocity = 0;
    }

    return this.value;
  }
}

export class Spring3D {
  public x: Spring1D;
  public y: Spring1D;
  public z: Spring1D;

  constructor(
    initX: number = 0,
    initY: number = 0,
    initZ: number = 0,
    config: SpringConfig = APPLE_SPRINGS.camera
  ) {
    this.x = new Spring1D(initX, config);
    this.y = new Spring1D(initY, config);
    this.z = new Spring1D(initZ, config);
  }

  public setTarget(x: number, y: number, z: number) {
    this.x.setTarget(x);
    this.y.setTarget(y);
    this.z.setTarget(z);
  }

  public set(x: number, y: number, z: number) {
    this.x.set(x);
    this.y.set(y);
    this.z.set(z);
  }

  public update(dt: number): { x: number; y: number; z: number } {
    return {
      x: this.x.update(dt),
      y: this.y.update(dt),
      z: this.z.update(dt),
    };
  }
}

/**
 * Apple iOS Rubber-banding equation
 * Calculates resistance when dragging beyond boundary limits
 */
export function calculateRubberBand(current: number, min: number, max: number, dimension = 20): number {
  if (current >= min && current <= max) {
    return current;
  }
  const over = current < min ? current - min : current - max;
  const resisted = (over * dimension) / (dimension + Math.abs(over) * 0.55);
  return current < min ? min + resisted : max + resisted;
}

/**
 * Inertial velocity friction decay
 */
export function decayVelocity(velocity: number, friction = 0.92, dt: number): number {
  const adjustedFriction = Math.pow(friction, dt * 60);
  return Math.abs(velocity) < 0.0001 ? 0 : velocity * adjustedFriction;
}
