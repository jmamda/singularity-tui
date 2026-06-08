import { homedir } from 'node:os';
import { join } from 'node:path';

export const DIR = join(homedir(), '.singularity');
export const PROFILES_DIR = join(DIR, 'profiles');
export const SNIPPETS_DIR = join(DIR, 'snippets');
export const HISTORY_DIR = join(DIR, 'history');
export const LOG_DIR = join(DIR, 'log');
export const STATE_FILE = join(DIR, 'state.json');
export const WIZARD_FILE = join(DIR, 'wizard.json');
export const ENV_FILE = join(DIR, '.env');
export const NOTES_FILE = join(DIR, 'notes.json');
export const JOURNAL_FILE = join(DIR, 'journal.jsonl');
export const TRUST_FILE = join(DIR, 'trust.json');
