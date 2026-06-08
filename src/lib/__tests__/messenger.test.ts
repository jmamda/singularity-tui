import { describe, it, expect } from 'vitest';
import { platformHostname, isConfigured, configuredPlatforms } from '../messenger.js';

describe('messenger', () => {
  it('reports the correct hostname per platform', () => {
    expect(platformHostname('slack')).toBe('hooks.slack.com');
    expect(platformHostname('discord')).toBe('discord.com');
    expect(platformHostname('telegram')).toBe('api.telegram.org');
  });

  it('reports not-configured when env vars absent', () => {
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.DISCORD_WEBHOOK_URL;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    expect(isConfigured('slack')).toBe(false);
    expect(configuredPlatforms()).toEqual([]);
  });

  it('reports configured when env present', () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/x';
    expect(isConfigured('slack')).toBe(true);
    expect(configuredPlatforms()).toContain('slack');
    delete process.env.SLACK_WEBHOOK_URL;
  });
});
