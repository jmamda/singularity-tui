/**
 * Cross-platform messenger send — write a one-shot message to Slack / Discord /
 * Telegram (and any other webhook-style platform) with a uniform interface.
 *
 * Each platform is configured via env or `~/.singularity/.env`:
 *   SLACK_WEBHOOK_URL    — incoming webhook URL
 *   DISCORD_WEBHOOK_URL  — incoming webhook URL
 *   TELEGRAM_BOT_TOKEN   — bot token from BotFather
 *   TELEGRAM_CHAT_ID     — target chat id
 *
 * Capability gate (`net:<hostname>`) is enforced by the caller — this lib
 * only formats and POSTs.
 */

export type MessengerPlatform = 'slack' | 'discord' | 'telegram';

export interface MessageResult {
  ok: boolean;
  platform: MessengerPlatform;
  status?: number;
  reason?: string;
}

export interface MessageInput {
  platform: MessengerPlatform;
  text: string;
}

const PLATFORMS: Record<MessengerPlatform, { hostname: string; sendable: () => boolean }> = {
  slack: { hostname: 'hooks.slack.com', sendable: () => Boolean(process.env.SLACK_WEBHOOK_URL) },
  discord: { hostname: 'discord.com', sendable: () => Boolean(process.env.DISCORD_WEBHOOK_URL) },
  telegram: {
    hostname: 'api.telegram.org',
    sendable: () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  },
};

export function platformHostname(platform: MessengerPlatform): string {
  return PLATFORMS[platform].hostname;
}

export function isConfigured(platform: MessengerPlatform): boolean {
  return PLATFORMS[platform].sendable();
}

export function configuredPlatforms(): MessengerPlatform[] {
  return (Object.keys(PLATFORMS) as MessengerPlatform[]).filter(isConfigured);
}

async function sendSlack(text: string): Promise<MessageResult> {
  const url = process.env.SLACK_WEBHOOK_URL!;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: r.ok, platform: 'slack', status: r.status, reason: r.ok ? undefined : await r.text() };
}

async function sendDiscord(text: string): Promise<MessageResult> {
  const url = process.env.DISCORD_WEBHOOK_URL!;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: text }),
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: r.ok, platform: 'discord', status: r.status, reason: r.ok ? undefined : await r.text() };
}

async function sendTelegram(text: string): Promise<MessageResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: r.ok, platform: 'telegram', status: r.status, reason: r.ok ? undefined : await r.text() };
}

export async function sendMessage(input: MessageInput): Promise<MessageResult> {
  if (!isConfigured(input.platform)) {
    return { ok: false, platform: input.platform, reason: 'platform not configured (env vars missing)' };
  }
  try {
    if (input.platform === 'slack') return await sendSlack(input.text);
    if (input.platform === 'discord') return await sendDiscord(input.text);
    if (input.platform === 'telegram') return await sendTelegram(input.text);
  } catch (e) {
    return { ok: false, platform: input.platform, reason: String(e) };
  }
  return { ok: false, platform: input.platform, reason: 'unknown platform' };
}

/** Broadcast the same text to every configured platform. */
export async function broadcast(text: string): Promise<MessageResult[]> {
  const targets = configuredPlatforms();
  return Promise.all(targets.map((p) => sendMessage({ platform: p, text })));
}
