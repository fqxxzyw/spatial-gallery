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
  '芙宁娜': 'furina_(genshin_impact)',
  '雷电将军': 'raiden_shogun',
  '纳西妲': 'nahida_(genshin_impact)',
  '胡桃': 'hu_tao_(genshin_impact)',
  '甘雨': 'ganyu_(genshin_impact)',
  '钟离': 'zhongli_(genshin_impact)',
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
  '原神': 'genshin_impact',
  '崩坏': 'honkai:_star_rail',
};

async function searchDuckDuckGo(query: string): Promise<ImageResult[]> {
  try {
    const tokenRes = await fetch('https://duckduckgo.com/?q=' + encodeURIComponent(query), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (!tokenRes.ok) return [];
    const html = await tokenRes.text();
    const match = html.match(/vqd=([0-9-]+)/) || html.match(/vqd=["']?([0-9-]+)/);
    if (!match) return [];

    const vqd = match[1];
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://duckduckgo.com/',
        },
      }
    );

    if (!imgRes.ok) return [];

    const text = await imgRes.text();
    const data = safeJsonParse(text);
    if (!data || !Array.isArray(data.results)) return [];

    return data.results.slice(0, 30).map((r: any) => ({
      title: cleanText(r.title) || query,
      image: r.image,
      thumbnail: r.thumbnail || r.image,
      url: r.url || r.image,
      width: r.width || 1200,
      height: r.height || 800,
      source: 'Global Web Search',
    }));
  } catch {
    // Non-throwing silent fallback
    return [];
  }
}

async function searchSafebooru(tag: string): Promise<ImageResult[]> {
  try {
    const res = await fetch(
      `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(tag)}&limit=25`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    );
    if (!res.ok) return [];
    const text = await res.text();
    const data = safeJsonParse(text);
    if (!Array.isArray(data)) return [];

    return data
      .filter((item: any) => item.sample_url || item.file_url)
      .map((item: any) => ({
        title: `${tag.replace(/_/g, ' ')} Visual #${item.id}`,
        image: item.sample_url || item.file_url,
        thumbnail: item.preview_url || item.sample_url,
        url: `https://safebooru.org/index.php?page=post&s=view&id=${item.id}`,
        width: item.width || 1000,
        height: item.height || 1400,
        source: 'Safebooru Visual Archive',
      }));
  } catch {
    return [];
  }
}

async function searchYandeRe(tag: string): Promise<ImageResult[]> {
  try {
    const res = await fetch(
      `https://yande.re/post.json?tags=rating:s+${encodeURIComponent(tag)}&limit=20`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    );
    if (!res.ok) return [];
    const text = await res.text();
    const data = safeJsonParse(text);
    if (!Array.isArray(data)) return [];

    return data
      .filter((item: any) => item.sample_url || item.file_url)
      .map((item: any) => ({
        title: `${tag.replace(/_/g, ' ')} Illustration #${item.id}`,
        image: item.sample_url || item.file_url,
        thumbnail: item.preview_url || item.sample_url,
        url: `https://yande.re/post/show/${item.id}`,
        width: item.width || 1200,
        height: item.height || 1600,
        source: 'Yande ACG Archive',
      }));
  } catch {
    return [];
  }
}

async function searchWikimediaCommons(query: string): Promise<ImageResult[]> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=25&prop=imageinfo&iiprop=url|size|mime&format=json&origin=*`;
    const res = await fetch(url, { headers: { 'User-Agent': 'SpatialGallery/2.0' } });
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
          image: info.url,
          thumbnail: info.thumburl || info.url,
          url: info.descriptionurl || info.url,
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
      fetch(zhUrl, { headers: { 'User-Agent': 'SpatialGallery/2.0' } })
        .then(async (r) => (r.ok ? safeJsonParse(await r.text()) : null))
        .catch(() => null),
      fetch(enUrl, { headers: { 'User-Agent': 'SpatialGallery/2.0' } })
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
            image: img,
            thumbnail: p.thumbnail?.source || img,
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
    const targetUrl = req.query.url as string;
    if (!targetUrl || !targetUrl.startsWith('http')) {
      return res.status(400).send('Invalid url');
    }

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: targetUrl,
        },
      });

      if (!response.ok) {
        return res.status(response.status).send('Failed to fetch image');
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch {
      res.status(500).send('Proxy error');
    }
  });

  // Real Multi-Engine Image Search API
  app.get('/api/search', async (req, res) => {
    const q = ((req.query.q as string) || '').trim();
    if (!q) {
      return res.json({ results: [] });
    }

    try {
      res.setHeader('Access-Control-Allow-Origin', '*');

      // 1. DuckDuckGo Global Live Web Search (safely handled)
      const duckPromise = searchDuckDuckGo(q);

      // 2. Booru anime tag mapping
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
      const yandePromise = booruTag ? searchYandeRe(booruTag) : Promise.resolve([]);

      // 3. Wikimedia Commons & Wikipedia
      const wikiCommonsPromise = searchWikimediaCommons(q);
      const wikiPagePromise = searchWikipediaPages(q);

      const [duckResults, safebooruResults, yandeResults, commonsResults, wikiResults] =
        await Promise.all([
          duckPromise,
          safebooruPromise,
          yandePromise,
          wikiCommonsPromise,
          wikiPagePromise,
        ]);

      let combined: ImageResult[] = [];
      if (safebooruResults.length > 0 || yandeResults.length > 0) {
        combined = [
          ...safebooruResults,
          ...yandeResults,
          ...duckResults,
          ...wikiResults,
          ...commonsResults,
        ];
      } else {
        combined = [...duckResults, ...commonsResults, ...wikiResults];
      }

      // Deduplicate by image URL
      const seen = new Set<string>();
      const uniqueResults = combined.filter((item) => {
        if (!item.image || seen.has(item.image)) return false;
        seen.add(item.image);
        return true;
      });

      return res.json({ results: uniqueResults.slice(0, 40) });
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
