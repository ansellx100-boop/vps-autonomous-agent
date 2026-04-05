/**
 * Веб-интерфейс для запуска и просмотра Garmin-анализа.
 */

import { runGarminAnalysis } from './garmin-service.js';

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildPageHtml({ result = null, error = '' } = {}) {
  const resultJson = result ? escapeHtml(JSON.stringify(result.garmin?.metrics || {}, null, 2)) : '';
  const reportText = result ? escapeHtml(result.text || '') : '';
  const errorText = error ? `<div class="error">${escapeHtml(error)}</div>` : '';
  const output = result
    ? `
      <section class="card">
        <h2>Текстовый отчёт</h2>
        <pre>${reportText}</pre>
      </section>
      <section class="card">
        <h2>Структурированные метрики (JSON)</h2>
        <pre>${resultJson}</pre>
      </section>
    `
    : '';

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Garmin Analytics UI</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f7fb; color: #0f172a; margin: 0; padding: 24px; }
      .wrap { max-width: 980px; margin: 0 auto; display: grid; gap: 16px; }
      .card { background: #fff; border-radius: 14px; box-shadow: 0 4px 18px rgba(15, 23, 42, 0.08); padding: 16px; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      h2 { margin: 0 0 10px; font-size: 18px; }
      form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
      label { display: flex; flex-direction: column; font-size: 13px; gap: 6px; color: #334155; }
      input, select { border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 10px; font-size: 14px; }
      .row { display: flex; align-items: center; gap: 8px; font-size: 14px; }
      .actions { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      button { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 10px 14px; font-weight: 600; cursor: pointer; }
      button:hover { background: #1d4ed8; }
      button:disabled { background: #94a3b8; cursor: not-allowed; }
      .muted { font-size: 12px; color: #64748b; }
      .status { font-size: 13px; color: #1d4ed8; display: none; }
      .status.visible { display: inline-flex; }
      pre { margin: 0; white-space: pre-wrap; word-break: break-word; background: #0b1220; color: #dbeafe; border-radius: 8px; padding: 12px; max-height: 480px; overflow: auto; }
      .error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; border-radius: 10px; padding: 10px 12px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="card">
        <h1>Garmin Analytics UI</h1>
        <p class="muted">Запускает анализ тренировок, динамики HR/Power и качества сна через ваш Garmin-аккаунт.</p>
        ${errorText}
        <form id="garmin-form" method="POST" action="/garmin-ui/analyze">
          <label>Garmin Email
            <input name="garminEmail" type="email" placeholder="you@example.com" />
          </label>
          <label>Garmin Password
            <input name="garminPassword" type="password" placeholder="••••••••" />
          </label>
          <label>Период (дней)
            <input name="days" type="number" min="1" value="30" />
          </label>
          <label>Макс. активностей
            <input name="maxActivities" type="number" min="1" value="2000" />
          </label>
          <label>История сна (дней)
            <input name="sleepDays" type="number" min="0" value="30" />
          </label>
          <label>OpenAI API Key (необязательно)
            <input name="openaiApiKey" type="password" placeholder="sk-..." />
          </label>
          <label>Mock file тренировок (опционально)
            <input name="mockFile" type="text" placeholder="tests/fixtures/garmin-activities.sample.json" />
          </label>
          <label>Mock file сна (опционально)
            <input name="sleepMockFile" type="text" placeholder="tests/fixtures/garmin-sleep.sample.json" />
          </label>
          <div class="row">
            <input id="includeSleep" name="includeSleep" type="checkbox" checked />
            <label for="includeSleep">Включать анализ сна</label>
          </div>
          <div class="row">
            <input id="useMock" name="useMock" type="checkbox" />
            <label for="useMock">Использовать mock-данные (без Garmin login)</label>
          </div>
          <div class="row">
            <input id="forceLogin" name="forceLogin" type="checkbox" />
            <label for="forceLogin">Принудительный Garmin login (без кэша токенов)</label>
          </div>
          <div class="row">
            <input id="noAi" name="noAi" type="checkbox" />
            <label for="noAi">Без AI-рекомендаций</label>
          </div>
          <div class="actions">
            <button id="submit-btn" type="submit">Запустить анализ</button>
            <span id="submit-status" class="status" aria-live="polite">Анализ выполняется, это может занять несколько минут…</span>
          </div>
        </form>
      </section>
      ${output}
    </div>
    <script>
      (function () {
        const form = document.getElementById('garmin-form');
        const btn = document.getElementById('submit-btn');
        const status = document.getElementById('submit-status');
        if (!form || !btn || !status) return;
        form.addEventListener('submit', () => {
          btn.disabled = true;
          btn.textContent = 'Выполняется...';
          status.classList.add('visible');
        });
      })();
    </script>
  </body>
</html>`;
}

function parseFormUrlEncoded(body) {
  const params = new URLSearchParams(body || '');
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function toBool(value) {
  const normalized = String(value || '').toLowerCase();
  return ['1', 'true', 'on', 'yes'].includes(normalized);
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function handleGarminUiRoute(req, res, readBody) {
  const url = req.url?.split('?')[0];
  if (req.method === 'GET' && url === '/garmin-ui') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildPageHtml());
    return true;
  }

  if (req.method === 'POST' && url === '/garmin-ui/analyze') {
    try {
      const body = await readBody(req);
      const form = parseFormUrlEncoded(body);
      const payload = {
        type: 'garmin_analyze',
        days: toNumber(form.days, 30),
        maxActivities: toNumber(form.maxActivities, 2000),
        includeSleep: toBool(form.includeSleep),
        sleepDays: toNumber(form.sleepDays, 30),
        useMock: toBool(form.useMock),
        forceLogin: toBool(form.forceLogin),
        noAi: toBool(form.noAi),
      };

      if (form.garminEmail) payload.garminEmail = form.garminEmail.trim();
      if (form.garminPassword) payload.garminPassword = form.garminPassword;
      if (form.openaiApiKey) payload.openaiApiKey = form.openaiApiKey.trim();
      if (form.mockFile) payload.mockFile = form.mockFile.trim();
      if (form.sleepMockFile) payload.sleepMockFile = form.sleepMockFile.trim();

      const result = await runGarminAnalysis(payload);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildPageHtml({ result }));
      return true;
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildPageHtml({ error: err.message || 'Unknown error' }));
      return true;
    }
  }

  return false;
}
