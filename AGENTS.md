# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Single Node.js (ESM, `type: "module"`) service — an autonomous AI agent for monitoring mining safety news. No monorepo, no microservices. All functionality in `src/`.

### Running the application

```bash
cp .env.example .env   # first time only; set OPENAI_API_KEY
npm start              # starts in MODE from .env (default: poll)
npm run webhook        # force webhook mode (HTTP server on port 3030)
npm run poll           # force poll mode (file-queue polling)
```

Key endpoints (webhook mode):
- `GET /health` — liveness check
- `GET /status` — queue + DB stats (requires `X-Webhook-Secret` header if `WEBHOOK_SECRET` is set)
- `POST /task` — submit a task (JSON body: `{"type":"collect"}`, `{"type":"report"}`, or `{"prompt":"..."}`)

### Gotchas

- **No dev dependencies / lint / test scripts exist.** There are no `devDependencies`, no linter config, and no test framework configured in `package.json`. The project has only runtime dependencies.
- **DuckDuckGo rate limiting:** The `collect` task uses `duck-duck-scrape` to search DuckDuckGo. From cloud/CI environments, DDG frequently rate-limits requests. This is an environment limitation, not a code bug.
- **`better-sqlite3` requires native compilation.** `npm install` needs a working C++ toolchain (typically pre-installed on most systems). If it fails, install build tools (`build-essential`, `python3`).
- **`.env` is required.** The app uses `dotenv`. Copy `.env.example` to `.env` and set at minimum `OPENAI_API_KEY` for LLM tasks. The `collect` and `report` task types work without an OpenAI key.
- **Cron jobs are on by default.** Set `CRON_ENABLED=0` and `CRON_REPORT_ENABLED=0` in `.env` to disable automatic daily collect/report tasks during development.
- **Telegram bot is optional.** Only starts if `TELEGRAM_BOT_TOKEN` is set.
- **Node.js punycode deprecation warning** (`[DEP0040]`) is harmless — comes from a transitive dependency.
