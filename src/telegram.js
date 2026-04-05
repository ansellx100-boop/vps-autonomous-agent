/**
 * Отправка PDF-отчёта в Telegram и бот для команды /report.
 */

import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';

let bot = null;

function getBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (!bot) bot = new TelegramBot(token, { polling: false });
  return bot;
}

/**
 * Список chat ID, куда отправлять отчёты (из env или переданный).
 */
function getReportChatIds(overrideChatIds) {
  if (overrideChatIds && overrideChatIds.length > 0) return overrideChatIds;
  const env = process.env.TELEGRAM_REPORT_CHAT_IDS || '';
  if (!env.trim()) return [];
  return env.split(',').map((id) => id.trim()).filter(Boolean);
}

/**
 * Отправить PDF-файл отчёта в указанные чаты (или в TELEGRAM_REPORT_CHAT_IDS).
 * @param {string} filePath - путь к PDF
 * @param {number[]|string[]} [chatIds] - куда отправить (если не задано — из TELEGRAM_REPORT_CHAT_IDS)
 * @param {string} [caption] - подпись к файлу
 * @returns {Promise<{ sent: number, errors: string[] }>}
 */
export async function sendReportToTelegram(filePath, chatIds = null, caption = null) {
  const client = getBot();
  if (!client) return { sent: 0, errors: ['TELEGRAM_BOT_TOKEN не задан'] };

  const ids = getReportChatIds(chatIds ? (Array.isArray(chatIds) ? chatIds : [chatIds]) : null);
  if (ids.length === 0) return { sent: 0, errors: ['Нет TELEGRAM_REPORT_CHAT_IDS и не передан chatIds'] };

  if (!fs.existsSync(filePath)) return { sent: 0, errors: [`Файл не найден: ${filePath}`] };

  const text = caption || `Отчёт: инновации в горнодобывающей промышленности. ${new Date().toLocaleString('ru-RU')}`;
  let sent = 0;
  const errors = [];

  for (const chatId of ids) {
    try {
      await client.sendDocument(chatId, fs.createReadStream(filePath), {
        caption: text,
        filename: filePath.split('/').pop() || 'report.pdf',
      });
      sent++;
    } catch (err) {
      errors.push(`${chatId}: ${err.message}`);
    }
  }

  return { sent, errors };
}

/**
 * Запустить бота: на /report или "отчёт" ставит в очередь задачу type: report с telegramChatId.
 * Если задан TELEGRAM_WEBHOOK_URL — бот в режиме webhook (для Railway), иначе long polling.
 * @param {(payload: object) => string} addTaskFn - функция добавления задачи, возвращает taskId
 * @returns {TelegramBot|null} бот или null; при webhook вызывающий должен вызвать bot.setWebHook(url) и отдавать POST на url в bot.processUpdate(update)
 */
export function startTelegramBot(addTaskFn) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || '';
  const useWebhook = webhookUrl.length > 0;
  const bot = new TelegramBot(token, { polling: !useWebhook });

  const allowedRaw = process.env.TELEGRAM_ALLOWED_CHAT_IDS || process.env.TELEGRAM_REPORT_CHAT_IDS || '';
  const allowedChatIds = new Set(allowedRaw.split(',').map((id) => id.trim()).filter(Boolean));

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const help = `Отчёт по инновациям в горнодобывающей промышленности.\n\n` +
      `Команды:\n/report или «отчёт» — прислать PDF-отчёт за последний день.\n\n` +
      `Ваш Chat ID: \`${chatId}\`\nДобавьте его в Railway Variables: TELEGRAM_REPORT_CHAT_IDS и TELEGRAM_ALLOWED_CHAT_IDS.`;
    bot.sendMessage(chatId, help).catch(() => {});
  });

  function tryReport(chatId) {
    if (allowedChatIds.size > 0 && !allowedChatIds.has(String(chatId))) {
      bot.sendMessage(
        chatId,
        `Доступ не настроен. Ваш Chat ID: \`${chatId}\`. Добавьте его в Railway (Variables): TELEGRAM_REPORT_CHAT_IDS и TELEGRAM_ALLOWED_CHAT_IDS, затем перезапустите сервис.`
      ).catch(() => {});
      return;
    }
    addTaskFn({ type: 'report', reportDays: 1, telegramChatId: chatId });
    bot.sendMessage(chatId, 'Формирую отчёт за последний день. Отправлю в этот чат в течение минуты.').catch(() => {});
  }

  bot.onText(/\/(report|отчет|отчёт)/i, (msg) => tryReport(msg.chat.id));
  bot.on('message', (msg) => {
    const text = (msg.text || '').trim().toLowerCase();
    if (text.startsWith('/')) return;
    if (text === 'отчёт' || text === 'отчет') tryReport(msg.chat.id);
  });

  if (!useWebhook) {
    bot.on('polling_error', (err) => console.error('[telegram] polling_error', err.message));
  }

  console.log(useWebhook
    ? '[telegram] Бот в режиме webhook. Добавьте TELEGRAM_WEBHOOK_URL в Variables и укажите URL вида https://ВАШ-ДОМЕН/telegram-webhook'
    : '[telegram] Бот запущен (polling). /start — подсказка, /report или «отчёт» — запрос отчёта');
  return bot;
}
