import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createGarminClient,
  fetchGarminActivities,
  isGarminRateLimitError,
} from '../src/garmin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function cleanup(dirPath) {
  if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
}

async function testTokenFallbackToLogin() {
  const tokenDir = path.join(__dirname, '.tmp-token-fallback');
  cleanup(tokenDir);
  fs.mkdirSync(tokenDir, { recursive: true });
  fs.writeFileSync(path.join(tokenDir, 'oauth1_token.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(tokenDir, 'oauth2_token.json'), '{}', 'utf8');

  const events = [];
  class FakeGarminConnect {
    constructor() {}
    loadTokenByFile() {
      events.push('loadTokenByFile');
    }
    async getActivities(start) {
      events.push(`getActivities:${start}`);
      if (start === 0) throw new Error('Token expired');
      return [];
    }
    async login() {
      events.push('login');
    }
    exportTokenToFile() {
      events.push('exportTokenToFile');
    }
  }

  const result = await createGarminClient({
    email: 'user@example.com',
    password: 'secret',
    tokenDir,
    GarminConnectCtor: FakeGarminConnect,
  });

  assert.strictEqual(result.authMethod, 'login', 'Should fallback to login when token invalid');
  assert.deepStrictEqual(
    events,
    ['loadTokenByFile', 'getActivities:0', 'login', 'exportTokenToFile'],
    'Expected token fallback flow'
  );
  cleanup(tokenDir);
}

async function testRetryOnRateLimit() {
  let callCount = 0;
  class FakeGarminConnect {
    constructor() {}
    async login() {}
    saveTokenToFile() {}
    async getActivities() {
      callCount += 1;
      if (callCount < 3) {
        throw new Error('ERROR: (429), Too Many Requests, "Rate limited"');
      }
      return [
        {
          activityId: 1,
          activityType: { typeKey: 'street_running' },
          startTimeLocal: '2026-04-01T10:00:00',
          distance: 1000,
          duration: 300,
          calories: 80,
          averageHR: 130,
          maxHR: 150,
        },
      ];
    }
  }

  const activities = await fetchGarminActivities({
    email: 'user@example.com',
    password: 'secret',
    GarminConnectCtor: FakeGarminConnect,
    retryAttempts: 2,
    retryBaseMs: 1,
    disableTokenCache: true,
    maxActivities: 1,
    pageSize: 1,
    days: 365,
  });

  assert.strictEqual(callCount, 3, 'Should retry twice after initial failure');
  assert.strictEqual(Array.isArray(activities), true, 'Result should be array');
  assert.strictEqual(activities.length, 1, 'Should return activities after retries');
}

async function testExportMethodFallback() {
  const tokenDir = path.join(__dirname, '.tmp-token-export-fallback');
  cleanup(tokenDir);
  const events = [];
  class FakeGarminConnect {
    constructor() {
      this.client = {
        oauth1Token: { token: 'a' },
        oauth2Token: { access_token: 'b' },
      };
    }
    async login() {
      events.push('login');
    }
    async getActivities() {
      events.push('getActivities');
      return [];
    }
  }

  await createGarminClient({
    email: 'user@example.com',
    password: 'secret',
    tokenDir,
    GarminConnectCtor: FakeGarminConnect,
  });

  assert.strictEqual(fs.existsSync(path.join(tokenDir, 'oauth1_token.json')), true);
  assert.strictEqual(fs.existsSync(path.join(tokenDir, 'oauth2_token.json')), true);
  assert.deepStrictEqual(events, ['login'], 'Should login and save tokens via raw fallback');
  cleanup(tokenDir);
}

function testRateLimitDetector() {
  assert.strictEqual(
    isGarminRateLimitError(new Error('ERROR: (429), Too Many Requests')),
    true,
    'Should detect 429 from message'
  );
  assert.strictEqual(
    isGarminRateLimitError(new Error('Unauthorized')),
    false,
    'Should not detect unrelated errors'
  );
}

await testTokenFallbackToLogin();
await testRetryOnRateLimit();
await testExportMethodFallback();
testRateLimitDetector();

console.log('garmin-auth-retry tests: OK');
