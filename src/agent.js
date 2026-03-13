/**
 * Лёгкий агент: один запрос к LLM по задаче, ответ возвращается как результат.
 * При необходимости можно расширить до multi-step (цикл tool calls).
 */

import OpenAI from 'openai';

let openai = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  if (!openai) openai = new OpenAI({ apiKey });
  return openai;
}

/**
 * Выполнить одну задачу через LLM.
 * @param {object} task - { id, payload: { prompt?, ... } }
 * @returns {Promise<{ text: string }>}
 */
export async function runTask(task) {
  const prompt =
    typeof task.payload?.prompt === 'string'
      ? task.payload.prompt
      : JSON.stringify(task.payload);

  const client = getClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          process.env.AGENT_SYSTEM_PROMPT ||
          'You are a helpful autonomous assistant. Reply concisely. If the user asks to do something that requires external actions (email, API, file), describe the steps or say what is needed.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 1024,
  });

  const text =
    completion.choices?.[0]?.message?.content?.trim() || '(no response)';
  return { text };
}
