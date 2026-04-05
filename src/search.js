/**
 * Поиск в интернете по теме инноваций в горнодобывающей промышленности.
 * Использует DuckDuckGo через duck-duck-scrape (без API-ключа).
 */

import { search, SafeSearchType } from 'duck-duck-scrape';

const DEFAULT_QUERIES = [
  'инновации в горнодобывающей промышленности',
  'новые технологии в горнодобыче',
  'automation and AI in mineral mining industry',
  'autonomous haulage innovation in metal mining',
  'sustainable technology trends in mineral extraction',
  'digitalization in mineral mining operations',
  'безопасная автоматизация горных работ',
];
const CRYPTO_NOISE_RE = /\b(crypto|cryptocurrency|bitcoin|blockchain|kucoin|token)\b/i;

function decodeHtml(input = '') {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#27;/g, "'")
    .trim();
}

function stripHtml(input = '') {
  const decoded = decodeHtml(input);
  return decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isLikelyCryptoNoise(row) {
  const haystack = `${row?.title || ''} ${row?.snippet || ''}`;
  return CRYPTO_NOISE_RE.test(haystack);
}

function parseRssItems(xml, maxResults) {
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return itemMatches.slice(0, maxResults).map((m) => {
    const item = m[1] || '';
    const title = decodeHtml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const url = decodeHtml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const snippetRaw =
      item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ||
      item.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i)?.[1] ||
      '';
    return {
      title,
      url,
      snippet: stripHtml(snippetRaw).slice(0, 500),
    };
  }).filter((r) => r.url || r.title);
}

async function searchWebDuck(query, maxResults = 10) {
  const result = await search(query, {
    safeSearch: SafeSearchType.MODERATE,
  });
  if (result.noResults || !result.results) return [];
  return result.results.slice(0, maxResults).map((r) => ({
    title: decodeHtml(r.title || ''),
    url: r.url || '',
    snippet: decodeHtml(r.body || r.description || '').slice(0, 500),
  }));
}

async function searchWebRss(query, maxResults = 10) {
  const params = new URLSearchParams({
    q: query,
    hl: 'ru',
    gl: 'RU',
    ceid: 'RU:ru',
  });
  const url = `https://news.google.com/rss/search?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) vps-autonomous-agent/1.0',
      accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });
  if (!res.ok) {
    throw new Error(`RSS source returned ${res.status}`);
  }
  const xml = await res.text();
  return parseRssItems(xml, maxResults);
}

/**
 * Выполнить веб-поиск по одному запросу.
 * @param {string} query - поисковый запрос
 * @param {number} [maxResults=10] - макс. число результатов
 * @returns {Promise<Array<{ title: string, url: string, snippet: string }>>}
 */
export async function searchWeb(query, maxResults = 10) {
  const seen = new Set();
  const merged = [];

  const pushMany = (rows) => {
    for (const r of rows) {
      if (isLikelyCryptoNoise(r)) continue;
      const key = r.url || r.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(r);
      if (merged.length >= maxResults) break;
    }
  };

  try {
    pushMany(await searchWebDuck(query, maxResults));
  } catch (err) {
    console.error(`[search] DDG недоступен по запросу "${query}":`, err.message);
  }

  if (merged.length < maxResults) {
    try {
      pushMany(await searchWebRss(query, maxResults - merged.length));
    } catch (err) {
      console.error(`[search] RSS fallback недоступен по запросу "${query}":`, err.message);
    }
  }

  return merged.slice(0, maxResults);
}

/**
 * Собрать материалы по инновациям в горнодобыче.
 * Выполняет несколько поисковых запросов и объединяет результаты.
 * @param {object} [opts]
 * @param {string[]} [opts.queries] - свои запросы (по умолчанию DEFAULT_QUERIES)
 * @param {number} [opts.resultsPerQuery=5] - результатов на запрос
 * @returns {Promise<Array<{ title: string, url: string, snippet: string, query: string }>>}
 */
export async function searchMiningInnovation(opts = {}) {
  const queries = opts.queries || DEFAULT_QUERIES;
  const perQuery = opts.resultsPerQuery ?? 5;
  const seen = new Set();
  const all = [];

  const delayMs = opts.delayBetweenQueries ?? (parseInt(process.env.COLLECT_DELAY_BETWEEN_QUERIES_MS, 10) || 6000);
  const jitterMs = opts.delayJitterMs ?? 1000;
  for (const query of queries) {
    try {
      const results = await searchWeb(query, perQuery);
      for (const r of results) {
        const key = r.url || r.title;
        if (key && !seen.has(key)) {
          seen.add(key);
          all.push({ ...r, query });
        }
      }
    } catch (err) {
      console.error(`[search] Ошибка по запросу "${query}":`, err.message);
    }
    if (delayMs > 0) {
      const waitMs = delayMs + Math.floor(Math.random() * jitterMs);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  return all;
}

/**
 * Обратная совместимость: старое имя функции.
 */
export const searchMiningSafety = searchMiningInnovation;
