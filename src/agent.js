/**
 * Лёгкий агент: LLM по задаче + поиск в интернете (тип задачи collect).
 */

import OpenAI from 'openai';
import { searchMiningSafety } from './search.js';
import { insertArticles, getStats } from './db.js';
import { generateReportPdf } from './report.js';
import { sendReportToTelegram } from './telegram.js';
import { fetchGarminActivities } from './garmin.js';
import {
  analyzeGarminActivities,
  buildGarminReport,
  formatGarminMetricsForLlm,
} from './garmin-analyzer.js';

let openai = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  if (!openai) openai = new OpenAI({ apiKey });
  return openai;
}

/**
 * Выполнить сбор данных по производственной безопасности в горнодобыче.
 * Результаты сохраняются в SQLite (data/agent.db).
 */
async function runCollect() {
  const items = await searchMiningSafety({ resultsPerQuery: 5 });
  const rows = items.map((r) => ({
    url: r.url,
    title: r.title,
    snippet: r.snippet,
    query: r.query,
  }));
  const { inserted, skipped } = insertArticles(rows);
  const stats = getStats();
  return {
    text: `Собрано ${items.length} результатов. В БД добавлено: ${inserted}, дубликатов пропущено: ${skipped}. Всего в БД: ${stats.total} записей.`,
    searchCount: items.length,
    inserted,
    skipped,
    totalInDb: stats.total,
    items: items.slice(0, 20),
  };
}

async function runGarminAnalyze(payload = {}) {
  const days = Number(payload.days ?? payload.periodDays ?? 30) || 30;
  const maxActivities = Number(payload.maxActivities ?? 200) || 200;
  const pageSize = Number(payload.pageSize ?? 20) || 20;

  const activities = await fetchGarminActivities({
    days,
    maxActivities,
    pageSize,
    useMock: payload.useMock,
    mockFile: payload.mockFile,
    email: payload.garminEmail,
    password: payload.garminPassword,
    tokenDir: payload.tokenDir,
    disableTokenCache: payload.disableTokenCache,
    forceLogin: payload.forceLogin,
    retryAttempts: payload.retryAttempts,
    retryBaseMs: payload.retryBaseMs,
  });

  const metrics = analyzeGarminActivities(activities, { days });
  let llmInsights = '';

  try {
    const client = getClient();
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const brief = formatGarminMetricsForLlm(metrics);
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Ты опытный беговой/фитнес-тренер. Дай короткий и практичный разбор нагрузки, рисков и 3-5 рекомендаций на следующую неделю. Отвечай на русском.',
        },
        {
          role: 'user',
          content: `Данные тренировок:\n${JSON.stringify(brief, null, 2)}`,
        },
      ],
      max_tokens: 600,
    });
    llmInsights = completion.choices?.[0]?.message?.content?.trim() || '';
  } catch (err) {
    llmInsights = `AI-разбор недоступен: ${err.message}`;
  }

  const reportText = buildGarminReport(metrics, { llmInsights });
  return {
    text: reportText,
    garmin: {
      periodDays: days,
      fetchedActivities: activities.length,
      analyzedActivities: metrics.totalActivities,
      metrics,
    },
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
  const isMiningSafetyCollect =
    (promptLower.includes('искать в интернете') || promptLower.includes('сбор')) &&
    (promptLower.includes('производственн') || promptLower.includes('горнодобыва') || promptLower.includes('безопасност'));
  const type = payload.type === 'collect' || isMiningSafetyCollect ? 'collect' : null;

  if (type === 'collect') {
    const result = await runCollect();
    return result;
  }

  if (payload.type === 'garmin_analyze' || payload.type === 'garmin') {
    return runGarminAnalyze(payload);
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
