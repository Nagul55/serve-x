import OpenAI from 'openai';
import { env } from '../config/env.js';
import { buildFallbackLlmResponse } from './llmFallback.js';

const DEFAULT_LLM_TIMEOUT_MS = 20000;
const DEFAULT_LLM_MAX_TOKENS = 1200;
export const SURVEY_LLM_FALLBACK_MESSAGE = 'I understand. Could you please share a bit more detail so I can capture everything accurately for the survey?';

/**
 * Unified LLM service using NVIDIA DeepSeek V4 Flash via OpenAI-compatible API.
 *
 * @param {Array<{role: string, content: string}>} messages - Chat messages (system, user, assistant).
 * @param {object} [responseSchema] - If provided, requests JSON output and parses it.
 * @returns {Promise<{content: string}|object>} - Text response as { content } or parsed JSON object.
 */

let _openaiClient = null;

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getOpenAIClient() {
  if (!_openaiClient) {
    const apiKey = env.nvidiaApiKey;
    if (!apiKey) return null;
    _openaiClient = new OpenAI({
      apiKey,
      baseURL: env.nvidiaBaseUrl,
      timeout: toInt(process.env.LLM_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS),
      maxRetries: 0,
    });
  }
  return _openaiClient;
}

function normalizeProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (provider === 'gemini') return 'gemini';
  return 'nvidia';
}

function toGeminiPayloadMessages(messages = []) {
  return messages
    .filter((m) => m?.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(m?.content || '') }],
    }));
}

async function invokeGemini(messages, responseSchema, llmTimeoutMs, maxTokens) {
  if (!env.geminiApiKey) {
    return null;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`;
  const hasSystem = messages.some((m) => m.role === 'system');
  const systemInstruction = responseSchema
    ? 'You MUST respond with ONLY valid JSON. No markdown fences, no explanations, no extra text.'
    : '';

  const systemParts = [];
  if (responseSchema) systemParts.push({ text: systemInstruction });
  if (hasSystem) {
    const sys = messages.find((m) => m.role === 'system');
    if (sys?.content) systemParts.push({ text: String(sys.content) });
  }

  const body = {
    contents: toGeminiPayloadMessages(messages),
    generationConfig: {
      temperature: responseSchema ? 0.1 : 0.5,
      topP: 0.95,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemParts.length > 0) {
    body.systemInstruction = { parts: systemParts };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(llmTimeoutMs),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const resultText = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join(' ').trim() || '';
  if (!resultText) {
    throw new Error('Gemini returned empty');
  }
  return resultText;
}

export async function invokeLlm(messages, responseSchema) {
  const provider = normalizeProvider(env.aiProvider);

  // Normalize messages
  let finalMessages = Array.isArray(messages) ? messages : [];
  if (!Array.isArray(messages) && messages?.prompt) {
    finalMessages = [{ role: 'user', content: String(messages.prompt) }];
  }

  // Ensure at least one user message
  if (finalMessages.length === 0) {
    finalMessages = [{ role: 'user', content: 'Hello' }];
  }

  // DeepSeek supports system/user/assistant roles natively — no need to merge or rename
  const formattedMessages = finalMessages.map((m) => ({
    role: m.role === 'model' ? 'assistant' : m.role,
    content: m.content || '',
  }));

  // If JSON output is requested, prepend an instruction to the system prompt
  if (responseSchema) {
    const hasSystem = formattedMessages.some((m) => m.role === 'system');
    const jsonInstruction = 'You MUST respond with ONLY valid JSON. No markdown fences, no explanations, no extra text.';
    if (hasSystem) {
      const sysIdx = formattedMessages.findIndex((m) => m.role === 'system');
      formattedMessages[sysIdx].content = jsonInstruction + '\n' + formattedMessages[sysIdx].content;
    } else {
      formattedMessages.unshift({ role: 'system', content: jsonInstruction });
    }
  }

  const llmTimeoutMs = toInt(process.env.LLM_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS);
  const maxTokens = responseSchema
    ? 800
    : toInt(process.env.LLM_MAX_TOKENS, DEFAULT_LLM_MAX_TOKENS);

  try {
    let resultText = '';
    let reasoning = '';

    if (provider === 'gemini') {
      const geminiResult = await invokeGemini(formattedMessages, responseSchema, llmTimeoutMs, maxTokens);
      if (geminiResult === null) {
        console.warn('[LLM Service] AI_PROVIDER=gemini but GEMINI_API_KEY is missing, using fallback.');
        if (responseSchema) return buildFallbackLlmResponse({ prompt: '', responseSchema });
        return { content: SURVEY_LLM_FALLBACK_MESSAGE };
      }
      resultText = geminiResult;
    } else {
      const client = getOpenAIClient();
      if (!client) {
        console.warn('[LLM Service] No NVIDIA API key configured, using fallback.');
        if (responseSchema) return buildFallbackLlmResponse({ prompt: '', responseSchema });
        return { content: SURVEY_LLM_FALLBACK_MESSAGE };
      }

      const completion = await client.chat.completions.create(
        {
          model: env.nvidiaModel,
          messages: formattedMessages,
          temperature: responseSchema ? 0.1 : 0.5,
          max_tokens: maxTokens,
          top_p: 0.95,
          stream: false,
        },
        {
          timeout: llmTimeoutMs,
          maxRetries: 0,
        }
      );

      const message = completion.choices?.[0]?.message;
      reasoning = message?.reasoning_content || message?.reasoning || '';
      resultText = message?.content || '';
    }

    if (!resultText && !reasoning) {
      console.warn('[LLM Service] Provider returned empty response');
      throw new Error('Provider returned empty');
    }

    // Combine reasoning and content for text-mode if needed, or just use content
    // For this implementation, we'll focus on the content for the user-facing response
    // but we can log the reasoning for debugging.
    if (reasoning && process.env.NODE_ENV !== 'production') {
      console.log('[LLM Service] Reasoning:', reasoning.slice(0, 200) + '...');
    }

    if (responseSchema) {
      // Robust JSON extraction — strip markdown fences if present
      const jsonStr = resultText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      try {
        return JSON.parse(jsonStr);
      } catch (parseErr) {
        console.warn('[LLM Service] JSON parse failed, attempting repair:', parseErr.message);
        // Try to extract the first JSON object
        const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          return JSON.parse(braceMatch[0]);
        }
        throw parseErr;
      }
    }

    return { content: resultText.trim() };
  } catch (error) {
    const statusInfo = error?.status ? ` (status ${error.status})` : '';
    console.error(`[LLM Service] Failure${statusInfo}: ${error.message}`);

    // Return a safe fallback so the bot doesn't go silent
    if (responseSchema) {
      return buildFallbackLlmResponse({ prompt: JSON.stringify(finalMessages), responseSchema });
    }

    // For text responses, return a human-friendly fallback
    return {
      content: SURVEY_LLM_FALLBACK_MESSAGE,
    };
  }
}
