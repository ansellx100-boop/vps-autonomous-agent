/**
 * Интеграция с Garmin Connect: логин и загрузка активностей.
 */

import fs from 'fs';
import path from 'path';
import GarminConnectModule from 'garmin-connect';

const { GarminConnect } = GarminConnectModule;

function toBool(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
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

export async function fetchGarminActivities(options = {}) {
  const days = Number(options.days ?? 30) || 30;
  const pageSize = Number(options.pageSize ?? 20) || 20;
  const maxActivities = Number(options.maxActivities ?? 200) || 200;
  const useMock = toBool(options.useMock ?? process.env.GARMIN_USE_MOCK);
  const mockFile = options.mockFile || process.env.GARMIN_MOCK_FILE;

  if (useMock || mockFile) {
    if (!mockFile) {
      throw new Error('Для mock-режима задайте GARMIN_MOCK_FILE или передайте mockFile.');
    }
    return readJsonFile(mockFile);
  }

  const username = options.email || process.env.GARMIN_EMAIL;
  const password = options.password || process.env.GARMIN_PASSWORD;
  if (!username || !password) {
    throw new Error('Задайте GARMIN_EMAIL и GARMIN_PASSWORD для загрузки из Garmin Connect.');
  }

  const client = new GarminConnect({ username, password });
  await client.login();

  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const activities = [];
  let start = 0;

  while (activities.length < maxActivities) {
    const page = await client.getActivities(start, Math.min(pageSize, maxActivities - activities.length));
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
