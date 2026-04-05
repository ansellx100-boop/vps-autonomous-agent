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
    retryAttempts: undefined,
    retryBaseMs: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--days') parsed.days = Number(argv[i + 1] || 30);
    if (arg === '--max-activities') parsed.maxActivities = Number(argv[i + 1] || 200);
    if (arg === '--page-size') parsed.pageSize = Number(argv[i + 1] || 20);
    if (arg === '--retry-attempts') parsed.retryAttempts = Number(argv[i + 1] || 4);
    if (arg === '--retry-base-ms') parsed.retryBaseMs = Number(argv[i + 1] || 30000);
    if (arg === '--mock') parsed.useMock = true;
    if (arg === '--mock-file') parsed.mockFile = argv[i + 1];
    if (arg === '--token-dir') parsed.tokenDir = argv[i + 1];
    if (arg === '--disable-token-cache') parsed.disableTokenCache = true;
    if (arg === '--force-login') parsed.forceLogin = true;
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
