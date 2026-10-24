import * as THREE from 'three';
import { PhotoItem } from '../../services/photoSearchService';

const textureCache = new Map<string, THREE.CanvasTexture>();

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Creates Apple visionOS style photographic textures with smooth rounded corners,
 * shimmering skeleton placeholder (no pure black!), and luminous contour rim glow.
 */
export function createPhotoCardTexture(
  photo: PhotoItem,
  isHovered: boolean = false,
  isSelected: boolean = false
): THREE.CanvasTexture {
  const cacheKey = `${photo.id}_${photo.thumbnail || photo.url}_${isHovered ? '1' : '0'}_${isSelected ? '1' : '0'}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 760;
  canvas.height = 520;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const radius = 40;
  const padding = 16;
  const w = canvas.width - padding * 2;
  const h = canvas.height - padding * 2;
  const x = padding;
  const y = padding;

  const renderPlaceholder = (isError = false) => {
    ctx.save();
    drawRoundedRectPath(ctx, x, y, w, h, radius);
    ctx.clip();

    // Elegant depth-of-field glass gradient (warm slate to cool charcoal - NO pitch black!)
    const bgGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    if (isError) {
      bgGrad.addColorStop(0, '#2b2326');
      bgGrad.addColorStop(0.5, '#1e1a1e');
      bgGrad.addColorStop(1, '#151318');
    } else {
      bgGrad.addColorStop(0, '#232732');
      bgGrad.addColorStop(0.5, '#181a22');
      bgGrad.addColorStop(1, '#111218');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(x, y, w, h);

    // Subtle glass specular top-sheen
    const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.45);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, h);

    // Center Camera / Picture Icon Graphic
    const cx = x + w / 2;
    const cy = y + h * 0.42;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.arc(cx, cy, 38, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.strokeRect(cx - 20, cy - 12, 40, 26);
    ctx.beginPath();
    ctx.arc(cx, cy + 1, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Clean typography label
    ctx.font = '500 18px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(245, 245, 247, 0.85)';
    ctx.textAlign = 'center';
    const displayTitle = photo.title || photo.category || 'Spatial Photograph';
    const truncated = displayTitle.length > 28 ? displayTitle.substring(0, 26) + '...' : displayTitle;
    ctx.fillText(truncated, cx, y + h * 0.72);

    ctx.font = '400 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(134, 134, 139, 0.8)';
    ctx.fillText(isError ? 'Archive Image' : 'VisionOS Spatial Asset', cx, y + h * 0.81);

    ctx.restore();
  };

  const renderRim = () => {
    ctx.save();
    drawRoundedRectPath(ctx, x, y, w, h, radius);

    if (isSelected) {
      // Selected Hero state: intense radiant glow
      ctx.shadowColor = 'rgba(255, 255, 255, 0.95)';
      ctx.shadowBlur = 28;
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    } else if (isHovered) {
      // Focused hover state: ethereal soft glowing contour rim light
      ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
      ctx.shadowBlur = 24;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.stroke();

      ctx.shadowBlur = 8;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    } else {
      // Default resting state: subtle precision liquid glass rim
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.stroke();
    }
    ctx.restore();
  };

  // 1. Render initial shimmering skeleton placeholder immediately
  renderPlaceholder(false);
  renderRim();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  textureCache.set(cacheKey, texture);

  // 2. Asynchronously load image
  const img = new Image();
  img.crossOrigin = 'anonymous';

  let hasRetriedProxy = false;
  const primarySrc = photo.thumbnail || photo.url;
  const proxySrc = photo.proxyUrl || `/api/proxy-image?url=${encodeURIComponent(photo.url || photo.thumbnail)}`;

  img.src = primarySrc;

  const renderLoadedImage = () => {
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      drawRoundedRectPath(ctx, x, y, w, h, radius);
      ctx.clip();

      const imgW = img.naturalWidth || 760;
      const imgH = img.naturalHeight || 520;
      const imgAspect = imgW / imgH;
      const targetAspect = w / h;
      let drawW = w;
      let drawH = h;
      let drawX = x;
      let drawY = y;

      if (imgAspect > targetAspect) {
        drawW = h * imgAspect;
        drawX = x - (drawW - w) / 2;
      } else {
        drawH = w / imgAspect;
        drawY = y - (drawH - h) / 2;
      }

      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // Subtle photography depth gradient at bottom
      const grad = ctx.createLinearGradient(0, y + h * 0.6, 0, y + h);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);

      ctx.restore();

      renderRim();
      texture.needsUpdate = true;
    } catch {
      renderPlaceholder(true);
      renderRim();
      texture.needsUpdate = true;
    }
  };

  img.onload = renderLoadedImage;

  img.onerror = () => {
    if (!hasRetriedProxy && proxySrc && proxySrc !== primarySrc) {
      hasRetriedProxy = true;
      img.src = proxySrc;
    } else {
      renderPlaceholder(true);
      renderRim();
      texture.needsUpdate = true;
    }
  };

  if (img.complete && img.naturalWidth !== 0) {
    renderLoadedImage();
  }

  return texture;
}

export function clearTextureCache() {
  textureCache.forEach((tex) => tex.dispose());
  textureCache.clear();
}
