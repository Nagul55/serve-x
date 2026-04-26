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

export async function invokeLlm(messages, responseSchema) {
  const client = getOpenAIClient();

  if (!client) {
    console.warn('[LLM Service] No NVIDIA API key configured, using fallback.');
    if (responseSchema) {
      return buildFallbackLlmResponse({ prompt: '', responseSchema });
    }
    return { content: SURVEY_LLM_FALLBACK_MESSAGE };
  }

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
    const reasoning = message?.reasoning_content || message?.reasoning || '';
    const resultText = message?.content || '';

    if (!resultText && !reasoning) {
      console.warn('[LLM Service] DeepSeek returned empty response');
      throw new Error('DeepSeek returned empty');
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
