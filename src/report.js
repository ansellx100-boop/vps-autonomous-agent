/**
 * Генерация PDF-отчёта по материалам из БД за последние N дней.
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getArticlesSince } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR =
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  path.join(__dirname, '..', 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * Сгенерировать PDF-отчёт за последние days дней.
 * @param {number} [days=1]
 * @returns {Promise<{ path: string, count: number }>}
 */
export function generateReportPdf(days = 1) {
  ensureReportsDir();
  const articles = getArticlesSince(days);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `report-${date}-last${days}d.pdf`;
  const filepath = path.join(REPORTS_DIR, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    doc.fontSize(18).text('Отчёт: инновации в горнодобывающей промышленности', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Период: последние ${days} дн. Сформировано: ${new Date().toLocaleString('ru-RU')}`, { align: 'center' });
    doc.moveDown(1);

    if (articles.length === 0) {
      doc.fontSize(12).text('За выбранный период записей нет.');
      doc.end();
      stream.on('finish', () => resolve({ path: filepath, count: 0 }));
      stream.on('error', reject);
      return;
    }

    doc.fontSize(11).text(`Всего записей: ${articles.length}`, { underline: true });
    doc.moveDown(0.8);

    articles.forEach((a, i) => {
      if (i > 0) doc.addPage();
      doc.fontSize(12).text(`${i + 1}. ${(a.title || 'Без заголовка').slice(0, 200)}`, { continued: false });
      doc.fontSize(9).fillColor('#333').text(`URL: ${a.url}`, { link: a.url });
      doc.text(`Запрос: ${a.search_query || '—'} | ${a.fetched_at?.slice(0, 19) || ''}`);
      doc.moveDown(0.3);
      doc.fontSize(10).text((a.snippet || '').slice(0, 1500), { align: 'left', lineGap: 2 });
    });

    doc.end();
    stream.on('finish', () => resolve({ path: filepath, count: articles.length }));
    stream.on('error', reject);
  });
}
