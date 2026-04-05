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
const activities = JSON.parse(readFileSync(fixturePath, 'utf8'));

const metrics = analyzeGarminActivities(activities, {
  days: 30,
  now: new Date('2026-04-05T12:00:00Z'),
});

assert.strictEqual(metrics.totalActivities, 6, 'Expected 6 activities in 30-day window');
assert.strictEqual(metrics.totalDistanceKm, 59, 'Total distance should be 59.0 km');
assert.strictEqual(metrics.totalDurationHours, 6, 'Total duration should be 6.0 h');
assert.strictEqual(metrics.totalCalories, 3510, 'Total calories should be 3510');
assert.strictEqual(metrics.running.sessions, 4, 'Run-like session count should be 4');
assert.strictEqual(metrics.running.totalDistanceKm, 35, 'Run-like distance should be 35.0 km');
assert.strictEqual(metrics.running.avgHeartRate, 144, 'Run-like average HR should be rounded');

const llmInput = formatGarminMetricsForLlm(metrics);
assert.strictEqual(llmInput.periodDays, 30, 'LLM payload should include period');
assert.strictEqual(llmInput.totals.workouts, 6, 'LLM payload should include workout count');

const report = buildGarminReport(metrics, { llmInsights: 'Сделайте разгрузочный день после интервалов.' });
assert.match(report, /Анализ тренировок Garmin за 30 дн\./, 'Report should include title');
assert.match(report, /Всего тренировок: 6\./, 'Report should include totals');
assert.match(report, /AI-рекомендации:/, 'Report should include AI section');

console.log('garmin-analyzer tests: OK');
