import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ImageResult {
  title: string;
  image: string;
  thumbnail: string;
  url: string;
  height: number;
  width: number;
  source: string;
}

// Clean HTML tags and entities
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

function fixUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  return url;
}

/**
 * Safe JSON parser to avoid "Unexpected token < or I ... is not valid JSON"
 */
function safeJsonParse(text: string): any {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// Fallback SVG representation for images that fail upstream
function createFallbackSvg(title: string): string {
  const clean = cleanText(title) || 'Spatial Collection';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="520" viewBox="0 0 760 520">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#242834" />
        <stop offset="50%" stop-color="#181a22" />
        <stop offset="100%" stop-color="#12131a" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" rx="36" fill="url(#bg)" />
    <rect width="100%" height="100%" rx="36" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2" />
    <circle cx="380" cy="220" r="44" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" stroke-width="2" />
    <rect x="360" y="206" width="40" height="28" rx="4" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2.5" />
    <circle cx="380" cy="220" r="7" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" />
    <text x="380" y="315" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="18" font-weight="500" fill="#E5E5EA" text-anchor="middle">${clean.slice(0, 32)}</text>
    <text x="380" y="340" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="12" fill="#86868B" text-anchor="middle">Spatial Gallery Archive</text>
  </svg>`;
}

// Common character / term mapping for anime/game queries to booru tags
const ANIME_TAG_MAP: Record<string, string> = {
  '雪之下雪乃': 'yukinoshita_yukino',
  '雪乃': 'yukinoshita_yukino',
  'yukinoshita': 'yukinoshita_yukino',
  '由比滨结衣': 'yuigahama_yui',
  '一色伊吕波': 'isshiki_iroha',
  '比企谷八幡': 'hikigaya_hachiman',
  '初音未来': 'hatsune_miku',
  'miku': 'hatsune_miku',
  '原神': 'genshin_impact',
  'genshin': 'genshin_impact',
  'genshin impact': 'genshin_impact',
  '绝区零': 'zenless_zone_zero',
  'zzz': 'zenless_zone_zero',
  'zenless': 'zenless_zone_zero',
  'zenless zone zero': 'zenless_zone_zero',
  '艾莲': 'ellen_joe',
  '朱鸢': 'zhu_yuan',
  '简笃': 'jane_doe_(zenless_zone_zero)',
  '简·杜': 'jane_doe_(zenless_zone_zero)',
  '柏妮思': 'burnice_white',
  '凯撒': 'caesar_king',
  '青衣': 'qingyi_(zenless_zone_zero)',
  '星见雅': 'hoshimi_miyabi',
  '鸣潮': 'wuthering_waves',
  '今汐': 'jinshi_(wuthering_waves)',
  '长离': 'changli_(wuthering_waves)',
  '芙宁娜': 'furina_(genshin_impact)',
  '雷电将军': 'raiden_shogun',
  '纳西妲': 'nahida_(genshin_impact)',
  '胡桃': 'hu_tao_(genshin_impact)',
  '甘雨': 'ganyu_(genshin_impact)',
  '钟离': 'zhongli_(genshin_impact)',
  '刻晴': 'keqing_(genshin_impact)',
  '八重神子': 'yae_miko',
  '温迪': 'venti_(genshin_impact)',
  '魈': 'xiao_(genshin_impact)',
  '万叶': 'kaedehara_kazuha',
  '神里绫华': 'kamisato_ayaka',
  '夜兰': 'yelan_(genshin_impact)',
  '崩坏': 'honkai:_star_rail',
  '星穹铁道': 'honkai:_star_rail',
  '崩坏3': 'honkai_impact_3rd',
  '流萤': 'firefly_(honkai:_star_rail)',
  '黄泉': 'acheron_(honkai:_star_rail)',
  '卡芙卡': 'kafka_(honkai:_star_rail)',
  '三月七': 'march_7th',
  '远坂凛': 'tohsaka_rin',
  '阿尔托莉雅': 'artoria_pendragon',
  'saber': 'artoria_pendragon',
  '喜多川海梦': 'kitagawa_marin',
  '中野三玖': 'nakano_miku',
  '中野二乃': 'nakano_nino',
  '藤原千花': 'fujiwara_chika',
  '四宫辉夜': 'shinomiya_kaguya',
  '阿尼亚': 'anya_forger',
  '约尔': 'yor_forger',
  '绫波丽': 'ayanami_rei',
  '明日香': 'asuka_langley_soryu',
  '波奇酱': 'gotou_hitori',
  '后藤一里': 'gotou_hitori',
  '孤独摇滚': 'bocchi_the_rock!',
  '狂三': 'tokisaki_kurumi',
  '时崎狂三': 'tokisaki_kurumi',
  '蕾姆': 'rem_(re:zero)',
  '拉姆': 'ram_(re:zero)',
  '爱蜜莉雅': 'emilia_(re:zero)',
  '千束': 'nishikigi_chisato',
  '泷奈': 'inoue_takina',
  '间谍过家家': 'spy_x_family',
};

async function searchBingImages(query: string, safe: string): Promise<ImageResult[]> {
  try {
    const adlt = safe === 'off' ? 'off' : safe === 'strict' ? 'strict' : 'moderate';
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&adlt=${adlt}&form=HDRSC2&first=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const regex = /m="({.*?})"/g;
    let match;
    const items: ImageResult[] = [];
    const seen = new Set<string>();

    while ((match = regex.exec(html)) !== null && items.length < 35) {
      try {
        const decoded = match[1].replace(/&quot;/g, '"');
        const data = JSON.parse(decoded);
        const imgUrl = fixUrl(data.murl);
        if (!imgUrl || seen.has(imgUrl) || imgUrl.endsWith('.svg')) continue;
        seen.add(imgUrl);

        const thumbUrl = fixUrl(data.turl || imgUrl);
        const title = cleanText(data.t || data.desc || query);
        items.push({
          title: title || query,
          image: imgUrl,
          thumbnail: thumbUrl,
          url: fixUrl(data.purl || imgUrl),
          width: parseInt(data.w, 10) || 1280,
          height: parseInt(data.h, 10) || 800,
          source: safe === 'off' ? '全网图像 (安全限制: 关闭)' : 'Bing 全球图像搜索',
        });
      } catch {
        // continue
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function searchDuckDuckGo(query: string, safe: string): Promise<ImageResult[]> {
  try {
    const pVal = safe === 'off' ? '-2' : safe === 'strict' ? '1' : '-1';
    const tokenRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&kp=${pVal}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          Cookie: `kp=${pVal}`,
        },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!tokenRes.ok) return [];
    const html = await tokenRes.text();
    const match = html.match(/vqd=([0-9-]+)/) || html.match(/vqd=["']?([0-9-]+)/);
    if (!match) return [];

    const vqd = match[1];
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&p=${pVal}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Referer: 'https://duckduckgo.com/',
          Cookie: `kp=${pVal}`,
        },
        signal: AbortSignal.timeout(4000),
      }
    );

    if (!imgRes.ok) return [];

    const text = await imgRes.text();
    const data = safeJsonParse(text);
    if (!data || !Array.isArray(data.results)) return [];

    return data.results.slice(0, 30).map((r: any) => ({
      title: cleanText(r.title) || query,
      image: fixUrl(r.image),
      thumbnail: fixUrl(r.thumbnail || r.image),
      url: fixUrl(r.url || r.image),
      width: r.width || 1200,
      height: r.height || 800,
      source: 'Global Web Search',
    }));
  } catch {
    return [];
  }
}

async function searchSafebooru(tag: string): Promise<ImageResult[]> {
  try {
    const res = await fetch(
      `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(tag)}&limit=30`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return [];
    const text = await res.text();
    const data = safeJsonParse(text);
    if (!Array.isArray(data)) return [];

    return data
      .filter((item: any) => item.sample_url || item.file_url)
      .map((item: any) => {
        const direct = fixUrl(item.sample_url || item.file_url);
        const thumb = fixUrl(item.preview_url || item.sample_url || direct);
        return {
          title: `${tag.replace(/_/g, ' ')} Visual #${item.id}`,
          image: direct,
          thumbnail: thumb,
          url: `https://safebooru.org/index.php?page=post&s=view&id=${item.id}`,
          width: item.width || 1000,
          height: item.height || 1400,
          source: 'Safebooru Visual Archive',
        };
      });
  } catch {
    return [];
  }
}

async function searchYandeRe(tag: string, safe: string): Promise<ImageResult[]> {
  try {
    let tagQuery = encodeURIComponent(tag);
    if (safe === 'strict') {
      tagQuery = `rating:s+${tagQuery}`;
    } else if (safe === 'moderate') {
      tagQuery = `-rating:e+${tagQuery}`;
    } // if 'off', no rating restriction! All images returned!

    const res = await fetch(
      `https://yande.re/post.json?tags=${tagQuery}&limit=35`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return [];
    const text = await res.text();
    const data = safeJsonParse(text);
    if (!Array.isArray(data)) return [];

    return data
      .filter((item: any) => item.sample_url || item.file_url)
      .map((item: any) => {
        const direct = fixUrl(item.sample_url || item.file_url);
        const thumb = fixUrl(item.preview_url || item.sample_url || direct);
        return {
          title: `${tag.replace(/_/g, ' ')} Illustration #${item.id}`,
          image: direct,
          thumbnail: thumb,
          url: `https://yande.re/post/show/${item.id}`,
          width: item.width || 1200,
          height: item.height || 1600,
          source: 'Yande ACG Archive',
        };
      });
  } catch {
    return [];
  }
}

async function searchKonachan(tag: string, safe: string): Promise<ImageResult[]> {
  try {
    let tagQuery = encodeURIComponent(tag);
    if (safe === 'strict') {
      tagQuery = `rating:s+${tagQuery}`;
    } else if (safe === 'moderate') {
      tagQuery = `-rating:e+${tagQuery}`;
    }

    const res = await fetch(
      `https://konachan.net/post.json?tags=${tagQuery}&limit=30`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return [];
    const text = await res.text();
    const data = safeJsonParse(text);
    if (!Array.isArray(data)) return [];

    return data
      .filter((item: any) => item.sample_url || item.file_url)
      .map((item: any) => {
        const direct = fixUrl(item.sample_url || item.file_url);
        const thumb = fixUrl(item.preview_url || item.sample_url || direct);
        return {
          title: `${tag.replace(/_/g, ' ')} Artwork #${item.id}`,
          image: direct,
          thumbnail: thumb,
          url: `https://konachan.net/post/show/${item.id}`,
          width: item.width || 1200,
          height: item.height || 1600,
          source: 'Konachan Archive',
        };
      });
  } catch {
    return [];
  }
}

async function searchWikimediaCommons(query: string): Promise<ImageResult[]> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=25&prop=imageinfo&iiprop=url|size|mime&format=json&origin=*`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SpatialGallery/2.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    const data = safeJsonParse(text);
    if (!data || !data.query?.pages) return [];
    const pages = data.query.pages;

    const items: ImageResult[] = [];
    for (const key of Object.keys(pages)) {
      const p = pages[key];
      const info = p.imageinfo?.[0];
      if (info && info.url && !info.url.endsWith('.svg') && !info.url.endsWith('.tif')) {
        items.push({
          title: cleanText(p.title) || query,
          image: fixUrl(info.url),
          thumbnail: fixUrl(info.thumburl || info.url),
          url: fixUrl(info.descriptionurl || info.url),
          width: info.width || 1600,
          height: info.height || 1200,
          source: 'Wikimedia Commons Archive',
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function searchWikipediaPages(query: string): Promise<ImageResult[]> {
  try {
    const zhUrl = `https://zh.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=12&prop=pageimages|extracts&piprop=original|thumbnail&pithumbsize=1200&format=json&origin=*`;
    const enUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=12&prop=pageimages|extracts&piprop=original|thumbnail&pithumbsize=1200&format=json&origin=*`;

    const [zhRes, enRes] = await Promise.all([
      fetch(zhUrl, { headers: { 'User-Agent': 'SpatialGallery/2.0' }, signal: AbortSignal.timeout(8000) })
        .then(async (r) => (r.ok ? safeJsonParse(await r.text()) : null))
        .catch(() => null),
      fetch(enUrl, { headers: { 'User-Agent': 'SpatialGallery/2.0' }, signal: AbortSignal.timeout(8000) })
        .then(async (r) => (r.ok ? safeJsonParse(await r.text()) : null))
        .catch(() => null),
    ]);

    const items: ImageResult[] = [];
    for (const data of [zhRes, enRes]) {
      if (!data?.query?.pages) continue;
      const pages = data.query.pages;
      for (const key of Object.keys(pages)) {
        const p = pages[key];
        const img = p.original?.source || p.thumbnail?.source;
        if (img && !img.endsWith('.svg')) {
          items.push({
            title: cleanText(p.title) || query,
            image: fixUrl(img),
            thumbnail: fixUrl(p.thumbnail?.source || img),
            url: `https://wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
            width: p.original?.width || 1200,
            height: p.original?.height || 800,
            source: 'Wikipedia Encyclopedia',
          });
        }
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // CORS proxy for remote images so WebGL Three.js / Canvas never get blocked
  app.get('/api/proxy-image', async (req, res) => {
    let targetUrl = (req.query.url as string) || '';
    if (!targetUrl) {
      return res.status(400).send('Invalid url');
    }
    if (targetUrl.startsWith('//')) {
      targetUrl = 'https:' + targetUrl;
    }
    if (!targetUrl.startsWith('http')) {
      return res.status(400).send('Invalid url');
    }

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Referer: targetUrl,
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });

      if (!response.ok) {
        const fallbackSvg = createFallbackSvg(targetUrl);
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.send(fallbackSvg);
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch {
      const fallbackSvg = createFallbackSvg(targetUrl);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(fallbackSvg);
    }
  });

  // Real Multi-Engine Image Search API
  app.get('/api/search', async (req, res) => {
    const q = ((req.query.q as string) || '').trim();
    const safe = ((req.query.safe as string) || 'moderate').toLowerCase(); // 'off' | 'moderate' | 'strict'
    if (!q) {
      return res.json({ results: [] });
    }

    try {
      res.setHeader('Access-Control-Allow-Origin', '*');

      // 1. High-speed Bing Image Search with exact SafeSearch filter
      const bingPromise = searchBingImages(q, safe);

      // 2. DuckDuckGo Global Live Web Search
      const duckPromise = searchDuckDuckGo(q, safe);

      // 3. Booru anime tag mapping
      let booruTag = ANIME_TAG_MAP[q];
      if (!booruTag) {
        for (const [key, tag] of Object.entries(ANIME_TAG_MAP)) {
          if (q.includes(key) || key.includes(q)) {
            booruTag = tag;
            break;
          }
        }
      }

      const safebooruPromise = booruTag ? searchSafebooru(booruTag) : Promise.resolve([]);
      const yandePromise = booruTag ? searchYandeRe(booruTag, safe) : Promise.resolve([]);
      const konachanPromise = booruTag ? searchKonachan(booruTag, safe) : Promise.resolve([]);

      // 4. Wikimedia Commons & Wikipedia
      const wikiCommonsPromise = searchWikimediaCommons(q);
      const wikiPagePromise = searchWikipediaPages(q);

      const [bingResults, duckResults, safebooruResults, yandeResults, konachanResults, commonsResults, wikiResults] =
        await Promise.all([
          bingPromise,
          duckPromise,
          safebooruPromise,
          yandePromise,
          konachanPromise,
          wikiCommonsPromise,
          wikiPagePromise,
        ]);

      let combined: ImageResult[] = [];
      if (safebooruResults.length > 0 || yandeResults.length > 0 || konachanResults.length > 0) {
        combined = [
          ...bingResults,
          ...yandeResults,
          ...konachanResults,
          ...safebooruResults,
          ...duckResults,
          ...wikiResults,
          ...commonsResults,
        ];
      } else {
        combined = [...bingResults, ...duckResults, ...commonsResults, ...wikiResults];
      }

      // Deduplicate by image URL
      const seen = new Set<string>();
      const uniqueResults = combined.filter((item) => {
        if (!item.image || seen.has(item.image)) return false;
        seen.add(item.image);
        return true;
      });

      return res.json({ results: uniqueResults.slice(0, 50) });
    } catch {
      return res.json({ results: [] });
    }
  });

  // Mount Vite middleware in development mode
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
