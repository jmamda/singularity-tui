import type { Adapter, AdapterEvent } from './types.js';

// Sentinel adapter for slots configured as `kind: 'artifact'`. The slot is
// non-dispatchable — its content is populated by feeding other panes' streamed
// output through the code-block extractor.
export const artifactSentinelAdapter: Adapter = {
  id: 'artifact',
  label: 'ARTIFACTS',
  kind: 'monitor',
  async available() {
    return true;
  },
  async *start(): AsyncIterable<AdapterEvent> {
    yield { type: 'status', status: 'MONITOR' };
  },
  async stop() {},
};
