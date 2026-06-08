import type { PaneStatus } from '../theme.js';

export type AdapterEvent =
  | { type: 'token'; text: string }
  | { type: 'status'; status: PaneStatus }
  | { type: 'meta'; data: Record<string, unknown> }
  | { type: 'error'; message: string }
  | { type: 'session'; sessionId: string }
  | { type: 'cost'; tokensIn: number; tokensOut: number; usd: number };

export type AdapterKind = 'cli' | 'monitor';

export interface SendOpts {
  persona?: string;
  resumeId?: string;
}

export interface Adapter {
  id: string;
  label: string;
  kind: AdapterKind;
  available(): Promise<boolean>;
  send?(prompt: string, opts?: SendOpts): AsyncIterable<AdapterEvent>;
  start?(): AsyncIterable<AdapterEvent>;
  stop(): Promise<void>;
}
