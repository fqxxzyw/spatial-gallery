import * as THREE from 'three';
import { PhotoItem } from '../../services/photoSearchService';

const textureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Creates Apple visionOS style photographic textures with smooth rounded corners,
 * resilient proxy fallback, and luminous contour rim glow.
 */
export function createPhotoCardTexture(
  photo: PhotoItem,
  isHovered: boolean = false,
  isSelected: boolean = false
): THREE.CanvasTexture {
  const cacheKey = `${photo.id}_${photo.thumbnail}_${isHovered ? '1' : '0'}_${isSelected ? '1' : '0'}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 760;
  canvas.height = 520;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Soft generous Apple rounded corner radius (44px on high-DPI canvas)
  const radius = 44;
  const padding = 16; // Margin so outer contour glow is not clipped
  const w = canvas.width - padding * 2;
  const h = canvas.height - padding * 2;
  const x = padding;
  const y = padding;

  function drawRoundedPath() {
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

  // 1. Clip rounded rectangle for image
  ctx.save();
  drawRoundedPath();
  ctx.clip();

  // Neutral dark placeholder while loading
  ctx.fillStyle = '#1c1d22';
  ctx.fillRect(x, y, w, h);

  const img = new Image();
  img.crossOrigin = 'anonymous';

  let hasTriedProxy = false;
  const primarySrc = photo.thumbnail || photo.url;
  const proxySrc = photo.proxyUrl || `/api/proxy-image?url=${encodeURIComponent(photo.url || photo.thumbnail)}`;

  img.src = primarySrc;

  const renderImage = () => {
    try {
      const imgAspect = (img.naturalWidth || 760) / (img.naturalHeight || 520);
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
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.02)');
      grad.addColorStop(0.8, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);

      texture.needsUpdate = true;
    } catch {}
  };

  img.onerror = () => {
    if (!hasTriedProxy && proxySrc && proxySrc !== primarySrc) {
      hasTriedProxy = true;
      img.src = proxySrc;
    }
  };

  if (img.complete && img.naturalWidth !== 0) {
    renderImage();
  } else {
    img.onload = renderImage;
  }

  ctx.restore();

  // 2. Luminous Contour Rim Glow ("选聚焦时，照片发出轮廓光")
  ctx.save();
  drawRoundedPath();

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
    ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
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

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  textureCache.set(cacheKey, texture);

  return texture;
}
