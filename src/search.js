/**
 * Поиск в интернете по теме производственной безопасности в горнодобыче.
 * Использует DuckDuckGo через duck-duck-scrape (без API-ключа).
 */

import { search, SafeSearchType } from 'duck-duck-scrape';

const DEFAULT_QUERIES = [
  'производственная безопасность горнодобывающая отрасль',
  'охрана труда в горной промышленности',
  'безопасность на горнодобывающих предприятиях',
  'травматизм горнодобывающая промышленность',
  'Ростехнадзор горные работы',
];

/**
 * Выполнить веб-поиск по одному запросу.
 * @param {string} query - поисковый запрос
 * @param {number} [maxResults=10] - макс. число результатов
 * @returns {Promise<Array<{ title: string, url: string, snippet: string }>>}
 */
export async function searchWeb(query, maxResults = 10) {
  const result = await search(query, {
    safeSearch: SafeSearchType.MODERATE,
  });
  if (result.noResults || !result.results) return [];
  return result.results.slice(0, maxResults).map((r) => ({
    title: (r.title || '').replace(/&#27;/g, "'"),
    url: r.url || '',
    snippet: (r.body || r.description || '').slice(0, 500),
  }));
}

/**
 * Собрать данные по производственной безопасности в горнодобыче.
 * Выполняет несколько поисковых запросов и объединяет результаты.
 * @param {object} [opts]
 * @param {string[]} [opts.queries] - свои запросы (по умолчанию DEFAULT_QUERIES)
 * @param {number} [opts.resultsPerQuery=5] - результатов на запрос
 * @returns {Promise<Array<{ title: string, url: string, snippet: string, query: string }>>}
 */
export async function searchMiningSafety(opts = {}) {
  const queries = opts.queries || DEFAULT_QUERIES;
  const perQuery = opts.resultsPerQuery ?? 5;
  const seen = new Set();
  const all = [];

  const delayMs = (opts.delayBetweenQueries ?? 2000);
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
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  return all;
}
