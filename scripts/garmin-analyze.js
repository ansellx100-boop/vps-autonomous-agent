#!/usr/bin/env node
/**
 * CLI для анализа тренировок Garmin.
 * Примеры:
 *   npm run garmin-analyze
 *   npm run garmin-analyze -- --days 21
 *   npm run garmin-analyze -- --mock-file tests/fixtures/garmin-activities.sample.json
 */

import 'dotenv/config';
import { runTask } from '../src/agent.js';

function parseArgs(argv) {
  const parsed = {
    days: 30,
    maxActivities: 200,
    pageSize: 20,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--days') parsed.days = Number(argv[i + 1] || 30);
    if (arg === '--max-activities') parsed.maxActivities = Number(argv[i + 1] || 200);
    if (arg === '--page-size') parsed.pageSize = Number(argv[i + 1] || 20);
    if (arg === '--mock') parsed.useMock = true;
    if (arg === '--mock-file') parsed.mockFile = argv[i + 1];
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runTask({
    id: `garmin-cli-${Date.now()}`,
    payload: {
      type: 'garmin_analyze',
      ...args,
    },
  });

  console.log(result.text);
}

main().catch((err) => {
  console.error('Ошибка Garmin-анализа:', err.message);
  process.exit(1);
});
