import {createBasicMessages, createTutorMessages, normalizeTutorResponse} from './prompts.js';

// Ollama Cloud direct API; no local Ollama installation required.
// API documentation: https://docs.ollama.com/cloud and https://docs.ollama.com/api/chat
const OLLAMA_CHAT_URL = 'https://ollama.com/api/chat';
const DEFAULT_MODEL = 'gemma4:31b';

export function hasApiKey() {
  return Boolean(process.env.OLLAMA_API_KEY?.trim());
}

export async function getAiReview(body, {basic = false, fetchImpl = fetch} = {}) {
  if (!hasApiKey()) {
    const err = new Error('Ollama Cloud is not configured. Add OLLAMA_API_KEY to the project-root .env file, restart the server, or use the offline examples.');
    err.status = 503;
    throw err;
  }

  const model = process.env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const messages = basic ? createBasicMessages(body) : createTutorMessages(body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  let response;
  try {
    response = await fetchImpl(OLLAMA_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OLLAMA_API_KEY.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        // Native Ollama API: structured JSON for the tutor; normal text for baseline.
        ...(basic ? {} : {format: 'json'})
      }),
      signal: controller.signal
    });
  } catch (err) {
    const e = new Error(err?.name === 'AbortError'
      ? 'Ollama took too long to respond. Try again or choose a faster cloud model.'
      : 'Could not connect to Ollama Cloud. Check your internet connection and try again.');
    e.status = err?.name === 'AbortError' ? 504 : 502;
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let remote;
    try { remote = await response.json(); } catch { remote = null; }
    const details = typeof remote?.error === 'string' ? remote.error : remote?.error?.message;
    const message = response.status === 401 || response.status === 403
      ? 'Ollama rejected the API key or account access. Check OLLAMA_API_KEY and your cloud permissions.'
      : response.status === 404
        ? `Ollama model '${model}' not found. Choose a cloud model from https://ollama.com/search?c=cloud.`
        : response.status === 429
          ? 'Ollama rate or usage limit reached. Check your plan and try again later.'
          : `Ollama Cloud error (${response.status}): ${String(details || 'Request failed').slice(0,180)}`;
    const e = new Error(message);
    e.status = response.status === 429 ? 429 : 502;
    throw e;
  }

  let result;
  try { result = await response.json(); }
  catch { throw Object.assign(new Error('Ollama returned invalid JSON.'), {status: 502}); }

  const content = result?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw Object.assign(new Error('Ollama returned an empty response. Try another supported cloud model.'), {status: 502});
  }

  const promptTokens = Number.isFinite(result.prompt_eval_count) ? result.prompt_eval_count : 0;
  const outputTokens = Number.isFinite(result.eval_count) ? result.eval_count : 0;
  return {
    feedback: basic ? content : normalizeTutorResponse(content, body.mode || 'hint'),
    model: result.model || model,
    usage: promptTokens + outputTokens || null
  };
}
