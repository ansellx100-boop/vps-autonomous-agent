/**
 * Точка входа: режим poll (опрос очереди) или webhook (HTTP сервер).
 */

import 'dotenv/config';
import http from 'http';
import cron from 'node-cron';
import { addTask, getNextTask, markDone, removeTask, getQueueStats } from './tasks.js';
import { runTask } from './agent.js';
import { getStats as getDbStats } from './db.js';
import { startTelegramBot } from './telegram.js';
import { handleGarminUiRoute } from './web-ui.js';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const MODE = process.env.MODE || 'poll';
const POLL_INTERVAL_MS = (parseInt(process.env.POLL_INTERVAL_SEC, 10) || 60) * 1000;

async function processOneTask() {
  const task = getNextTask();
  if (!task) return false;
  console.log(`[task] ${task.id}`, task.payload);
  try {
    const result = await runTask(task);
    markDone(task.id, result);
    console.log(`[done] ${task.id}`, result.text?.slice(0, 200));
    return true;
  } catch (err) {
    console.error(`[error] ${task.id}`, err.message);
    removeTask(task.id);
  }
  return true;
}

async function pollLoop() {
  while (true) {
    const had = await processOneTask();
    if (!had) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

function startWebhookServer() {
  const PORT = parseInt(process.env.PORT, 10) || 3030;
  const SECRET = process.env.WEBHOOK_SECRET || '';

  const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || '';
  if (hasToken) {
    console.log('[telegram] TELEGRAM_BOT_TOKEN задан, TELEGRAM_WEBHOOK_URL:', webhookUrl || '(не задан — бот будет через polling)');
  } else {
    console.log('[telegram] TELEGRAM_BOT_TOKEN не задан — бот не запущен');
  }
  const telegramBot = hasToken ? startTelegramBot((payload) => addTask(payload)) : null;

  function requireAuth(req, res) {
    if (!SECRET) return true;
    const auth = req.headers['x-webhook-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (auth !== SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return false;
    }
    return true;
  }

  const server = http.createServer(async (req, res) => {
    const url = req.url?.split('?')[0];
    if (await handleGarminUiRoute(req, res, readBody)) {
      return;
    }
    if (req.method === 'GET' && (url === '/' || url === '/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'vps-autonomous-agent', mode: 'webhook' }));
      return;
    }
    if (req.method === 'GET' && url === '/status') {
      if (!requireAuth(req, res)) return;
      const stats = getQueueStats();
      let dbStats = null;
      try {
        dbStats = getDbStats();
      } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, queue: stats, db: dbStats }));
      return;
    }
    if (req.method === 'POST' && url === '/telegram-webhook' && telegramBot) {
      try {
        const body = await readBody(req);
        const update = JSON.parse(body || '{}');
        telegramBot.processUpdate(update);
      } catch (err) {
        console.error('[telegram] webhook error', err.message);
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (req.method !== 'POST' || url !== '/task') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (!requireAuth(req, res)) return;

    const body = await readBody(req);
    let payload;
    try {
      payload = JSON.parse(body || '{}');
    } catch {
      payload = { prompt: body };
    }

    const taskId = addTask(payload);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, taskId }));
  });

  server.listen(PORT, async () => {
    console.log(`Webhook server on http://0.0.0.0:${PORT}/task`);
    if (telegramBot && webhookUrl) {
      try {
        await telegramBot.setWebHook(webhookUrl);
        console.log('[telegram] Webhook установлен:', webhookUrl);
      } catch (err) {
        console.error('[telegram] setWebHook error', err.message);
      }
    } else if (telegramBot && !webhookUrl) {
      console.log('[telegram] Бот в режиме polling (TELEGRAM_WEBHOOK_URL не задан)');
    }
  });

  setInterval(processOneTask, 5000);

  const cronSchedule = process.env.CRON_COLLECT_SCHEDULE || '0 0 * * *';
  const cronEnabled = process.env.CRON_ENABLED !== '0' && process.env.CRON_ENABLED !== 'false';
  if (cronEnabled) {
    cron.schedule(cronSchedule, () => {
      const taskId = addTask({ type: 'collect' });
      console.log(`[cron] Ежедневный сбор: добавлена задача ${taskId}`);
    });
    console.log(`[cron] Расписание сбора: ${cronSchedule} (UTC)`);
  }

  const reportSchedule = process.env.CRON_REPORT_SCHEDULE || '0 9 * * *';
  const reportCronEnabled = process.env.CRON_REPORT_ENABLED !== '0' && process.env.CRON_REPORT_ENABLED !== 'false';
  if (reportCronEnabled) {
    cron.schedule(reportSchedule, () => {
      const taskId = addTask({ type: 'report', reportDays: 1 });
      console.log(`[cron] Ежедневный отчёт: добавлена задача ${taskId}`);
    });
    console.log(`[cron] Расписание отчёта (в Telegram): ${reportSchedule} (UTC)`);
  }

  if (process.env.TELEGRAM_BOT_TOKEN) {
    startTelegramBot((payload) => addTask(payload));
  }
}

async function main() {
  if (MODE === 'webhook') {
    startWebhookServer();
    return;
  }
  console.log('Poll mode: checking tasks every', POLL_INTERVAL_MS / 1000, 's');
  await pollLoop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
