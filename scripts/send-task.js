#!/usr/bin/env node
/**
 * Отправить задачу агенту с локального ПК (из Cursor или терминала).
 * Использование: npm run send-task "текст задания"
 *               node scripts/send-task.js "текст задания"
 *
 * В .env задайте AGENT_URL (например https://ваш-проект.up.railway.app) и при необходимости WEBHOOK_SECRET.
 */

import 'dotenv/config';
import https from 'https';
import http from 'http';

const AGENT_URL = process.env.AGENT_URL?.replace(/\/$/, '');
const SECRET = process.env.WEBHOOK_SECRET || '';

const prompt = process.argv.slice(2).join(' ').trim() || process.env.TASK_PROMPT;
if (!prompt) {
  console.error('Использование: npm run send-task "ваш запрос к агенту"');
  console.error('Или задайте TASK_PROMPT в .env');
  process.exit(1);
}

if (!AGENT_URL) {
  console.error('Задайте AGENT_URL в .env — URL вашего агента (например https://ваш-проект.up.railway.app)');
  process.exit(1);
}

const url = new URL(`${AGENT_URL}/task`);
const body = JSON.stringify({ prompt });
const options = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...(SECRET && { 'X-Webhook-Secret': SECRET }),
  },
};

const client = url.protocol === 'https:' ? https : http;
const req = client.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode >= 400) {
      console.error('Ошибка:', res.statusCode, data);
      process.exit(1);
    }
    try {
      const json = JSON.parse(data);
      console.log('Задача отправлена:', json.taskId || json);
    } catch {
      console.log(data);
    }
  });
});
req.on('error', (err) => {
  console.error('Ошибка запроса:', err.message);
  process.exit(1);
});
req.write(body);
req.end();
