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

export const CURATED_CATEGORIES = [
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
 * Universal Search through `/api/search` (Aggregates DuckDuckGo Live Web + Safebooru + Wikimedia + Wikipedia)
 */
async function searchUniversalApi(keyword: string): Promise<PhotoItem[]> {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const results = data.results || [];

    return results.map((item: any, idx: number) => {
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
        camera: 'Universal Sensor',
        focalLength: 'Adaptive',
        aperture: 'f/2.0',
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
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(keyword)}&page_size=20`;
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
 * Master Real-Time Multi-Engine Image Search
 * Queries DuckDuckGo Live Web Image Search + Anime Archives + Wikimedia + Openverse
 */
export async function searchPhotos(keyword: string): Promise<PhotoItem[]> {
  const cleanKeyword = keyword.trim();
  if (!cleanKeyword) {
    return searchPhotos('雪之下雪乃');
  }

  // 1. Try Universal Multi-Engine Search API first
  const universalResults = await searchUniversalApi(cleanKeyword);
  if (universalResults.length >= 6) {
    return universalResults;
  }

  // 2. Fallback to Openverse
  const openverseResults = await searchOpenverse(cleanKeyword);
  const combined = [...universalResults, ...openverseResults];

  if (combined.length > 0) {
    return combined;
  }

  return [];
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
