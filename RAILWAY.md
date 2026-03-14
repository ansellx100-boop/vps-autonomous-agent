# Деплой на Railway

Пошаговая инструкция: агент работает 24/7 без своего сервера.

## 1. Репозиторий на GitHub

Если проекта ещё нет в GitHub:

```bash
cd /Users/Vladimir/vps-autonomous-agent
git init
git add .
git commit -m "Initial: autonomous agent for Railway"
```

Создайте репозиторий на [github.com/new](https://github.com/new) (например `vps-autonomous-agent`), затем:

```bash
git remote add origin https://github.com/ВАШ_ЛОГИН/vps-autonomous-agent.git
git branch -M main
git push -u origin main
```

## 2. Railway

1. Зайдите на [railway.app](https://railway.app) и войдите через GitHub.
2. **New Project** → **Deploy from GitHub repo**.
3. Выберите репозиторий `vps-autonomous-agent` (при необходимости дайте Railway доступ к нему).
4. Railway сам определит Node.js и начнёт сборку. Дождитесь статуса **Success**.

## 3. Переменные окружения

В проекте Railway откройте ваш сервис → вкладка **Variables** и добавьте:

| Variable           | Value                    | Обязательно |
|--------------------|--------------------------|-------------|
| **Один из ключей LLM** (достаточно одного): | | |
| `OPENAI_API_KEY`   | ключ OpenAI (platform.openai.com) | если используете OpenAI |
| `GEMINI_API_KEY`   | ключ Google Gemini (бесплатно: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)) | если не используете OpenAI |
| `GROQ_API_KEY`     | ключ Groq (бесплатно: [console.groq.com/keys](https://console.groq.com/keys)) | если не используете OpenAI и Gemini |
| `MODE`             | `webhook`                | Да (для работы по URL) |
| `WEBHOOK_SECRET`   | любая длинная случайная строка | Рекомендуется |

Приоритет: если заданы несколько ключей, используется OpenAI → Gemini → Groq. Для работы без OpenAI достаточно **GEMINI_API_KEY** или **GROQ_API_KEY**.

Сохраните. Railway перезапустит сервис с новыми переменными.

## 4. Публичный URL

1. Вкладка **Settings** → **Networking** → **Generate Domain**.
2. Скопируйте URL вида `https://vps-autonomous-agent-production-xxxx.up.railway.app`.

Endpoint для задач: **`https://ваш-домен.up.railway.app/task`**

## 5. Проверка

**Проверка здоровья сервиса:**
```bash
curl https://ваш-домен.up.railway.app/health
# Ответ: {"ok":true,"service":"vps-autonomous-agent","mode":"webhook"}
```

**Отправка задачи (подставьте свой WEBHOOK_SECRET и URL):**
```bash
curl -X POST https://ваш-домен.up.railway.app/task \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: mySecret123Abc" \
  -d '{"prompt": "Напиши короткое приветствие"}'
# Ответ: {"ok":true,"taskId":"..."}
```

**Очередь (сколько задач в работе и выполнено):**
```bash
curl -H "X-Webhook-Secret: mySecret123Abc" https://ваш-домен.up.railway.app/status
# {"ok":true,"queue":{"pending":2,"done":10}}
```

Агент обработает задачу в фоне (в течение нескольких секунд). Результаты и логи — во вкладке **Deployments** → выберите деплой → **View Logs**.

## Лимиты Railway

- Бесплатно даётся кредит (например $5 в месяц); расход идёт на время работы и трафик.
- Сервис не «засыпает», пока хватает кредита.
- Следите за использованием в **Account** → **Usage**.

## Если репозиторий приватный

Railway умеет деплоить и приватные репозитории — при выборе репо выдаст запрос на доступ к GitHub.
