import type { Adapter, AdapterEvent } from './types.js';
import { sendToSession } from '../iterm/launch.js';

export function makeItermAdapter(args: { id: string; label: string; sessionId: string }): Adapter {
  return {
    id: args.id,
    label: args.label,
    kind: 'cli',
    async available() {
      return Boolean(args.sessionId);
    },
    async *send(prompt: string): AsyncIterable<AdapterEvent> {
      yield { type: 'status', status: 'ENGAGED' };
      try {
        await sendToSession(args.sessionId, prompt);
        yield { type: 'token', text: `[dispatched to ${args.sessionId}]\n` };
        yield { type: 'status', status: 'DONE' };
      } catch (e) {
        yield { type: 'error', message: String(e) };
        yield { type: 'status', status: 'FAULT' };
      }
    },
    async stop() {},
  };
}
