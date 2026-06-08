/**
 * Plugin loader. Plugins are JavaScript modules (CommonJS or ESM) loaded from
 *
 *   ~/.singularity/plugins/<name>.js
 *
 * or from npm via dynamic import (when listed in profile config). A plugin
 * default-exports a factory function that receives the plugin API.
 *
 *   // ~/.singularity/plugins/my-plugin.js
 *   export default function (api) {
 *     api.onDispatch((slot, prompt) => api.notify(`dispatching to ${slot}`));
 *     api.registerCommand({ name: 'hello', summary: 'say hi', handler: () => ({ ok: true, message: 'hi' }) });
 *   }
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DIR } from './paths.js';
import { register, type Command } from '../commands/registry.js';
import { store } from '../store.js';

export interface PluginApi {
  notify(message: string, level?: 'info' | 'warn' | 'error'): void;
  registerCommand(cmd: Command): void;
  onDispatch(handler: (slot: number, prompt: string) => void): void;
  onResponse(handler: (slot: number, text: string) => void): void;
}

const dispatchHandlers: Array<(slot: number, prompt: string) => void> = [];
const responseHandlers: Array<(slot: number, text: string) => void> = [];

export function notifyDispatch(slot: number, prompt: string): void {
  for (const h of dispatchHandlers) {
    try {
      h(slot, prompt);
    } catch {
      /* plugin error must not break dispatch */
    }
  }
}

export function notifyResponse(slot: number, text: string): void {
  for (const h of responseHandlers) {
    try {
      h(slot, text);
    } catch {
      /* plugin error must not break stream */
    }
  }
}

function buildApi(): PluginApi {
  return {
    notify(message, level = 'info') {
      store.notify(level, message);
    },
    registerCommand(cmd) {
      register(cmd);
    },
    onDispatch(handler) {
      dispatchHandlers.push(handler);
    },
    onResponse(handler) {
      responseHandlers.push(handler);
    },
  };
}

export async function loadLocalPlugins(): Promise<string[]> {
  const pluginsDir = join(DIR, 'plugins');
  const loaded: string[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(pluginsDir);
  } catch {
    return loaded;
  }
  const api = buildApi();
  for (const name of entries) {
    if (!name.endsWith('.js') && !name.endsWith('.mjs')) continue;
    try {
      const mod = await import(pathToFileURL(join(pluginsDir, name)).href);
      const fn = mod.default ?? mod;
      if (typeof fn === 'function') {
        await fn(api);
        loaded.push(name);
      }
    } catch (e) {
      store.notify('warn', `plugin ${name} failed to load: ${e}`);
    }
  }
  return loaded;
}

export async function loadNpmPlugin(packageName: string): Promise<boolean> {
  try {
    const mod = await import(packageName);
    const fn = mod.default ?? mod;
    if (typeof fn === 'function') {
      await fn(buildApi());
      return true;
    }
  } catch (e) {
    store.notify('warn', `npm plugin ${packageName} failed: ${e}`);
  }
  return false;
}
