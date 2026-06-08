import type { Slot } from '../store.js';

let webhookUrl: string | null = process.env.SINGULARITY_WEBHOOK_URL ?? null;

export function setWebhookUrl(url: string | null): void {
  webhookUrl = url || null;
}

export type WebhookEvent =
  | { event: 'dispatch'; slot: Slot; prompt: string; persona?: string; broadcast?: boolean }
  | { event: 'done'; slot: Slot; durationMs: number; tokensOut?: number; costUsd?: number }
  | { event: 'fault'; slot: Slot; message: string }
  | { event: 'budget_exceeded'; slot?: Slot; usd: number; cap: number };

export function fireAndForget(ev: WebhookEvent): void {
  if (!webhookUrl) return;
  const body = JSON.stringify({ ...ev, at: Date.now() });
  // Fire-and-forget; never throws to caller.
  void fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
