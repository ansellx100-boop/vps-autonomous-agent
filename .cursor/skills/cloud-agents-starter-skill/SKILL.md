# Cloud Agent Starter Skill: Run + Test This Codebase

Use this as the default runbook when a Cloud agent starts working in this repository.

## 0) First 5 minutes (immediate setup)

1. Confirm Node is available (project requires Node `>=18`):
   - `node -v`
2. Install dependencies (if not already present):
   - `npm install`
3. Create local env file if missing:
   - `cp .env.example .env`
4. Fill required secrets for the task:
   - LLM tasks: `OPENAI_API_KEY`
   - Webhook auth (recommended): `WEBHOOK_SECRET`
   - Local helper script: `AGENT_URL` (when using `npm run send-task`)
5. Choose runtime mode:
   - Local queue loop: `MODE=poll`
   - HTTP service: `MODE=webhook`

Quick sanity check:
- `npm run start` (uses `.env`, defaults to `MODE` or `poll`)

## 1) Codebase area: Core runtime + queue (`src/index.js`, `src/tasks.js`, `src/agent.js`)

### What this area does
- Starts the app in `poll` or `webhook` mode.
- Accepts tasks and processes them asynchronously.
- Routes payloads to:
  - LLM prompt flow
  - `type: "collect"` internet collection
  - `type: "report"` PDF + Telegram send

### Run workflow
- Poll mode:
  - `npm run poll`
- Webhook mode:
  - `npm run webhook`

### Testing workflow (terminal)
1. Start webhook mode:
   - `MODE=webhook WEBHOOK_SECRET=test-secret npm run start`
2. Health check:
   - `curl http://127.0.0.1:3030/health`
3. Queue/status auth check:
   - `curl -H "X-Webhook-Secret: test-secret" http://127.0.0.1:3030/status`
4. Submit LLM task:
   - `curl -X POST http://127.0.0.1:3030/task -H "Content-Type: application/json" -H "X-Webhook-Secret: test-secret" -d '{"prompt":"Say hello in one line"}'`
5. Confirm processing from logs:
   - look for `[task]` then `[done]`

Expected result:
- `/health` returns `{"ok":true,...}`
- `/task` returns `{"ok":true,"taskId":"..."}`
- logs show task completion

## 2) Codebase area: Webhook API surface (`/task`, `/status`, `/health`, `/telegram-webhook`)

### What this area does
- Exposes HTTP endpoints when `MODE=webhook`.
- Protects `/task` and `/status` with `WEBHOOK_SECRET` if set.

### Feature-flag style switches to know
- `MODE=webhook`: enable HTTP API
- `WEBHOOK_SECRET=` (empty): disables auth checks (only for local debugging)
- `PORT=3030` (default): change bind port

### Testing workflow (API contract smoke)
1. Unauthorized request test:
   - `curl -i http://127.0.0.1:3030/status`
2. Authorized request test:
   - `curl -i -H "X-Webhook-Secret: test-secret" http://127.0.0.1:3030/status`
3. Not-found route test:
   - `curl -i http://127.0.0.1:3030/unknown`

Expected result:
- unauthorized gives `401` (when secret is set)
- authorized gives `200` + queue stats
- unknown route gives `404`

## 3) Codebase area: Data collection + report pipeline (`src/search.js`, `src/db.js`, `src/report.js`)

### What this area does
- Runs mining-safety web collection (`type: "collect"`).
- Stores de-duplicated records in SQLite (`data/agent.db` or volume mount path).
- Generates report PDF (`type: "report"`).

### Feature flags / env toggles
- `CRON_ENABLED=1|0` controls scheduled collection
- `CRON_COLLECT_SCHEDULE="0 0 * * *"` schedule (UTC)
- `CRON_REPORT_ENABLED=1|0` controls scheduled report jobs
- `CRON_REPORT_SCHEDULE="0 9 * * *"` schedule (UTC)
- `RAILWAY_VOLUME_MOUNT_PATH` (Railway-managed) controls persistent data dir

### Testing workflow (pipeline)
1. Start webhook mode with cron disabled for deterministic tests:
   - `MODE=webhook CRON_ENABLED=0 CRON_REPORT_ENABLED=0 WEBHOOK_SECRET=test-secret npm run start`
2. Trigger collect:
   - `curl -X POST http://127.0.0.1:3030/task -H "Content-Type: application/json" -H "X-Webhook-Secret: test-secret" -d '{"type":"collect"}'`
3. Check queue/db stats:
   - `curl -H "X-Webhook-Secret: test-secret" http://127.0.0.1:3030/status`
4. Trigger report:
   - `curl -X POST http://127.0.0.1:3030/task -H "Content-Type: application/json" -H "X-Webhook-Secret: test-secret" -d '{"type":"report","reportDays":1}'`
5. Verify artifacts:
   - confirm PDF appears under `data/reports/`
   - logs show report completion

Expected result:
- collect inserts or skips duplicates cleanly
- report task returns completion and a file path in logs

## 4) Codebase area: Telegram integration (`src/telegram.js`)

### What this area does
- Supports `/report` and `отчёт` messages.
- Sends generated PDF to configured chat IDs.
- Works via webhook mode on Railway; polling when webhook URL is absent.

### Practical setup (login + bot bootstrap)
1. In Telegram, use `@BotFather`:
   - run `/newbot`, copy token
2. Get chat ID:
   - via `@userinfobot` or Telegram API `getUpdates`
3. Set env vars:
   - `TELEGRAM_BOT_TOKEN=<token>`
   - `TELEGRAM_REPORT_CHAT_IDS=<id[,id2]>`
   - `TELEGRAM_ALLOWED_CHAT_IDS=<id[,id2]>`
   - Railway/webhook mode: `TELEGRAM_WEBHOOK_URL=https://<app-domain>/telegram-webhook`

### Testing workflow (Telegram)
1. Start app with Telegram vars set.
2. Send `/start` to bot and confirm response includes Chat ID.
3. Send `/report` to bot.
4. Confirm:
   - bot acknowledges report generation
   - PDF arrives in chat
   - logs contain Telegram send status

If no reply:
- verify webhook URL and logs for `[telegram] Webhook установлен`

## 5) Codebase area: Deployment + operations (`scripts/*.sh`, Railway/systemd)

### What this area does
- `scripts/deploy-vpswala.sh`: VPS bootstrap install + service start
- `scripts/install-systemd.sh`: creates `vps-autonomous-agent.service`
- `RAILWAY.md`: managed deploy runbook

### Testing workflow (ops smoke)
- Local process smoke:
  - `npm run webhook`
- systemd smoke (on VPS):
  - `sudo ./scripts/install-systemd.sh`
  - `sudo systemctl daemon-reload`
  - `sudo systemctl enable --now vps-autonomous-agent`
  - `sudo systemctl status vps-autonomous-agent`
- Railway smoke:
  - check `/health`, `/status`, then send `/task` via public domain

Expected result:
- service restarts automatically and accepts tasks after reboot/redeploy

## 6) Local task submission helper (`scripts/send-task.js`)

Use when agent is remote (Railway/VPS) and you only need to enqueue work:
- Set `.env`:
  - `AGENT_URL=https://<your-domain>`
  - `WEBHOOK_SECRET=<secret>` (if enabled)
- Send:
  - `npm run send-task "Explain REST in 3 bullets"`

Quick validation:
- command prints `Задача отправлена: <taskId>`

## 7) Fast troubleshooting checklist

- App exits on startup:
  - check `.env` and required keys (`OPENAI_API_KEY` for LLM flows)
- `/status` returns 401:
  - missing/incorrect `X-Webhook-Secret`
- Telegram silent on Railway:
  - set `TELEGRAM_WEBHOOK_URL` (polling is often unreliable there)
- Reports missing across redeploy:
  - ensure Railway volume mounted to `/app/data`

## 8) How to update this skill (keep it useful)

Whenever a Cloud agent discovers a new reliable run/test trick:
1. Add the trick directly to the relevant area section above.
2. Keep instructions executable (copy-paste commands, env vars, expected output).
3. Add one short “failure signal → fix” bullet in troubleshooting.
4. If behavior changed due to code updates, update both:
   - this skill file
   - source docs (`README.md`, `RAILWAY.md`, or `docs/*`) in the same PR
5. Keep this skill minimal: prefer practical defaults and smoke tests over long explanations.

