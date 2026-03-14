/**
 * Лёгкий агент: один запрос к LLM по задаче.
 * Поддерживаются: OpenAI, Google Gemini, Groq (бесплатные ключи — см. README).
 */

const promptFromTask = (task) =>
  typeof task.payload?.prompt === 'string'
    ? task.payload.prompt
    : JSON.stringify(task.payload);

const systemPrompt =
  process.env.AGENT_SYSTEM_PROMPT ||
  'You are a helpful autonomous assistant. Reply concisely. If the user asks to do something that requires external actions (email, API, file), describe the steps or say what is needed.';

// --- OpenAI ---
async function runOpenAI(task) {
  const OpenAI = (await import('openai')).default;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: promptFromTask(task) },
    ],
    max_tokens: 1024,
  });
  const text = completion.choices?.[0]?.message?.content?.trim() || '(no response)';
  return { text };
}

// --- Google Gemini ---
async function runGemini(task) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const model = genAI.getGenerativeModel({ model: modelName });
  const prompt = `${systemPrompt}\n\nUser: ${promptFromTask(task)}`;
  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response?.text?.()?.trim() || '(no response)';
  return { text };
}

// --- Groq ---
async function runGroq(task) {
  const Groq = (await import('groq-sdk')).default;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');
  const groq = new Groq({ apiKey });
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const completion = await groq.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: promptFromTask(task) },
    ],
    max_tokens: 1024,
  });
  const text = completion.choices?.[0]?.message?.content?.trim() || '(no response)';
  return { text };
}

function getProvider() {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.GROQ_API_KEY) return 'groq';
  throw new Error(
    'Set one of: OPENAI_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY (see .env.example and README)'
  );
}

/**
 * Выполнить одну задачу через выбранный LLM.
 */
export async function runTask(task) {
  const provider = getProvider();
  if (provider === 'openai') return runOpenAI(task);
  if (provider === 'gemini') return runGemini(task);
  if (provider === 'groq') return runGroq(task);
  throw new Error(`Unknown provider: ${provider}`);
}
