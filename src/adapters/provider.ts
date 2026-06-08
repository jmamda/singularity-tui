/**
 * Native multi-provider model adapter. Calls LLM HTTP APIs directly (no CLI
 * binary required). Currently supports:
 *
 *   provider:anthropic://claude-sonnet-4-6
 *   provider:openai://gpt-5.1
 *   provider:openrouter://<provider>/<model>
 *   provider:ollama://<model>      (default base http://localhost:11434)
 *
 * Env:
 *   ANTHROPIC_API_KEY · OPENAI_API_KEY · OPENROUTER_API_KEY · OLLAMA_HOST
 *
 * Honest about cost accounting: Anthropic emits input_tokens in
 * `message_start.usage` and output_tokens in `message_delta.usage` — we
 * accumulate both. OpenAI/OpenRouter require `stream_options: { include_usage: true }`
 * to get usage on streamed responses; we set it. Ollama's chat API does not
 * report usage; we estimate from char count.
 */

import type { Adapter, AdapterEvent, SendOpts } from './types.js';

type Provider = 'anthropic' | 'openai' | 'openrouter' | 'ollama';

export interface ProviderConfig {
  id: string;
  label: string;
  provider: Provider;
  model: string;
  baseUrl?: string;
  pricing?: { inPerM: number; outPerM: number };
}

function envKey(p: Provider): string | undefined {
  if (p === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  if (p === 'openai') return process.env.OPENAI_API_KEY;
  if (p === 'openrouter') return process.env.OPENROUTER_API_KEY;
  return undefined;
}

function anyAbort(...signals: AbortSignal[]): AbortSignal {
  const c = new AbortController();
  const onAbort = () => c.abort();
  for (const s of signals) {
    if (s.aborted) c.abort();
    else s.addEventListener('abort', onAbort, { once: true });
  }
  return c.signal;
}

async function* streamAnthropic(
  cfg: ProviderConfig,
  prompt: string,
  opts: SendOpts,
  controller: AbortController,
): AsyncIterable<AdapterEvent> {
  const key = envKey('anthropic');
  if (!key) {
    yield { type: 'error', message: 'ANTHROPIC_API_KEY not set' };
    yield { type: 'status', status: 'OFFLINE' };
    return;
  }
  yield { type: 'status', status: 'ENGAGED' };
  let res: Response;
  try {
    res = await fetch(cfg.baseUrl ?? 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 4096,
        system: opts.persona,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
      signal: anyAbort(controller.signal, AbortSignal.timeout(120_000)),
    });
  } catch (e) {
    yield { type: 'error', message: `anthropic fetch: ${e}` };
    yield { type: 'status', status: 'FAULT' };
    return;
  }
  if (!res.ok) {
    yield { type: 'error', message: `anthropic ${res.status}: ${await res.text()}` };
    yield { type: 'status', status: 'FAULT' };
    return;
  }
  // input_tokens in message_start.usage; output_tokens in message_delta.usage.
  let tokensIn = 0;
  let tokensOut = 0;
  yield* sseTokens(res, (data) => {
    if (data.type === 'message_start' && data.message?.usage?.input_tokens) {
      tokensIn = data.message.usage.input_tokens;
    }
    if (data.type === 'content_block_delta' && data.delta?.text) {
      return [{ type: 'token', text: data.delta.text }];
    }
    if (data.type === 'message_delta' && data.usage?.output_tokens) {
      tokensOut = data.usage.output_tokens;
    }
    return [];
  });
  const usd =
    (tokensIn * (cfg.pricing?.inPerM ?? 3) + tokensOut * (cfg.pricing?.outPerM ?? 15)) / 1_000_000;
  yield { type: 'cost', tokensIn, tokensOut, usd };
  yield { type: 'status', status: 'DONE' };
}

async function* streamOpenAI(
  cfg: ProviderConfig,
  prompt: string,
  opts: SendOpts,
  controller: AbortController,
): AsyncIterable<AdapterEvent> {
  const isRouter = cfg.provider === 'openrouter';
  const key = envKey(isRouter ? 'openrouter' : 'openai');
  if (!key) {
    yield { type: 'error', message: `${isRouter ? 'OPENROUTER' : 'OPENAI'}_API_KEY not set` };
    yield { type: 'status', status: 'OFFLINE' };
    return;
  }
  yield { type: 'status', status: 'ENGAGED' };
  const url =
    cfg.baseUrl ??
    (isRouter
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions');
  const messages: { role: string; content: string }[] = [];
  if (opts.persona) messages.push({ role: 'system', content: opts.persona });
  messages.push({ role: 'user', content: prompt });
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        stream_options: { include_usage: true }, // required for usage in streamed responses
      }),
      signal: anyAbort(controller.signal, AbortSignal.timeout(120_000)),
    });
  } catch (e) {
    yield { type: 'error', message: `${cfg.provider} fetch: ${e}` };
    yield { type: 'status', status: 'FAULT' };
    return;
  }
  if (!res.ok) {
    yield { type: 'error', message: `${cfg.provider} ${res.status}: ${await res.text()}` };
    yield { type: 'status', status: 'FAULT' };
    return;
  }
  let tokensIn = 0;
  let tokensOut = 0;
  yield* sseTokens(res, (data) => {
    if (data.usage) {
      tokensIn = data.usage.prompt_tokens ?? tokensIn;
      tokensOut = data.usage.completion_tokens ?? tokensOut;
    }
    const choice = data.choices?.[0];
    if (!choice) return [];
    const delta = choice.delta?.content;
    if (typeof delta === 'string' && delta) return [{ type: 'token', text: delta }];
    return [];
  });
  const usd =
    (tokensIn * (cfg.pricing?.inPerM ?? 2) + tokensOut * (cfg.pricing?.outPerM ?? 8)) / 1_000_000;
  yield { type: 'cost', tokensIn, tokensOut, usd };
  yield { type: 'status', status: 'DONE' };
}

async function* streamOllama(
  cfg: ProviderConfig,
  prompt: string,
  opts: SendOpts,
  controller: AbortController,
): AsyncIterable<AdapterEvent> {
  const base = cfg.baseUrl ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  yield { type: 'status', status: 'ENGAGED' };
  const messages: { role: string; content: string }[] = [];
  if (opts.persona) messages.push({ role: 'system', content: opts.persona });
  messages.push({ role: 'user', content: prompt });
  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, messages, stream: true }),
      signal: anyAbort(controller.signal, AbortSignal.timeout(120_000)),
    });
  } catch (e) {
    yield { type: 'error', message: `ollama unreachable: ${e}` };
    yield { type: 'status', status: 'OFFLINE' };
    return;
  }
  if (!res.ok) {
    yield { type: 'error', message: `ollama ${res.status}: ${await res.text()}` };
    yield { type: 'status', status: 'FAULT' };
    return;
  }
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let outputChars = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl = buf.indexOf('\n');
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) {
        try {
          const obj = JSON.parse(line);
          if (obj.message?.content) {
            yield { type: 'token', text: obj.message.content };
            outputChars += obj.message.content.length;
          }
        } catch {
          /* skip */
        }
      }
      nl = buf.indexOf('\n');
    }
  }
  // Ollama's chat API doesn't return usage; estimate at 4 chars/token.
  const tokensIn = Math.max(1, Math.ceil(prompt.length / 4));
  const tokensOut = Math.max(1, Math.ceil(outputChars / 4));
  const usd = 0; // local model — no API cost
  yield { type: 'cost', tokensIn, tokensOut, usd };
  yield { type: 'status', status: 'DONE' };
}

/**
 * SSE event parser. Buffers data: lines per event terminator (empty line) so
 * multi-line data: payloads are concatenated correctly.
 */
async function* sseTokens(
  res: Response,
  parse: (data: any) => AdapterEvent[],
): AsyncIterable<AdapterEvent> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let dataAccum = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    // SSE event boundary is \n\n. Split on that.
    let sep = buf.indexOf('\n\n');
    while (sep >= 0) {
      const event = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      dataAccum = '';
      for (const line of event.split('\n')) {
        if (line.startsWith('data:')) dataAccum += line.slice(5).trimStart();
        // ignore event:/id:/retry: lines
      }
      if (dataAccum && dataAccum !== '[DONE]') {
        try {
          const obj = JSON.parse(dataAccum);
          for (const ev of parse(obj)) yield ev;
        } catch {
          /* skip malformed */
        }
      }
      sep = buf.indexOf('\n\n');
    }
  }
}

export function makeProviderAdapter(cfg: ProviderConfig): Adapter {
  const controller = new AbortController();
  return {
    id: cfg.id,
    label: cfg.label,
    kind: 'cli',
    async available() {
      if (cfg.provider === 'ollama') return true;
      return Boolean(envKey(cfg.provider));
    },
    async *send(prompt: string, opts: SendOpts = {}): AsyncIterable<AdapterEvent> {
      if (cfg.provider === 'anthropic') yield* streamAnthropic(cfg, prompt, opts, controller);
      else if (cfg.provider === 'openai' || cfg.provider === 'openrouter')
        yield* streamOpenAI(cfg, prompt, opts, controller);
      else if (cfg.provider === 'ollama') yield* streamOllama(cfg, prompt, opts, controller);
    },
    async stop() {
      // Real abort — propagates to the active fetch via the AbortController.
      controller.abort();
    },
  };
}

export function parseProviderUri(uri: string): { provider: Provider; model: string } | null {
  const m = uri.match(/^(anthropic|openai|openrouter|ollama):\/\/(.+)$/);
  if (!m) return null;
  return { provider: m[1] as Provider, model: m[2]! };
}
