import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { PROFILES_DIR } from './paths.js';
import type { Slot } from '../store.js';
import {
  PERSONA_ARCHITECT,
  PERSONA_IMPLEMENTER,
  PERSONA_REVIEWER,
} from './promptEng.js';

export type ProfilePaneKind = 'cli' | 'monitor' | 'artifact';

export interface ProfilePane {
  slot: Slot;
  /** Optional when kind=artifact; required otherwise. */
  /**
   * Either a built-in id ('claude', 'opencode', 'codex', 'langgraph', 'shell', 'demo')
   * or a direct provider URI prefixed with 'provider:'
   * (e.g. 'provider:anthropic://claude-sonnet-4-6' or 'provider:ollama://llama3:8b').
   */
  adapterId?: string;
  kind?: ProfilePaneKind;
  label?: string;
  persona?: string;
  model?: string;
  maxRetries?: number;
  budgetUsd?: number;
  gitContext?: boolean;
}

export interface Profile {
  name: string;
  panes: ProfilePane[];
  globalBudgetUsd?: number;
  webhookUrl?: string;
  /** 'roster' (default): each pane gets a one-block intro to its siblings.
   *  'none': panes run fully isolated. */
  awareness?: 'none' | 'roster';
  /** When true, every dispatch requires the slot to hold a `dispatch:auto` cap. */
  requireDispatchCapability?: boolean;
}

export async function loadProfile(name: string): Promise<Profile | null> {
  try {
    const text = await fs.readFile(join(PROFILES_DIR, `${name}.json`), 'utf8');
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.panes)) return parsed as Profile;
    return null;
  } catch {
    return null;
  }
}

export async function listProfiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(PROFILES_DIR);
    return entries.filter((e) => e.endsWith('.json')).map((e) => e.slice(0, -5));
  } catch {
    return [];
  }
}

async function ensureProfileFile(filename: string, profile: Profile): Promise<void> {
  const target = join(PROFILES_DIR, filename);
  try {
    await fs.access(target);
    return;
  } catch {
    /* create */
  }
  await fs.mkdir(PROFILES_DIR, { recursive: true });
  await fs.writeFile(target, JSON.stringify(profile, null, 2), 'utf8');
}

export async function ensureDemoProfile(): Promise<void> {
  await ensureProfileFile('demo.json', {
    name: 'demo',
    awareness: 'roster',
    panes: [
      { slot: 1, adapterId: 'demo', label: 'DEMO-1', persona: 'You are demo agent #1.' },
      { slot: 2, adapterId: 'demo', label: 'DEMO-2', persona: 'You are demo agent #2.' },
      { slot: 3, adapterId: 'demo', label: 'DEMO-3', persona: 'You are demo agent #3.' },
      { slot: 4, kind: 'artifact', label: 'ARTIFACTS' },
    ],
  });
}

export async function ensureDefaultProfile(): Promise<void> {
  try {
    await fs.access(join(PROFILES_DIR, 'default.json'));
    return;
  } catch {
    // create
  }
  const def: Profile = {
    name: 'default',
    awareness: 'roster',
    panes: [
      { slot: 1, adapterId: 'claude', label: 'CLAUDE', persona: PERSONA_ARCHITECT },
      { slot: 2, adapterId: 'opencode', label: 'OPENCODE', persona: PERSONA_IMPLEMENTER },
      { slot: 3, adapterId: 'codex', label: 'CODEX', persona: PERSONA_REVIEWER },
      { slot: 4, kind: 'artifact', label: 'ARTIFACTS' },
      { slot: 5, adapterId: 'shell', label: 'PC' },
    ],
  };
  await fs.mkdir(PROFILES_DIR, { recursive: true });
  await fs.writeFile(join(PROFILES_DIR, 'default.json'), JSON.stringify(def, null, 2), 'utf8');
}
