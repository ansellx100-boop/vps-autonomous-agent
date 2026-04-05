/**
 * Интеграция с Garmin Connect: логин и загрузка активностей.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import GarminConnectModule from 'garmin-connect';

const { GarminConnect } = GarminConnectModule;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TOKEN_DIR = path.join(__dirname, '..', 'data', 'garmin-tokens');

function toBool(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function readJsonFile(filePath) {
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Mock-файл не найден: ${abs}`);
  }
  const content = fs.readFileSync(abs, 'utf8');
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error('Mock-файл должен содержать JSON-массив активностей.');
  }
  return parsed;
}

function readSleepJsonFile(filePath) {
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Sleep mock-файл не найден: ${abs}`);
  }
  const content = fs.readFileSync(abs, 'utf8');
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error('Sleep mock-файл должен содержать JSON-массив.');
  }
  return parsed;
}

export function isGarminRateLimitError(error) {
  const message = String(error?.message || error || '');
  return error?.statusCode === 429 || /\b429\b/.test(message) || /rate limit/i.test(message);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function saveTokensCompat(client, tokenDir) {
  if (typeof client.exportTokenToFile === 'function') {
    client.exportTokenToFile(tokenDir);
    return;
  }
  if (typeof client.saveTokenToFile === 'function') {
    client.saveTokenToFile(tokenDir);
    return;
  }
  const oauth1 = client?.client?.oauth1Token;
  const oauth2 = client?.client?.oauth2Token;
  if (!oauth1 || !oauth2) {
    throw new Error('Не удалось сохранить Garmin токены: отсутствуют oauth1/oauth2.');
  }
  fs.writeFileSync(path.join(tokenDir, 'oauth1_token.json'), JSON.stringify(oauth1), 'utf8');
  fs.writeFileSync(path.join(tokenDir, 'oauth2_token.json'), JSON.stringify(oauth2), 'utf8');
}

function readBackoffMs(attempt, options = {}) {
  const fromArg = toInt(options.retryBaseMs, null);
  const fromEnv = toInt(process.env.GARMIN_RETRY_BASE_MS, null);
  const base = fromArg ?? fromEnv ?? 30000;
  return base * (2 ** attempt);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAttempts(value) {
  const fallback = 4;
  const n = toInt(value, fallback);
  return n < 0 ? 0 : n;
}

export async function createGarminClient(options = {}) {
  const username = options.email || process.env.GARMIN_EMAIL;
  const password = options.password || process.env.GARMIN_PASSWORD;
  if (!username || !password) {
    throw new Error('Задайте GARMIN_EMAIL и GARMIN_PASSWORD для загрузки из Garmin Connect.');
  }

  const tokenDir = options.tokenDir || process.env.GARMIN_TOKEN_DIR || DEFAULT_TOKEN_DIR;
  const disableTokenCache = toBool(options.disableTokenCache ?? process.env.GARMIN_DISABLE_TOKEN_CACHE);
  const forceLogin = toBool(options.forceLogin ?? process.env.GARMIN_FORCE_LOGIN);
  const GarminConnectCtor = options.GarminConnectCtor || GarminConnect;
  const client = new GarminConnectCtor({ username, password });

  if (!disableTokenCache && fs.existsSync(tokenDir) && !forceLogin) {
    try {
      client.loadTokenByFile(tokenDir);
      await client.getActivities(0, 1);
      return { client, tokenDir, authMethod: 'token' };
    } catch (err) {
      if (!isGarminRateLimitError(err)) {
        // При проблеме токенов (протухли/битые) просто переходим к login().
      } else {
        throw err;
      }
    }
  }

  await client.login();
  if (!disableTokenCache) {
    ensureDir(tokenDir);
    saveTokensCompat(client, tokenDir);
  }
  return { client, tokenDir, authMethod: 'login' };
}

async function fetchActivitiesPage(client, start, limit) {
  return client.getActivities(start, limit);
}

async function fetchActivitiesWithClient(client, options = {}) {
  const days = Number(options.days ?? 30) || 30;
  const pageSize = Number(options.pageSize ?? 20) || 20;
  const maxActivities = Number(options.maxActivities ?? 200) || 200;
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const activities = [];
  let start = 0;

  while (activities.length < maxActivities) {
    const page = await fetchActivitiesPage(client, start, Math.min(pageSize, maxActivities - activities.length));
    if (!Array.isArray(page) || page.length === 0) break;

    activities.push(...page);
    start += page.length;

    const hasRecentInPage = page.some((item) => {
      const ts = new Date(item?.startTimeLocal || item?.startTimeGMT || 0).getTime();
      return Number.isFinite(ts) && ts >= sinceMs;
    });
    if (!hasRecentInPage) break;
  }

  return activities;
}

function normalizeSleepSummary(entry) {
  const dto = entry?.dailySleepDTO || entry || {};
  const score = Number(dto?.sleepScores?.overall?.value);
  const hrv = Number(entry?.avgOvernightHrv);
  const restingHr = Number(entry?.restingHeartRate);
  const sleepSeconds = Number(dto?.sleepTimeSeconds);
  return {
    calendarDate: dto?.calendarDate || null,
    sleepHours: Number.isFinite(sleepSeconds) ? round(sleepSeconds / 3600, 2) : 0,
    sleepScore: Number.isFinite(score) ? score : 0,
    avgSleepStress: Number.isFinite(Number(dto?.avgSleepStress)) ? Number(dto.avgSleepStress) : 0,
    avgOvernightHrv: Number.isFinite(hrv) ? hrv : 0,
    restingHeartRate: Number.isFinite(restingHr) ? restingHr : 0,
  };
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function fetchSleepWithClient(client, options = {}) {
  const includeSleep = toBool(options.includeSleep ?? process.env.GARMIN_INCLUDE_SLEEP ?? 1);
  if (!includeSleep) return [];
  const days = Number(options.days ?? 30) || 30;
  const requestedSleepDays = toInt(options.sleepDays ?? process.env.GARMIN_SLEEP_DAYS, Math.min(days, 90));
  const maxSleepDays = toInt(options.maxSleepDays ?? process.env.GARMIN_MAX_SLEEP_DAYS, 365);
  const sleepDays = Math.max(0, Math.min(requestedSleepDays, maxSleepDays));
  if (sleepDays <= 0) return [];

  const now = options.now instanceof Date ? options.now : new Date();
  const sleep = [];
  for (let i = 0; i < sleepDays; i += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    try {
      const data = await client.getSleepData(date);
      if (data?.dailySleepDTO) sleep.push(normalizeSleepSummary(data));
    } catch {
      // Для части дат Garmin может не вернуть sleep-данные; это не ошибка анализа.
    }
  }
  return sleep;
}

export async function fetchGarminDatasetOnce(options = {}) {
  const useMock = toBool(options.useMock ?? process.env.GARMIN_USE_MOCK);
  const mockFile = options.mockFile || process.env.GARMIN_MOCK_FILE;
  const sleepMockFile = options.sleepMockFile || process.env.GARMIN_SLEEP_MOCK_FILE;

  if (useMock || mockFile) {
    if (!mockFile) {
      throw new Error('Для mock-режима задайте GARMIN_MOCK_FILE или передайте mockFile.');
    }
    const activities = readJsonFile(mockFile);
    const sleep = sleepMockFile ? readSleepJsonFile(sleepMockFile) : [];
    return { activities, sleep };
  }

  const { client } = await createGarminClient(options);
  const activities = await fetchActivitiesWithClient(client, options);
  const sleep = await fetchSleepWithClient(client, options);
  return { activities, sleep };
}

export async function fetchGarminDataset(options = {}) {
  const attempts = parseRetryAttempts(options.retryAttempts ?? process.env.GARMIN_RETRY_ATTEMPTS);
  const fetchOnce = options.fetchOnce || fetchGarminDatasetOnce;
  const sleepFn = options.sleepFn || wait;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      return await fetchOnce(options);
    } catch (err) {
      const shouldRetry = isGarminRateLimitError(err) && attempt < attempts;
      if (!shouldRetry) throw err;
      const backoffMs = readBackoffMs(attempt, options);
      await sleepFn(backoffMs);
    }
  }
  return { activities: [], sleep: [] };
}

export async function fetchGarminActivitiesOnce(options = {}) {
  const dataset = await fetchGarminDatasetOnce(options);
  return dataset.activities;
}

export async function fetchGarminActivities(options = {}) {
  const dataset = await fetchGarminDataset(options);
  return dataset.activities;
}
