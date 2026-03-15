/**
 * SQLite-база для хранения результатов поиска по производственной безопасности.
 * Локально: data/agent.db
 * На Railway с Volume: путь из RAILWAY_VOLUME_MOUNT_PATH/agent.db
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR =
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'agent.db');

let db = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getDb() {
  if (db) return db;
  ensureDataDir();
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT,
      snippet TEXT,
      search_query TEXT,
      fetched_at TEXT NOT NULL,
      UNIQUE(url)
    );
    CREATE INDEX IF NOT EXISTS idx_articles_fetched_at ON articles(fetched_at);
    CREATE INDEX IF NOT EXISTS idx_articles_search_query ON articles(search_query);
  `);
}

/**
 * Вставить результаты поиска (дубликаты по url игнорируются).
 * @param {Array<{ url: string, title?: string, snippet?: string, query?: string }>} items
 * @returns {{ inserted: number, skipped: number }}
 */
export function insertArticles(items) {
  const database = getDb();
  const now = new Date().toISOString();
  let inserted = 0;
  let skipped = 0;
  const stmt = database.prepare(`
    INSERT OR IGNORE INTO articles (url, title, snippet, search_query, fetched_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMany = database.transaction((rows) => {
    for (const r of rows) {
      const info = stmt.run(r.url || '', r.title || '', r.snippet || '', r.query || '', now);
      if (info.changes > 0) inserted++;
      else skipped++;
    }
  });
  insertMany(items);
  return { inserted, skipped };
}

/**
 * Выбрать статьи за последние N дней (для отчёта).
 * @param {number} days
 * @returns {Array<{ id: number, url: string, title: string, snippet: string, search_query: string, fetched_at: string }>}
 */
export function getArticlesSince(days = 1) {
  const database = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const iso = since.toISOString();
  return database.prepare(`
    SELECT id, url, title, snippet, search_query, fetched_at
    FROM articles
    WHERE fetched_at >= ?
    ORDER BY fetched_at DESC
  `).all(iso);
}

/**
 * Статистика: всего записей и за последние 24 ч.
 */
export function getStats() {
  const database = getDb();
  const total = database.prepare('SELECT COUNT(*) as n FROM articles').get();
  const since = new Date();
  since.setDate(since.getDate() - 1);
  const dayAgo = database.prepare('SELECT COUNT(*) as n FROM articles WHERE fetched_at >= ?').get(since.toISOString());
  return { total: total.n, last24h: dayAgo.n };
}

/**
 * Закрыть соединение (для тестов или graceful shutdown).
 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
