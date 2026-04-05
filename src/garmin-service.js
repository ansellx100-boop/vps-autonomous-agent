/**
 * Сервис анализа тренировок Garmin (активности + сон + AI-разбор).
 */

import OpenAI from 'openai';
import { fetchGarminDataset } from './garmin.js';
import {
  analyzeGarminActivities,
  buildGarminReport,
  formatGarminMetricsForLlm,
} from './garmin-analyzer.js';

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function shouldUseMock(payload = {}) {
  if (toBool(payload.useMock, false)) return true;
  if (payload.mockFile && String(payload.mockFile).trim()) return true;
  return false;
}

export async function runGarminAnalysis(payload = {}) {
  const days = toNumber(payload.days ?? payload.periodDays, 30);
  const maxActivities = toNumber(payload.maxActivities, 200);
  const pageSize = toNumber(payload.pageSize, 20);
  const useMock = shouldUseMock(payload);

  const dataset = await fetchGarminDataset({
    days,
    maxActivities,
    pageSize,
    useMock,
    mockFile: payload.mockFile,
    sleepMockFile: payload.sleepMockFile,
    email: payload.garminEmail,
    password: payload.garminPassword,
    tokenDir: payload.tokenDir,
    disableTokenCache: payload.disableTokenCache,
    forceLogin: payload.forceLogin,
    retryAttempts: payload.retryAttempts,
    retryBaseMs: payload.retryBaseMs,
    includeSleep: payload.includeSleep,
    sleepDays: payload.sleepDays,
    maxSleepDays: payload.maxSleepDays,
  });
  const activities = dataset.activities || [];
  const sleep = dataset.sleep || [];

  const metrics = analyzeGarminActivities(activities, { days, sleep });
  const noAi = toBool(payload.noAi, false);
  const openaiApiKey = payload.openaiApiKey || process.env.OPENAI_API_KEY;
  const model = payload.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  let llmInsights = '';

  if (!noAi && openaiApiKey) {
    try {
      const client = new OpenAI({ apiKey: openaiApiKey });
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
        max_tokens: 700,
      });
      llmInsights = completion.choices?.[0]?.message?.content?.trim() || '';
    } catch (err) {
      llmInsights = `AI-разбор недоступен: ${err.message}`;
    }
  } else if (noAi) {
    llmInsights = 'AI-разбор отключён флагом noAi.';
  } else {
    llmInsights = 'AI-разбор пропущен: OPENAI_API_KEY не задан.';
  }

  const reportText = buildGarminReport(metrics, { llmInsights });
  return {
    text: reportText,
    garmin: {
      periodDays: days,
      fetchedActivities: activities.length,
      fetchedSleepDays: sleep.length,
      analyzedActivities: metrics.totalActivities,
      metrics,
    },
  };
}
