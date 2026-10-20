/**
 * Unified Layout Density Manager for Spatial Gallery:
 * Dynamically computes optimal rows, columns, radii, vertical spans, and safe spacing
 * for all 5 spatial layouts based on valid photo count and viewport dimensions.
 */

export interface LayoutDensityParams {
  itemCount: number;
  aspect: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface GridLayoutConfig {
  cols: number;
  rows: number;
  spacingX: number;
  spacingY: number;
  spanY: number;
  cameraZ: number;
}

export interface CylinderLayoutConfig {
  rows: number;
  cols: number;
  radius: number;
  verticalSpacing: number;
  angleStep: number;
  cameraZ: number;
}

export interface SphereLayoutConfig {
  radius: number;
  cameraZ: number;
}

export interface HelixLayoutConfig {
  loops: number;
  radius: number;
  heightSpan: number;
  cameraZ: number;
}

export interface WaveLayoutConfig {
  rows: number;
  cols: number;
  spacingX: number;
  spacingY: number;
  spanX: number;
  ampY: number;
  ampZ: number;
  cameraZ: number;
}

export class LayoutDensityManager {
  public static getGridConfig(params: LayoutDensityParams): GridLayoutConfig {
    const N = Math.max(1, params.itemCount);
    const aspect = Math.max(0.6, Math.min(2.4, params.aspect));

    let cols = Math.min(5, Math.max(2, Math.round(Math.sqrt(N * 1.2 * aspect))));
    if (params.viewportWidth < 640) {
      cols = Math.min(cols, 2);
    }
    const rows = Math.ceil(N / cols);
    const spacingX = 4.2;
    const spacingY = 2.85;
    const spanY = Math.max(8.0, rows * spacingY);
    const cameraZ = Math.max(6.2, Math.min(10.5, 5.0 + Math.max(cols, rows) * 0.55));

    return { cols, rows, spacingX, spacingY, spanY, cameraZ };
  }

  public static getCylinderConfig(params: LayoutDensityParams): CylinderLayoutConfig {
    const N = Math.max(1, params.itemCount);

    // Multi-tier Cylinder: 2 to 4 vertical rows
    let rows = 3;
    if (N <= 6) {
      rows = 1;
    } else if (N <= 12) {
      rows = 2;
    } else if (N >= 36) {
      rows = 4;
    }

    const cols = Math.max(3, Math.ceil(N / rows));
    const verticalSpacing = 2.45;

    // Radius ensures minimum card circumferential spacing s >= 4.4 so cards never collide
    const minArcSpacing = 4.45;
    const angleStep = (2 * Math.PI) / cols;
    const rawRadius = (cols * minArcSpacing) / (2 * Math.PI);
    const radius = Math.max(6.2, Math.min(11.5, rawRadius));

    const cameraZ = radius + 2.2;

    return { rows, cols, radius, verticalSpacing, angleStep, cameraZ };
  }

  public static getSphereConfig(params: LayoutDensityParams): SphereLayoutConfig {
    const N = Math.max(1, params.itemCount);
    const radius = Math.max(5.8, Math.min(8.8, 4.6 + Math.sqrt(N) * 0.52));
    const cameraZ = radius + 4.8;
    return { radius, cameraZ };
  }

  public static getHelixConfig(params: LayoutDensityParams): HelixLayoutConfig {
    const N = Math.max(1, params.itemCount);
    const loops = Math.max(1.8, Math.min(3.6, 1.4 + (N / 15) * 0.8));
    const radius = Math.max(5.6, Math.min(8.0, 4.6 + Math.sqrt(N) * 0.42));
    const heightSpan = Math.max(10.0, Math.min(18.0, N * 0.42 + 4.0));
    const cameraZ = radius + 3.2;
    return { loops, radius, heightSpan, cameraZ };
  }

  public static getWaveConfig(params: LayoutDensityParams): WaveLayoutConfig {
    const N = Math.max(1, params.itemCount);

    // Multi-row 3D Wave array: 2 to 4 vertical rows
    let rows = 3;
    if (N <= 6) {
      rows = 1;
    } else if (N <= 14) {
      rows = 2;
    } else if (N >= 36) {
      rows = 4;
    }

    const cols = Math.max(3, Math.ceil(N / rows));
    const spacingX = 4.2;
    const spacingY = 2.95;
    const spanX = Math.max(12.0, cols * spacingX);
    const ampY = 1.45;
    const ampZ = 1.75;
    const cameraZ = Math.max(6.8, Math.min(11.0, 5.2 + rows * 0.85));

    return { rows, cols, spacingX, spacingY, spanX, ampY, ampZ, cameraZ };
  }
}
