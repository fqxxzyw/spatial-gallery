import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFocusEffect,
  calculateFacingWeight,
  wrapCoordinate,
  unwrapSpringBoundary,
  getSpherePoint,
  isDoubleClick,
  clampPanBounds,
} from './spatialMath.ts';
import { LayoutDensityManager } from './layoutDensityManager.ts';

test('Focus effect magnifies and advances toward camera when in center foreground', () => {
  // Center point (0, 0)
  const centerEffect = calculateFocusEffect(0, 0, true);
  assert.ok(centerEffect.scaleBonus >= 1.25, `Expected scale >= 1.25, got ${centerEffect.scaleBonus}`);
  assert.ok(centerEffect.zAdvance >= 1.0, `Expected zAdvance >= 1.0, got ${centerEffect.zAdvance}`);
  assert.ok(centerEffect.focusWeight > 0.9);

  // Outside zone
  const outsideEffect = calculateFocusEffect(10, 10, true);
  assert.equal(outsideEffect.scaleBonus, 1.0);
  assert.equal(outsideEffect.zAdvance, 0);

  // Back-facing card at center should NOT be enlarged
  const backFacing = calculateFocusEffect(0, 0, false);
  assert.equal(backFacing.scaleBonus, 1.0);
  assert.equal(backFacing.zAdvance, 0);
});

test('unwrapSpringBoundary prevents spring flying across screen on boundary wrap', () => {
  const span = 20;
  // Case: Card at +9.8 wraps to -9.9.
  // Without unwrap, spring jumps by -19.7 across viewport.
  // With unwrap, currentValue is shifted to -10.2, so delta is only +0.3!
  const unwrapNegative = unwrapSpringBoundary(9.8, -9.9, span);
  assert.equal(unwrapNegative, -10.2);
  assert.ok(Math.abs(-9.9 - unwrapNegative) < 1.0);

  // Case: Card at -9.8 wraps to +9.9
  const unwrapPositive = unwrapSpringBoundary(-9.8, 9.9, span);
  assert.equal(unwrapPositive, 10.2);
  assert.ok(Math.abs(9.9 - unwrapPositive) < 1.0);

  // Normal movement within bounds should NOT be shifted
  assert.equal(unwrapSpringBoundary(2.0, 2.5, span), 2.0);
});

test('LayoutDensityManager adapts Cylinder and Wave to multi-tier structures', () => {
  const params24 = { itemCount: 24, aspect: 1.6, viewportWidth: 1440, viewportHeight: 900 };

  const cylConfig = LayoutDensityManager.getCylinderConfig(params24);
  assert.ok(cylConfig.rows >= 3, `Cylinder should have at least 3 tiers, got ${cylConfig.rows}`);
  assert.ok(cylConfig.cols >= 6, `Cylinder should have adequate cols, got ${cylConfig.cols}`);
  assert.ok(cylConfig.radius >= 6.0, `Cylinder radius should prevent card intersection`);

  const waveConfig = LayoutDensityManager.getWaveConfig(params24);
  assert.ok(waveConfig.rows >= 3, `Wave should have at least 3 rows, got ${waveConfig.rows}`);
  assert.ok(waveConfig.cols >= 6, `Wave should have multi-column wave surface`);
});

test('LayoutDensityManager scales down cleanly for small photo counts (3, 8)', () => {
  const params3 = { itemCount: 3, aspect: 1.6, viewportWidth: 1440, viewportHeight: 900 };
  const cyl3 = LayoutDensityManager.getCylinderConfig(params3);
  assert.equal(cyl3.rows, 1);

  const params8 = { itemCount: 8, aspect: 1.6, viewportWidth: 1440, viewportHeight: 900 };
  const cyl8 = LayoutDensityManager.getCylinderConfig(params8);
  assert.equal(cyl8.rows, 2);
  const wave8 = LayoutDensityManager.getWaveConfig(params8);
  assert.equal(wave8.rows, 2);
});

test('isDoubleClick accurately detects double-click within threshold and ignores slow clicks', () => {
  // Click interval 180ms -> valid double click
  assert.equal(isDoubleClick(1180, 1000, 280), true);

  // Click interval 350ms -> exceeded threshold (separate single clicks)
  assert.equal(isDoubleClick(1350, 1000, 280), false);

  // First click (lastClick = 0) -> false
  assert.equal(isDoubleClick(1000, 0, 280), false);
});

test('clampPanBounds strictly restricts zoom panning within viewport boundaries', () => {
  const clampedInside = clampPanBounds(1.5, -2.0, 4.0, 3.0);
  assert.equal(clampedInside.x, 1.5);
  assert.equal(clampedInside.y, -2.0);

  const clampedExcess = clampPanBounds(10.0, -8.0, 4.0, 3.0);
  assert.equal(clampedExcess.x, 4.0);
  assert.equal(clampedExcess.y, -3.0);
});
