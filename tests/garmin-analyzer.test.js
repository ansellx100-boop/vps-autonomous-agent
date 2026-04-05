import assert from 'assert';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  analyzeGarminActivities,
  buildGarminReport,
  formatGarminMetricsForLlm,
} from '../src/garmin-analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'garmin-activities.sample.json');
const sleepFixturePath = path.join(__dirname, 'fixtures', 'garmin-sleep.sample.json');
const activities = JSON.parse(readFileSync(fixturePath, 'utf8'));
const sleep = JSON.parse(readFileSync(sleepFixturePath, 'utf8'));

const metrics = analyzeGarminActivities(activities, {
  days: 30,
  now: new Date('2026-04-05T12:00:00Z'),
  sleep,
});

assert.strictEqual(metrics.totalActivities, 6, 'Expected 6 activities in 30-day window');
assert.strictEqual(metrics.totalDistanceKm, 59, 'Total distance should be 59.0 km');
assert.strictEqual(metrics.totalDurationHours, 6, 'Total duration should be 6.0 h');
assert.strictEqual(metrics.totalCalories, 3510, 'Total calories should be 3510');
assert.strictEqual(metrics.running.sessions, 4, 'Run-like session count should be 4');
assert.strictEqual(metrics.running.totalDistanceKm, 35, 'Run-like distance should be 35.0 km');
assert.strictEqual(metrics.running.avgHeartRate, 144, 'Run-like average HR should be rounded');
assert.strictEqual(metrics.running.avgPower, 210, 'Run-like average power should be rounded');
assert.strictEqual(metrics.hrPowerDynamics.last7.avgHeartRate, 140, '7d average HR should be computed');
assert.strictEqual(metrics.hrPowerDynamics.last7.avgPower, 202, '7d average power should be computed');
assert.strictEqual(metrics.sleepQuality.daysCaptured, 14, 'Sleep rows should be included');
assert.strictEqual(metrics.sleepQuality.avgSleepHours, 6.71, 'Average sleep hours should be computed');
assert.strictEqual(metrics.sleepQuality.avgSleepScore, 71, 'Average sleep score should be rounded');
assert.strictEqual(metrics.sleepQuality.trend7d.last7AvgSleepScore, 75, 'Last 7d sleep score should be computed');

const llmInput = formatGarminMetricsForLlm(metrics);
assert.strictEqual(llmInput.periodDays, 30, 'LLM payload should include period');
assert.strictEqual(llmInput.totals.workouts, 6, 'LLM payload should include workout count');
assert.strictEqual(llmInput.hrPowerDynamics.last7.avgPower, 202, 'LLM payload should include power dynamics');
assert.strictEqual(llmInput.sleepQuality.daysCaptured, 14, 'LLM payload should include sleep quality block');

const report = buildGarminReport(metrics, { llmInsights: 'Сделайте разгрузочный день после интервалов.' });
assert.match(report, /Анализ тренировок Garmin за 30 дн\./, 'Report should include title');
assert.match(report, /Всего тренировок: 6\./, 'Report should include totals');
assert.match(report, /Динамика пульса\/мощности 7 vs 7:/, 'Report should include HR/Power dynamics');
assert.match(report, /Сон:/, 'Report should include sleep block');
assert.match(report, /AI-рекомендации:/, 'Report should include AI section');

console.log('garmin-analyzer tests: OK');
