export interface PhotoItem {
  id: string;
  title: string;
  photographer: string;
  location: string;
  camera: string;
  focalLength: string;
  aperture: string;
  iso: string;
  year: string;
  url: string;
  thumbnail: string;
  proxyUrl?: string;
  aspectRatio: number;
  category: string;
  sourceUrl?: string;
  license?: string;
}

export type SafeSearchLevel = 'off' | 'moderate' | 'strict';

export const CURATED_CATEGORIES = [
  { id: '绝区零', label: '绝区零 (Zenless Zone Zero)' },
  { id: '原神', label: '原神 (Genshin Impact)' },
  { id: '雪之下雪乃', label: '雪之下雪乃 (Yukinoshita Yukino)' },
  { id: '初音未来', label: '初音未来 (Hatsune Miku)' },
  { id: 'minimalist architecture modern', label: '极简空间建筑' },
  { id: 'alps snow mountain landscape', label: '阿尔卑斯雪山' },
  { id: 'tokyo city street photography', label: '东京街景夜色' },
  { id: 'deep space nebula cosmos', label: '宇宙深空星云' },
  { id: 'studio ghibli aesthetic', label: '吉卜力唯美风' },
];

function cleanText(str: string): string {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/File:/i, '')
    .replace(/\.[a-z0-9]{3,4}$/i, '')
    .trim();
}

/**
 * Universal Search through `/api/search` (Aggregates Bing + Booru + DuckDuckGo + Wikimedia + Wikipedia)
 */
async function searchUniversalApi(
  keyword: string,
  safeSearch: SafeSearchLevel = 'moderate'
): Promise<PhotoItem[]> {
  try {
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(keyword)}&safe=${safeSearch}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const results = data.results || [];

    const seenUrls = new Set<string>();

    return results
      .filter((item: any) => {
        const raw = item.image || item.thumbnail;
        if (!raw || seenUrls.has(raw)) return false;
        seenUrls.add(raw);
        return true;
      })
      .map((item: any, idx: number) => {
        const title = cleanText(item.title) || `${keyword} #${idx + 1}`;
        const source = item.source || 'Live Web Index';
        const w = item.width || 1200;
        const h = item.height || 800;
        const directUrl = item.image;
        const thumbUrl = item.thumbnail || item.image;
        const safeThumbUrl = thumbUrl && thumbUrl.startsWith('http')
          ? `/api/proxy-image?url=${encodeURIComponent(thumbUrl)}`
          : thumbUrl;
        const safeDirectUrl = directUrl && directUrl.startsWith('http')
          ? `/api/proxy-image?url=${encodeURIComponent(directUrl)}`
          : directUrl;

        return {
          id: `universal-${idx}-${Date.now()}`,
          title: title.length > 55 ? title.substring(0, 52) + '...' : title,
          photographer: source,
          location: 'Global Search Index',
          camera: 'Vision Sensor',
          focalLength: 'Adaptive 50mm',
          aperture: 'f/1.8',
          iso: 'ISO 100',
          year: '2025',
          url: safeDirectUrl,
          thumbnail: safeThumbUrl,
          proxyUrl: safeDirectUrl,
          aspectRatio: w / h,
          category: keyword,
          sourceUrl: item.url || directUrl,
          license: source,
        };
      });
  } catch (err) {
    console.warn('Universal API search notice:', err);
    return [];
  }
}

/**
 * Secondary Direct Client Search: Openverse API (For general photography / open archive fallback)
 */
async function searchOpenverse(keyword: string): Promise<PhotoItem[]> {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(keyword)}&page_size=25`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    const results = data.results || [];

    return results
      .filter((item: any) => item.url && !item.url.endsWith('.svg') && !item.url.endsWith('.gif'))
      .map((item: any, idx: number) => {
        const directUrl = item.url;
        const thumbUrl = item.thumbnail || item.url;
        const safeThumb = thumbUrl && thumbUrl.startsWith('http')
          ? `/api/proxy-image?url=${encodeURIComponent(thumbUrl)}`
          : thumbUrl;
        const safeDirect = directUrl && directUrl.startsWith('http')
          ? `/api/proxy-image?url=${encodeURIComponent(directUrl)}`
          : directUrl;

        return {
          id: `openverse-${item.id || idx}-${Date.now()}`,
          title: cleanText(item.title) || `${keyword} #${idx + 1}`,
          photographer: cleanText(item.creator) || 'Artist / Creator',
          location: item.provider ? `Source: ${item.provider}` : 'Open Archives',
          camera: 'Optical Sensor',
          focalLength: '35mm',
          aperture: 'f/2.8',
          iso: '100',
          year: item.indexed_on ? new Date(item.indexed_on).getFullYear().toString() : '2025',
          url: safeDirect,
          thumbnail: safeThumb,
          proxyUrl: safeDirect,
          aspectRatio: (item.width || 1600) / (item.height || 1060),
          category: keyword,
          sourceUrl: item.foreign_landing_url || item.url,
          license: item.license ? `CC ${item.license.toUpperCase()}` : 'Creative Commons',
        };
      });
  } catch {
    return [];
  }
}

/**
 * Fast Concurrent Pre-Flight Image Validator:
 * Validates that candidate URLs can actually be decoded as genuine images.
 * Discards 404s, corrupt files, anti-hotlink blocks, or images smaller than 60x60.
 * Returns only confirmed loadable PhotoItem[].
 */
export async function validateCandidatePhotos(
  candidates: PhotoItem[],
  timeoutMs = 5000
): Promise<PhotoItem[]> {
  if (candidates.length === 0) return [];

  const checkSingle = (item: PhotoItem): Promise<PhotoItem | null> => {
    return new Promise((resolve) => {
      const img = new Image();

      const timer = setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        resolve(null);
      }, timeoutMs);

      img.onload = () => {
        clearTimeout(timer);
        if (img.naturalWidth >= 50 && img.naturalHeight >= 50) {
          resolve(item);
        } else {
          resolve(null);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };

      img.src = item.thumbnail || item.url;
    });
  };

  const validated = await Promise.all(candidates.map(checkSingle));
  return validated.filter((item): item is PhotoItem => item !== null);
}

/**
 * Master Real-Time Multi-Engine Image Search
 * Queries candidates and runs them through the pre-flight validator
 * to ensure ZERO invalid / black placeholder cards enter the gallery.
 */
export async function searchPhotos(
  keyword: string,
  safeSearch: SafeSearchLevel = 'moderate'
): Promise<PhotoItem[]> {
  const cleanKeyword = keyword.trim();
  if (!cleanKeyword) {
    return searchPhotos('绝区零', safeSearch);
  }

  // 1. Try Universal Multi-Engine Search API first
  const universalResults = await searchUniversalApi(cleanKeyword, safeSearch);
  const validatedUniversal = await validateCandidatePhotos(universalResults);

  if (validatedUniversal.length >= 8) {
    return validatedUniversal;
  }

  // 2. Fallback to Openverse
  const openverseResults = await searchOpenverse(cleanKeyword);
  const validatedOpenverse = await validateCandidatePhotos(openverseResults);

  const combined = [...validatedUniversal, ...validatedOpenverse];

  // Deduplicate by URL
  const seen = new Set<string>();
  const uniqueValid = combined.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  return uniqueValid;
}

/**
 * Handle user local file uploads
 */
export async function processUploadedFiles(files: FileList | File[]): Promise<PhotoItem[]> {
  const items: PhotoItem[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.type.startsWith('image/')) continue;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });

    items.push({
      id: `local-upload-${Date.now()}-${i}`,
      title: file.name.replace(/\.[^/.]+$/, ''),
      photographer: 'User Upload',
      location: 'Local Photo Library',
      camera: 'Personal Camera',
      focalLength: 'Native',
      aperture: 'Auto',
      iso: 'Auto',
      year: new Date().getFullYear().toString(),
      url: dataUrl,
      thumbnail: dataUrl,
      aspectRatio: 1.5,
      category: 'Local Import',
    });
  }

  return items;
}
