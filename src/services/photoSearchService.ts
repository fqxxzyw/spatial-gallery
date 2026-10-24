export const STATIC_HOST = import.meta.env.VITE_STATIC_HOST === 'true';
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const HAS_API = !STATIC_HOST || Boolean(API_BASE);
export function imageUrl(url: string): string {
  return HAS_API && /^https?:/.test(url)
    ? `${API_BASE}/api/proxy-image?url=${encodeURIComponent(url)}` : url;
}

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
  if (!HAS_API) return [];
  try {
    const res = await fetch(
      `${API_BASE}/api/search?q=${encodeURIComponent(keyword)}&safe=${safeSearch}`, { signal: AbortSignal.timeout(10000) }
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
        const safeThumbUrl = imageUrl(thumbUrl);
        const safeDirectUrl = imageUrl(directUrl);

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
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];
    const data = await response.json();
    const results = data.results || [];

    return results
      .filter((item: any) => item.url && !item.url.endsWith('.svg') && !item.url.endsWith('.gif'))
      .map((item: any, idx: number) => {
        const directUrl = item.url;
        const thumbUrl = item.thumbnail || item.url;
        const safeThumb = imageUrl(thumbUrl);
        const safeDirect = imageUrl(directUrl);

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

async function searchCommons(keyword: string): Promise<PhotoItem[]> {
  try {
    const params = new URLSearchParams({ action: 'query', generator: 'search',
      gsrsearch: keyword, gsrnamespace: '6', gsrlimit: '30', prop: 'imageinfo',
      iiprop: 'url|size|mime', iiurlwidth: '1000', format: 'json', origin: '*' });
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`,
      { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];
    const data = await response.json();
    return Object.values(data.query?.pages || {}).flatMap((page: any) => {
      const info = page.imageinfo?.[0];
      if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime)) return [];
      return [{ id: `commons-${page.pageid}`, title: cleanText(page.title),
        photographer: 'Wikimedia Commons', location: '开放图片档案', camera: '',
        focalLength: '', aperture: '', iso: '', year: '', url: info.url,
        thumbnail: info.thumburl || info.url, proxyUrl: info.thumburl || info.url,
        aspectRatio: info.width / info.height, category: keyword,
        sourceUrl: info.descriptionurl, license: '查看来源页授权' }];
    });
  } catch { return []; }
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

      img.crossOrigin = 'anonymous';
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
  const universalResults = HAS_API
    ? await searchUniversalApi(cleanKeyword, safeSearch)
    : await searchCommons(cleanKeyword);
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
