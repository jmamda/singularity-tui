import type { Adapter, AdapterEvent } from './types.js';
import { fetchSnapshot, isConfigured, renderTable } from '../lib/langsmith.js';

const POLL_MS = 5000;

export const langgraphAdapter: Adapter = {
  id: 'langgraph',
  label: 'LANGGRAPH',
  kind: 'monitor',
  async available() {
    return isConfigured();
  },
  async *start(): AsyncIterable<AdapterEvent> {
    if (!isConfigured()) {
      yield { type: 'status', status: 'OFFLINE' };
      yield {
        type: 'token',
        text: 'LANGSMITH_API_KEY not set — set it in ~/.singularity/.env to enable.\n',
      };
      return;
    }
    yield { type: 'status', status: 'MONITOR' };
    while (true) {
      const snap = await fetchSnapshot();
      const note = snap.error ? `langsmith error: ${snap.error}` : undefined;
      yield { type: 'token', text: renderTable(snap.rows, note) };
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  },
  async stop() {},
};
