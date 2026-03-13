/**
 * Точка входа: режим poll (опрос очереди) или webhook (HTTP сервер).
 */

import 'dotenv/config';
import http from 'http';
import { addTask, getNextTask, markDone, removeTask } from './tasks.js';
import { runTask } from './agent.js';

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

  const server = http.createServer(async (req, res) => {
    const url = req.url?.split('?')[0];
    if (req.method === 'GET' && (url === '/' || url === '/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'vps-autonomous-agent', mode: 'webhook' }));
      return;
    }
    if (req.method !== 'POST' || url !== '/task') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (SECRET) {
      const auth = req.headers['x-webhook-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
      if (auth !== SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

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

  server.listen(PORT, () => {
    console.log(`Webhook server on http://0.0.0.0:${PORT}/task`);
  });

  setInterval(processOneTask, 5000);
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
