/**
 * Источник задач для агента.
 * Сейчас — простая файловая очередь (папка tasks/).
 * Можно заменить на Redis, API, БД.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = path.join(__dirname, '..', 'tasks');
const PENDING = 'pending';
const DONE = 'done';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(TASKS_DIR);
ensureDir(path.join(TASKS_DIR, PENDING));
ensureDir(path.join(TASKS_DIR, DONE));

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Добавить задачу в очередь (например из webhook или Telegram).
 */
export function addTask(payload) {
  const taskId = id();
  const file = path.join(TASKS_DIR, PENDING, `${taskId}.json`);
  const task = {
    id: taskId,
    createdAt: new Date().toISOString(),
    payload: typeof payload === 'string' ? { prompt: payload } : payload,
  };
  fs.writeFileSync(file, JSON.stringify(task, null, 2), 'utf8');
  return taskId;
}

/**
 * Взять следующую задачу из очереди (FIFO по имени файла).
 */
export function getNextTask() {
  const dir = path.join(TASKS_DIR, PENDING);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) return null;
  const file = path.join(dir, files[0]);
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Пометить задачу выполненной (переместить в done/).
 */
export function markDone(taskId, result = null) {
  const src = path.join(TASKS_DIR, PENDING, `${taskId}.json`);
  const dest = path.join(TASKS_DIR, DONE, `${taskId}.json`);
  if (!fs.existsSync(src)) return;
  const task = JSON.parse(fs.readFileSync(src, 'utf8'));
  task.doneAt = new Date().toISOString();
  if (result != null) task.result = result;
  fs.writeFileSync(dest, JSON.stringify(task, null, 2), 'utf8');
  fs.unlinkSync(src);
}

/**
 * Удалить задачу из очереди (при ошибке можно оставить в pending или переместить в failed).
 */
export function removeTask(taskId) {
  const src = path.join(TASKS_DIR, PENDING, `${taskId}.json`);
  if (fs.existsSync(src)) fs.unlinkSync(src);
}
