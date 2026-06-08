import type { Slot } from '../store.js';

export interface RuntimeDispatcher {
  /**
   * Submit raw user input (including operator prefixes ! ? @plan >>N >N) to
   * the live TUI dispatcher exactly as if the user had typed it. Returns
   * once the dispatch is *initiated* (not necessarily complete).
   */
  submit(text: string, targetSlots?: Slot[]): void;
}

let current: RuntimeDispatcher | null = null;

export function setRuntimeDispatcher(d: RuntimeDispatcher | null): void {
  current = d;
}

export function getRuntimeDispatcher(): RuntimeDispatcher | null {
  return current;
}
