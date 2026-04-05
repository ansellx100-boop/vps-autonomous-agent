/**
 * Лёгкий агент: LLM по задаче + поиск в интернете (тип задачи collect).
 */

import OpenAI from 'openai';
import { searchMiningInnovation } from './search.js';
import { insertArticles, getStats } from './db.js';
import { generateReportPdf } from './report.js';
import { sendReportToTelegram } from './telegram.js';

let openai = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  if (!openai) openai = new OpenAI({ apiKey });
  return openai;
}

/**
 * Выполнить сбор материалов по инновациям в горнодобывающей промышленности.
 * Результаты сохраняются в SQLite (data/agent.db).
 */
async function runCollect() {
  const resultsPerQuery = parseInt(process.env.COLLECT_RESULTS_PER_QUERY, 10) || 5;
  const items = await searchMiningInnovation({ resultsPerQuery });
  const rows = items.map((r) => ({
    url: r.url,
    title: r.title,
    snippet: r.snippet,
    query: r.query,
  }));
  const { inserted, skipped } = insertArticles(rows);
  const stats = getStats();
  return {
    text: `Собрано ${items.length} материалов об инновациях в горнодобыче. В БД добавлено: ${inserted}, дубликатов пропущено: ${skipped}. Всего в БД: ${stats.total} записей.`,
    searchCount: items.length,
    inserted,
    skipped,
    totalInDb: stats.total,
    items: items.slice(0, 20),
  };
}

/**
 * Выполнить одну задачу через LLM или поиск (type: collect).
 * @param {object} task - { id, payload: { prompt?, type?, ... } }
 * @returns {Promise<{ text: string, searchCount?: number, items?: array }>}
 */
export async function runTask(task) {
  const payload = task.payload || {};
  const promptLower = (payload.prompt || '').toLowerCase();
  const asksToCollect =
    promptLower.includes('искать в интернете') ||
    promptLower.includes('сбор') ||
    promptLower.includes('мониторинг') ||
    promptLower.includes('новости');
  const isInnovationTopic =
    promptLower.includes('инновац') ||
    promptLower.includes('иновац') ||
    promptLower.includes('innovation');
  const isMiningTopic =
    promptLower.includes('горнодобыв') ||
    promptLower.includes('горной промышлен') ||
    promptLower.includes('mining');

  const isMiningInnovationCollect = asksToCollect && isInnovationTopic && isMiningTopic;
  const type = payload.type === 'collect' || isMiningInnovationCollect ? 'collect' : null;

  if (type === 'collect') {
    const result = await runCollect();
    return result;
  }

  const reportDays = payload.reportDays ?? (payload.days ?? 1);
  if (payload.type === 'report' || (typeof payload.type === 'string' && payload.type.toLowerCase() === 'report')) {
    const { path: pdfPath, count } = await generateReportPdf(reportDays);
    const telegramChatId = payload.telegramChatId ? [String(payload.telegramChatId)] : null;
    const telegramResult = await sendReportToTelegram(pdfPath, telegramChatId);
    return {
      text: `Сформирован PDF-отчёт за последние ${reportDays} дн. Записей: ${count}. Файл: ${pdfPath}. В Telegram отправлено: ${telegramResult.sent} чат(ов).`,
      reportPath: pdfPath,
      reportCount: count,
      telegramSent: telegramResult.sent,
      telegramErrors: telegramResult.errors,
    };
  }

  const prompt =
    typeof payload.prompt === 'string'
      ? payload.prompt
      : JSON.stringify(payload);

  const client = getClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          process.env.AGENT_SYSTEM_PROMPT ||
          'You are a helpful autonomous assistant. Reply concisely. If the user asks to do something that requires external actions (email, API, file), describe the steps or say what is needed.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 1024,
  });

  const text =
    completion.choices?.[0]?.message?.content?.trim() || '(no response)';
  return { text };
}
