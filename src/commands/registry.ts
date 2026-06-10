import { store, type Slot } from '../store.js';
import { promises as fs } from 'node:fs';

export interface CommandContext {
  args: string[];
  raw: string;
  targetSlots: Slot[];
}

export interface CommandResult {
  ok: boolean;
  message?: string;
}

export type CommandHandler = (ctx: CommandContext) => Promise<CommandResult> | CommandResult;

export interface Command {
  name: string;
  summary: string;
  usage: string;
  handler: CommandHandler;
}

const commands = new Map<string, Command>();

export function register(cmd: Command) {
  commands.set(cmd.name, cmd);
}

export function listCommands(): Command[] {
  return [...commands.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function isSlash(text: string): boolean {
  return text.startsWith('/');
}

export async function runSlash(text: string, targetSlots: Slot[]): Promise<CommandResult> {
  const trimmed = text.slice(1).trim();
  if (!trimmed) return { ok: false, message: 'empty command' };
  const [name, ...args] = trimmed.split(/\s+/);
  const cmd = commands.get(name!);
  if (!cmd) return { ok: false, message: `unknown command: /${name}` };
  return await cmd.handler({ args, raw: trimmed, targetSlots });
}

// ─── built-ins ───────────────────────────────────────────────────────────

register({
  name: 'help',
  summary: 'open the keys & grammar overlay',
  usage: '/help',
  handler: () => {
    store.setHelpVisible(true);
    return { ok: true };
  },
});

register({
  name: 'commands',
  summary: 'list all slash commands (text)',
  usage: '/commands',
  handler: () => {
    const lines = listCommands().map((c) => `  ${c.usage.padEnd(28)} ${c.summary}`);
    return { ok: true, message: 'commands:\n' + lines.join('\n') };
  },
});

register({
  name: 'clear',
  summary: 'clear target pane(s) (or all with `all`)',
  usage: '/clear [all]',
  handler: ({ args, targetSlots }) => {
    if (args[0] === 'all') {
      for (const p of store.getState().panes) store.clearOutput(p.slot);
      return { ok: true, message: 'cleared all panes' };
    }
    if (targetSlots.length === 0) return { ok: false, message: 'no target' };
    for (const slot of targetSlots) store.clearOutput(slot);
    return { ok: true };
  },
});

register({
  name: 'save',
  summary: 'save target pane output to file (capability + sentinel + journaled)',
  usage: '/save <path>',
  handler: async ({ args, targetSlots }) => {
    const path = args[0];
    if (!path) return { ok: false, message: '/save <path>' };
    if (targetSlots.length === 0) return { ok: false, message: 'no target' };
    const slot = targetSlots[0]!;
    const pane = store.getState().panes.find((p) => p.slot === slot);
    if (!pane) return { ok: false, message: 'pane missing' };
    if (path.startsWith('/') || path.includes('..')) {
      return { ok: false, message: 'refusing absolute or parent paths; use a path inside cwd' };
    }
    const { checkCapabilities } = await import('../lib/capabilities.js');
    const capCheck = checkCapabilities(store.getState().capabilities, {
      slot,
      kind: 'write',
      target: path,
    });
    if (!capCheck.ok) {
      return {
        ok: false,
        message: `permission denied: ${capCheck.reason} — grant first: /grant ${slot} write:${path}`,
      };
    }
    const { sentinelVerdict, submitDualKey, TRUST_DELTAS } = await import('../lib/sentinel.js');
    const verdict = sentinelVerdict({ kind: 'write', target: path, slot });
    if (!verdict.ok) {
      store.adjustTrust(slot, TRUST_DELTAS.veto);
      return { ok: false, message: `sentinel veto: ${verdict.reason}` };
    }
    if (verdict.requiresDualKey) {
      const dk = submitDualKey({ kind: 'write', target: path, slot });
      if (!dk.acknowledged) return { ok: false, message: `${dk.reason} (id ${dk.id})` };
    }
    const { shadowWrite } = await import('../lib/shadowfs.js');
    const entry = await shadowWrite(path, pane.output.join(''), {
      bySlot: slot,
      label: `save [${slot}]`,
    });
    store.adjustTrust(slot, TRUST_DELTAS.cleanExecution);
    return { ok: true, message: `saved [${slot}] → ${path} (journaled ${entry.id.slice(0, 12)})` };
  },
});

register({
  name: 'budget',
  summary: 'set or clear the session-wide $ budget',
  usage: '/budget <usd|off>',
  handler: ({ args }) => {
    if (args[0] === 'off' || args[0] === 'none') {
      store.setGlobalBudget(null);
      return { ok: true, message: 'global budget cleared' };
    }
    const usd = Number(args[0]);
    if (!Number.isFinite(usd) || usd <= 0) return { ok: false, message: '/budget <usd|off>' };
    store.setGlobalBudget(usd);
    return { ok: true, message: `global budget: $${usd.toFixed(2)}` };
  },
});

register({
  name: 'diff',
  summary: 'unified diff of two artifacts (by #N) or two panes (by slot)',
  usage: '/diff #a #b   |   /diff <slotA> <slotB>',
  handler: async ({ args }) => {
    if (args.length < 2) return { ok: false, message: '/diff #a #b  or  /diff <slotA> <slotB>' };
    const { renderUnifiedDiff } = await import('../lib/diff.js');
    const s = store.getState();

    const isArtifactRef = (x: string) => x.startsWith('#');
    if (isArtifactRef(args[0]!) || isArtifactRef(args[1]!)) {
      const seqA = Number(args[0]!.replace('#', ''));
      const seqB = Number(args[1]!.replace('#', ''));
      const a = s.artifacts.find((x) => x.seq === seqA);
      const b = s.artifacts.find((x) => x.seq === seqB);
      if (!a || !b) return { ok: false, message: 'artifact(s) not found' };
      return {
        ok: true,
        message: `#${seqA} vs #${seqB}\n${renderUnifiedDiff(a.content, b.content)}`,
      };
    }

    const slotA = Number(args[0]);
    const slotB = Number(args[1]);
    const pa = s.panes.find((p) => p.slot === slotA);
    const pb = s.panes.find((p) => p.slot === slotB);
    if (!pa || !pb) return { ok: false, message: 'panes not found' };
    return {
      ok: true,
      message: `[${slotA}] vs [${slotB}]\n${renderUnifiedDiff(pa.output.join(''), pb.output.join(''))}`,
    };
  },
});

register({
  name: 'apply',
  summary: 'write the selected artifact to a file (two-step: preview, then --force)',
  usage: '/apply [path]   then   /apply [path] --force',
  handler: async ({ args }) => {
    const s = store.getState();
    const art = s.artifacts[s.selectedArtifactIdx];
    if (!art) return { ok: false, message: 'no artifact selected' };
    const force = args.includes('--force') || args.includes('-f');
    const positional = args.filter((a) => !a.startsWith('-'));
    // Prefer explicit arg; else use the title if it looks like a file path.
    const titleLooksLikePath = /^[\w./-]+\.[A-Za-z0-9]+$/.test(art.title ?? '');
    const path = positional[0] ?? (titleLooksLikePath ? art.title! : '');
    if (!path) {
      return { ok: false, message: `/apply <path> — couldn't infer a path from #${art.seq}` };
    }
    if (path.startsWith('/') || path.includes('..')) {
      return { ok: false, message: 'refusing absolute or parent paths; use a path inside cwd' };
    }
    // Permission gate: never write on the first invocation. Show a preview and
    // require an explicit --force to actually touch the filesystem.
    if (!force) {
      const lines = art.content.split('\n').length;
      let exists = false;
      try {
        await fs.access(path);
        exists = true;
      } catch {
        /* new file */
      }
      const verb = exists ? 'OVERWRITE' : 'create';
      return {
        ok: true,
        message: `preview: would ${verb} ${path} (#${art.seq}, ${lines} lines). Confirm: /apply ${path} --force`,
      };
    }
    // Capability check before any write touches disk
    const { checkCapabilities } = await import('../lib/capabilities.js');
    const capCheck = checkCapabilities(store.getState().capabilities, {
      slot: art.sourceSlot,
      kind: 'write',
      target: path,
    });
    if (!capCheck.ok) {
      return {
        ok: false,
        message: `permission denied: ${capCheck.reason} — grant first: /grant ${art.sourceSlot} write:${path}`,
      };
    }

    // Sentinel check — block sensitive paths, require dual-key for dangerous patterns.
    const { sentinelVerdict, submitDualKey, TRUST_DELTAS } = await import('../lib/sentinel.js');
    const verdict = sentinelVerdict({ kind: 'write', target: path, slot: art.sourceSlot });
    if (!verdict.ok) {
      store.adjustTrust(art.sourceSlot, TRUST_DELTAS.veto);
      return { ok: false, message: `sentinel veto: ${verdict.reason}` };
    }
    if (verdict.requiresDualKey) {
      const dk = submitDualKey({ kind: 'write', target: path, slot: art.sourceSlot });
      if (!dk.acknowledged) {
        return { ok: false, message: `${dk.reason} (id ${dk.id})` };
      }
    }

    try {
      const { shadowWrite } = await import('../lib/shadowfs.js');
      const entry = await shadowWrite(path, art.content, {
        bySlot: art.sourceSlot,
        label: `artifact #${art.seq}`,
      });
      // Trust nudge for clean execution
      store.adjustTrust(art.sourceSlot, TRUST_DELTAS.cleanExecution);
      return {
        ok: true,
        message: `applied #${art.seq} → ${path}  (journaled ${entry.id.slice(0, 12)}, /rollback to undo)`,
      };
    } catch (e) {
      store.adjustTrust(art.sourceSlot, TRUST_DELTAS.fault);
      return { ok: false, message: `apply failed: ${e}` };
    }
  },
});

register({
  name: 'snapshot',
  summary: 'create a named shadow-fs snapshot (rollback target)',
  usage: '/snapshot <name>',
  handler: async ({ args }) => {
    const name = args.join(' ').trim();
    if (!name) return { ok: false, message: '/snapshot <name>' };
    const { createSnapshot } = await import('../lib/shadowfs.js');
    const s = createSnapshot(name);
    return { ok: true, message: `snapshot "${name}" → ${s.id}` };
  },
});

register({
  name: 'rollback',
  summary: 'restore filesystem to a snapshot; reverts every journaled write since',
  usage: '/rollback <snapshot-id|root>',
  handler: async ({ args }) => {
    const id = args[0] ?? 'root';
    try {
      const { rollbackTo, listSnapshots, listJournal } = await import('../lib/shadowfs.js');
      const { TRUST_DELTAS } = await import('../lib/sentinel.js');
      const target =
        id === 'root' ? 'root' : (listSnapshots().find((s) => s.id.startsWith(id))?.id ?? id);
      // Charge trust for every pane that contributed to the rolled-back writes
      const slots = new Set<number>();
      for (const e of listJournal()) if (e.bySlot) slots.add(e.bySlot);
      const r = await rollbackTo(target);
      for (const slot of slots) store.adjustTrust(slot, TRUST_DELTAS.rollback);
      const errs = r.errors.length > 0 ? `  (${r.errors.length} errors)` : '';
      return {
        ok: true,
        message: `rolled back: ${r.restored} restored · ${r.deleted} deleted${errs}`,
      };
    } catch (e) {
      return { ok: false, message: String(e) };
    }
  },
});

register({
  name: 'journal',
  summary: 'list shadow-fs writes (most recent first)',
  usage: '/journal',
  handler: async () => {
    const { listJournal, listSnapshots } = await import('../lib/shadowfs.js');
    const snaps = listSnapshots();
    const entries = listJournal().slice().reverse().slice(0, 20);
    if (entries.length === 0) return { ok: true, message: 'journal empty' };
    const lines = entries.map((e) => {
      const s = snaps.find((x) => x.id === e.snapshotId);
      const tag = e.label ? ` · ${e.label}` : '';
      const by = e.bySlot ? ` [${e.bySlot}]` : '';
      return `  ${e.id.slice(0, 14)}${by} ${e.path}${tag} (snap ${s?.name ?? '?'})`;
    });
    return { ok: true, message: `journal (${entries.length}):\n${lines.join('\n')}` };
  },
});

register({
  name: 'lock',
  summary: 'toggle dispatch lock on a pane',
  usage: '/lock <1-4>',
  handler: ({ args }) => {
    const n = Number(args[0]);
    if (!Number.isInteger(n) || n < 1 || n > 4) {
      return { ok: false, message: '/lock <1-4>' };
    }
    store.toggleLock(n as Slot);
    return { ok: true };
  },
});

register({
  name: 'search',
  summary: 'highlight matches across all panes',
  usage: '/search <regex>',
  handler: ({ args }) => {
    const pattern = args.join(' ');
    if (!pattern) return { ok: false, message: '/search <regex>' };
    store.setSearch(pattern);
    return { ok: true, message: `searching: ${pattern}` };
  },
});

register({
  name: 'profile',
  summary: 'load named profile (overwrites pane lineup)',
  usage: '/profile <name>',
  handler: ({ args }) => {
    const name = args[0];
    if (!name) return { ok: false, message: '/profile <name>' };
    store.setPendingProfile(name);
    return { ok: true, message: `profile queued: ${name} (restart to apply)` };
  },
});

register({
  name: 'snippet',
  summary: 'expand / save / list saved prompt snippets',
  usage: '/snippet <name> | save <name> | list',
  handler: async ({ args }) => {
    const sub = args[0];
    if (!sub) return { ok: false, message: '/snippet <name> | save <name> | list' };
    const { loadSnippet, saveSnippet, listSnippets } = await import('../lib/snippets.js');
    if (sub === 'list') {
      const items = await listSnippets();
      return { ok: true, message: `snippets: ${items.join(', ') || '(none)'}` };
    }
    if (sub === 'save') {
      const name = args[1];
      if (!name) return { ok: false, message: '/snippet save <name>' };
      const draft = store.getState().promptDraft;
      if (!draft) return { ok: false, message: 'draft is empty' };
      await saveSnippet(name, draft);
      return { ok: true, message: `saved snippet: ${name}` };
    }
    const text = await loadSnippet(sub);
    if (!text) return { ok: false, message: `no snippet: ${sub}` };
    store.setPromptDraft(text);
    return { ok: true };
  },
});

register({
  name: 'cost',
  summary: 'show running cost across panes',
  usage: '/cost',
  handler: () => {
    const total = store
      .getState()
      .panes.map((p) => p.metrics.costUsd ?? 0)
      .reduce((a, b) => a + b, 0);
    return { ok: true, message: `total session cost: $${total.toFixed(4)}` };
  },
});

register({
  name: 'note',
  summary: 'shared scratchpad — auto-prepended to every dispatch',
  usage: '/note <text> | list | clear | rm <n>',
  handler: async ({ args, raw }) => {
    const sub = args[0];
    const { saveNotes } = await import('../lib/notes.js');
    const cur = store.getState().sharedNotes;

    if (!sub) return { ok: false, message: '/note <text> | list | clear | rm <n>' };

    if (sub === 'list') {
      if (cur.length === 0) return { ok: true, message: 'no shared notes' };
      const lines = cur.map((n, i) => `  ${i + 1}. ${n}`).join('\n');
      return { ok: true, message: `shared notes (${cur.length}):\n${lines}` };
    }
    if (sub === 'clear') {
      store.clearSharedNotes();
      await saveNotes([]);
      return { ok: true, message: 'notes cleared' };
    }
    if (sub === 'rm') {
      const n = Number(args[1]);
      if (!Number.isInteger(n) || n < 1 || n > cur.length) {
        return { ok: false, message: `/note rm <1-${cur.length}>` };
      }
      store.removeSharedNote(n - 1);
      await saveNotes(store.getState().sharedNotes);
      return { ok: true, message: `removed note ${n}` };
    }
    if (sub === 'auto') {
      const v = args[1];
      if (v !== 'on' && v !== 'off') return { ok: false, message: '/note auto on|off' };
      store.setAutoNotes(v === 'on');
      return { ok: true, message: `auto-notes: ${v}` };
    }
    // Otherwise, treat the rest of the line as a new note.
    const text = raw.replace(/^note\s+/, '').trim();
    if (!text) return { ok: false, message: 'empty note' };
    store.addSharedNote(text);
    await saveNotes(store.getState().sharedNotes);
    return { ok: true, message: `noted (${store.getState().sharedNotes.length})` };
  },
});

register({
  name: 'awareness',
  summary: 'toggle roster awareness (roster | none)',
  usage: '/awareness roster|none',
  handler: ({ args }) => {
    const mode = args[0];
    if (mode !== 'roster' && mode !== 'none') {
      return { ok: false, message: '/awareness roster|none' };
    }
    store.setAwareness(mode);
    return { ok: true, message: `awareness: ${mode}` };
  },
});

register({
  name: 'grant',
  summary: 'grant a capability to a pane (e.g. /grant 5 X:^npm test 600)',
  usage: '/grant <slot> <kind:pattern> [seconds]',
  handler: async ({ args }) => {
    const { parseCapabilityArg, nextCapabilityId } = await import('../lib/capabilities.js');
    const slot = Number(args[0]);
    if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
      return { ok: false, message: '/grant <slot 1-5> <kind:pattern> [seconds]' };
    }
    const parsed = parseCapabilityArg(args[1] ?? '');
    if (!parsed)
      return { ok: false, message: 'cap form: read:src/**  write:dist/**  exec:^npm  net:api.x' };
    const secs = Number(args[2]);
    const expiresAt =
      Number.isFinite(secs) && secs > 0 ? Date.now() + secs * 1000 : Number.POSITIVE_INFINITY;
    store.addCapability({
      id: nextCapabilityId(),
      kind: parsed.kind,
      pattern: parsed.pattern,
      slot,
      grantedBy: null,
      expiresAt,
    });
    return { ok: true, message: `granted ${parsed.kind}:${parsed.pattern} → slot ${slot}` };
  },
});

register({
  name: 'revoke',
  summary: 'revoke a capability by id or its compact form',
  usage: '/revoke <id|slot kind:pattern>',
  handler: ({ args }) => {
    const s = store.getState();
    if (args.length === 1 && args[0]!.startsWith('cap_')) {
      store.revokeCapability(args[0]!);
      return { ok: true, message: `revoked ${args[0]}` };
    }
    const slot = Number(args[0]);
    const spec = args[1] ?? '';
    const m = spec.match(/^([rwxnm]):(.+)$/i);
    if (!m) return { ok: false, message: '/revoke <id> or /revoke <slot> <kind:pattern>' };
    const target = s.capabilities.find(
      (c) =>
        c.slot === slot && c.pattern === m[2] && c.kind[0]!.toLowerCase() === m[1]!.toLowerCase(),
    );
    if (!target) return { ok: false, message: 'no matching capability' };
    store.revokeCapability(target.id);
    return { ok: true, message: `revoked ${target.kind}:${target.pattern} from slot ${slot}` };
  },
});

register({
  name: 'caps',
  summary: 'list capabilities (all or by slot)',
  usage: '/caps [slot]',
  handler: async ({ args }) => {
    const { fmtCapability } = await import('../lib/capabilities.js');
    const filter = args[0] ? Number(args[0]) : null;
    const caps = store.getState().capabilities.filter((c) => filter === null || c.slot === filter);
    if (caps.length === 0) return { ok: true, message: 'no capabilities granted' };
    const lines = caps.map((c) => `  [${c.slot}] ${fmtCapability(c)}`).join('\n');
    return { ok: true, message: `capabilities:\n${lines}` };
  },
});

register({
  name: 'lend',
  summary: 'lend a capability from one pane to another (auto-returns)',
  usage: '/lend <from-slot> <to-slot> <kind:pattern> <seconds>',
  handler: async ({ args }) => {
    const { parseCapabilityArg, nextCapabilityId } = await import('../lib/capabilities.js');
    const from = Number(args[0]);
    const to = Number(args[1]);
    const parsed = parseCapabilityArg(args[2] ?? '');
    const secs = Number(args[3]);
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      !parsed ||
      !Number.isFinite(secs) ||
      secs <= 0
    ) {
      return { ok: false, message: '/lend <from> <to> <kind:pattern> <seconds>' };
    }
    const lender = store
      .getState()
      .capabilities.find(
        (c) => c.slot === from && c.kind === parsed.kind && c.pattern === parsed.pattern,
      );
    if (!lender) return { ok: false, message: `slot ${from} doesn't hold that capability to lend` };
    store.addCapability({
      id: nextCapabilityId(),
      kind: parsed.kind,
      pattern: parsed.pattern,
      slot: to,
      grantedBy: from,
      expiresAt: Date.now() + secs * 1000,
      parentId: lender.id,
    });
    return { ok: true, message: `[${from}] → [${to}] ${parsed.kind}:${parsed.pattern} (${secs}s)` };
  },
});

register({
  name: 'theme',
  summary: 'switch the color theme (or list available)',
  usage: '/theme [name|list]',
  handler: async ({ args }) => {
    const { setTheme, listThemes } = await import('../lib/themes.js');
    const arg = args[0];
    if (!arg || arg === 'list') {
      return { ok: true, message: 'themes: ' + listThemes().join(', ') };
    }
    if (setTheme(arg)) {
      const { setTerminalBackground } = await import('../lib/termBg.js');
      const { currentTheme } = await import('../lib/themes.js');
      setTerminalBackground(currentTheme().bg);
      return { ok: true, message: `theme: ${arg}` };
    }
    return { ok: false, message: `unknown theme: ${arg}` };
  },
});

register({
  name: 'models',
  summary: 'list direct-provider model adapters configured in profile',
  usage: '/models',
  handler: () => {
    const panes = store.getState().panes.filter((p) => p.kind === 'cli');
    const lines = panes.map((p) => `  [${p.slot}] ${p.label} · ${p.adapter.id}`);
    return { ok: true, message: 'panes:\n' + lines.join('\n') };
  },
});

register({
  name: 'undo',
  summary: 'undo the last turn on the target pane',
  usage: '/undo',
  handler: ({ targetSlots }) => {
    if (targetSlots.length === 0) return { ok: false, message: 'no target' };
    const slot = targetSlots[0]!;
    const pane = store.getState().panes.find((p) => p.slot === slot);
    if (!pane || pane.turns.length === 0) return { ok: false, message: 'nothing to undo' };
    store.popTurns(slot);
    return { ok: true, message: `undid last turn on [${slot}]` };
  },
});

register({
  name: 'init',
  summary: 'scan the cwd and write SINGULARITY.md (capability + journaled)',
  usage: '/init',
  handler: async ({ targetSlots }) => {
    const slot = targetSlots[0] ?? 1;
    const { checkCapabilities } = await import('../lib/capabilities.js');
    const cap = checkCapabilities(store.getState().capabilities, {
      slot,
      kind: 'write',
      target: 'SINGULARITY.md',
    });
    if (!cap.ok) {
      return {
        ok: false,
        message: `permission denied: /grant ${slot} write:SINGULARITY.md`,
      };
    }
    const { runInit } = await import('../lib/initRepo.js');
    const r = await runInit();
    return { ok: r.ok, message: r.message };
  },
});

register({
  name: 'webfetch',
  summary: 'fetch a URL and prepend contents to the prompt draft',
  usage: '/webfetch <url>',
  handler: async ({ args, targetSlots }) => {
    const url = args[0];
    if (!url) return { ok: false, message: '/webfetch <url>' };
    if (targetSlots.length === 0) return { ok: false, message: 'no target' };
    const slot = targetSlots[0]!;
    const { checkCapabilities } = await import('../lib/capabilities.js');
    const cap = checkCapabilities(store.getState().capabilities, {
      slot,
      kind: 'net',
      target: new URL(url).hostname,
    });
    if (!cap.ok) {
      return {
        ok: false,
        message: `permission denied: /grant ${slot} net:${new URL(url).hostname}`,
      };
    }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const body = (await r.text()).slice(0, 8000);
      const block = `[fetched ${url} · ${r.status}]\n${body}\n[/fetched]\n\n`;
      store.setPromptDraft(block + store.getState().promptDraft);
      return { ok: true, message: `fetched ${url} (${body.length} chars; prepended to draft)` };
    } catch (e) {
      return { ok: false, message: `fetch failed: ${e}` };
    }
  },
});

register({
  name: 'websearch',
  summary: 'inject a DuckDuckGo abstract for the query into the draft',
  usage: '/websearch <query>',
  handler: async ({ args, targetSlots }) => {
    const q = args.join(' ');
    if (!q) return { ok: false, message: '/websearch <query>' };
    if (targetSlots.length === 0) return { ok: false, message: 'no target' };
    const slot = targetSlots[0]!;
    const { checkCapabilities } = await import('../lib/capabilities.js');
    const cap = checkCapabilities(store.getState().capabilities, {
      slot,
      kind: 'net',
      target: 'api.duckduckgo.com',
    });
    if (!cap.ok) {
      return { ok: false, message: `permission denied: /grant ${slot} net:api.duckduckgo.com` };
    }
    try {
      const r = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`,
        { signal: AbortSignal.timeout(10_000) },
      );
      const data: any = await r.json();
      const summary = data.AbstractText || data.Answer || '(no abstract)';
      const related = (data.RelatedTopics ?? [])
        .slice(0, 5)
        .map((t: any) => `- ${t.Text}`)
        .join('\n');
      const block = `[websearch: ${q}]\n${summary}\n\n${related}\n[/websearch]\n\n`;
      store.setPromptDraft(block + store.getState().promptDraft);
      return { ok: true, message: `searched (${summary.length} chars; prepended)` };
    } catch (e) {
      return { ok: false, message: `search failed: ${e}` };
    }
  },
});

register({
  name: 'edit',
  summary: 'apply a find→replace edit to a file (capability + journaled)',
  usage: '/edit <path> :: <find> :: <replace>',
  handler: async ({ raw, targetSlots }) => {
    const body = raw.replace(/^edit\s+/, '');
    const parts = body.split(/\s*::\s*/);
    if (parts.length !== 3) {
      return { ok: false, message: '/edit <path> :: <find> :: <replace>' };
    }
    const [path, find, replace] = parts as [string, string, string];
    if (path.startsWith('/') || path.includes('..')) {
      return { ok: false, message: 'refusing absolute or parent paths' };
    }
    if (find === '') {
      // Without this guard, before.split('').join(replace) interpolates
      // `replace` between every byte of the file — silent data corruption.
      return { ok: false, message: 'find string cannot be empty' };
    }
    const slot = targetSlots[0] ?? 1;
    const { checkCapabilities } = await import('../lib/capabilities.js');
    const cap = checkCapabilities(store.getState().capabilities, {
      slot,
      kind: 'write',
      target: path,
    });
    if (!cap.ok) {
      return { ok: false, message: `permission denied: /grant ${slot} write:${path}` };
    }
    try {
      const before = await fs.readFile(path, 'utf8');
      if (!before.includes(find)) {
        return { ok: false, message: `not found in ${path}: "${find.slice(0, 60)}"` };
      }
      const after = before.split(find).join(replace);
      const { shadowWrite } = await import('../lib/shadowfs.js');
      const entry = await shadowWrite(path, after, { bySlot: slot, label: `/edit ${path}` });
      const count = before.split(find).length - 1;
      return {
        ok: true,
        message: `replaced ${count}× in ${path} (journaled ${entry.id.slice(0, 12)})`,
      };
    } catch (e) {
      return { ok: false, message: `edit failed: ${e}` };
    }
  },
});

register({
  name: 'share',
  summary: 'export the current session as Markdown (capability + journaled)',
  usage: '/share [path]',
  handler: async ({ args, targetSlots }) => {
    const path = args[0] ?? `session-${Date.now()}.md`;
    if (path.startsWith('/') || path.includes('..')) {
      return { ok: false, message: 'refusing absolute or parent paths' };
    }
    const s = store.getState();
    const attribSlot = targetSlots[0] ?? 1;
    // Same governance pipeline as /apply: capability → shadow journal.
    const { checkCapabilities } = await import('../lib/capabilities.js');
    const cap = checkCapabilities(s.capabilities, {
      slot: attribSlot,
      kind: 'write',
      target: path,
    });
    if (!cap.ok) {
      return { ok: false, message: `permission denied: /grant ${attribSlot} write:${path}` };
    }
    const lines: string[] = ['# Singularity session export', ''];
    lines.push(`- exported at: ${new Date().toISOString()}`);
    lines.push(`- panes: ${s.panes.map((p) => p.label).join(', ')}`);
    lines.push(`- session cost: $${s.totalCostUsd.toFixed(4)}`);
    lines.push('');
    if (s.sharedNotes.length > 0) {
      lines.push('## Shared notes');
      for (const n of s.sharedNotes) lines.push(`- ${n}`);
      lines.push('');
    }
    for (const pane of s.panes) {
      if (pane.turns.length === 0) continue;
      lines.push(`## [${pane.slot}] ${pane.label}`);
      lines.push('');
      for (const t of pane.turns) {
        lines.push(`### ${t.role}`);
        lines.push('');
        lines.push(t.content);
        lines.push('');
      }
    }
    if (s.artifacts.length > 0) {
      lines.push('## Artifacts');
      for (const a of s.artifacts) {
        lines.push(`### #${a.seq} — ${a.title ?? '(untitled)'} (${a.lang})`);
        lines.push('');
        lines.push('```' + a.lang);
        lines.push(a.content);
        lines.push('```');
        lines.push('');
      }
    }
    const { shadowWrite } = await import('../lib/shadowfs.js');
    const entry = await shadowWrite(path, lines.join('\n'), {
      bySlot: attribSlot,
      label: '/share session export',
    });
    return { ok: true, message: `exported → ${path} (journaled ${entry.id.slice(0, 12)})` };
  },
});

// ─── World model (/world ...) ──────────────────────────────────────────

let lastWorldCtx: import('../lib/worldModel/index.js').WorldContext | null = null;
const recentPromptsRing: string[] = [];

register({
  name: 'world',
  summary:
    'world-model queries (describe | callers | impact | know | why | diff | uncertain | next | refresh)',
  usage: '/world <subcommand> [args]',
  handler: async ({ args, targetSlots }) => {
    const sub = args[0] ?? 'describe';
    const rest = args.slice(1);
    const wm = await import('../lib/worldModel/index.js');
    const ctx = await wm.makeWorldContext();
    const s = store.getState();
    let result: import('../lib/worldModel/query.js').QueryResult;
    switch (sub) {
      case 'describe':
        result = wm.describe(ctx);
        break;
      case 'callers':
        result = wm.callers(ctx, rest.join(' '));
        break;
      case 'impact':
        result = wm.impact(ctx, rest.join(' '));
        break;
      case 'know':
        result = wm.know(ctx, rest.join(' '), s.sharedNotes);
        break;
      case 'why': {
        const slot = Number(rest[0] ?? targetSlots[0] ?? 1);
        const pane = s.panes.find((p) => p.slot === slot);
        const turns = (pane?.turns ?? []).slice(-6);
        result = wm.whyPane(ctx, slot, turns);
        break;
      }
      case 'diff':
        result = wm.diff(ctx, lastWorldCtx);
        break;
      case 'uncertain':
        result = wm.uncertain(ctx);
        break;
      case 'next':
        result = wm.nextLikelyPrompt(ctx, recentPromptsRing);
        break;
      case 'refresh': {
        wm.invalidateWorldCache();
        const fresh = await wm.makeWorldContext();
        result = {
          ok: true,
          message: `refreshed: ${fresh.graph.files.length} files, ${fresh.graph.symbols.length} symbols`,
        };
        break;
      }
      default:
        return {
          ok: false,
          message:
            '/world <describe|callers <sym>|impact <path>|know <topic>|why [slot]|diff|uncertain|next|refresh>',
        };
    }
    lastWorldCtx = ctx;
    return result;
  },
});

export function pushRecentPrompt(p: string): void {
  recentPromptsRing.push(p);
  if (recentPromptsRing.length > 20) recentPromptsRing.shift();
}

// ─── Messaging / browser / email / calendar / voice (OpenClaw parity) ──

register({
  name: 'msg',
  summary: 'send a message via slack/discord/telegram (capability-gated)',
  usage: '/msg <slack|discord|telegram|all> <text>',
  handler: async ({ args, targetSlots }) => {
    const platform = args[0];
    const text = args.slice(1).join(' ');
    if (!platform || !text)
      return { ok: false, message: '/msg <slack|discord|telegram|all> <text>' };
    const slot = targetSlots[0] ?? 1;
    const { sendMessage, broadcast, platformHostname, configuredPlatforms } =
      await import('../lib/messenger.js');
    const { checkCapabilities } = await import('../lib/capabilities.js');

    if (platform === 'all') {
      const targets = configuredPlatforms();
      if (targets.length === 0)
        return { ok: false, message: 'no messengers configured (set SLACK_WEBHOOK_URL etc.)' };
      // capability check per host
      for (const p of targets) {
        const cap = checkCapabilities(store.getState().capabilities, {
          slot,
          kind: 'net',
          target: platformHostname(p),
        });
        if (!cap.ok) {
          return {
            ok: false,
            message: `permission denied: /grant ${slot} net:${platformHostname(p)}`,
          };
        }
      }
      const results = await broadcast(text);
      const sent = results.filter((r) => r.ok).map((r) => r.platform);
      return { ok: sent.length > 0, message: `sent to ${sent.join(', ') || '(none)'}` };
    }
    if (platform !== 'slack' && platform !== 'discord' && platform !== 'telegram') {
      return { ok: false, message: 'unknown platform' };
    }
    const cap = checkCapabilities(store.getState().capabilities, {
      slot,
      kind: 'net',
      target: platformHostname(platform),
    });
    if (!cap.ok) {
      return {
        ok: false,
        message: `permission denied: /grant ${slot} net:${platformHostname(platform)}`,
      };
    }
    const r = await sendMessage({ platform, text });
    return { ok: r.ok, message: r.ok ? `sent to ${platform}` : `${platform}: ${r.reason}` };
  },
});

register({
  name: 'browse',
  summary: 'open a URL in the default browser (capability-gated)',
  usage: '/browse <url>',
  handler: async ({ args, targetSlots }) => {
    const url = args[0];
    if (!url) return { ok: false, message: '/browse <url>' };
    const slot = targetSlots[0] ?? 1;
    const { checkCapabilities } = await import('../lib/capabilities.js');
    const cap = checkCapabilities(store.getState().capabilities, {
      slot,
      kind: 'net',
      target: new URL(url).hostname,
    });
    if (!cap.ok) {
      return {
        ok: false,
        message: `permission denied: /grant ${slot} net:${new URL(url).hostname}`,
      };
    }
    const { openUrl } = await import('../lib/browse.js');
    const r = await openUrl(url);
    return { ok: r.ok, message: r.ok ? `opened ${url}` : `open failed: ${r.reason}` };
  },
});

register({
  name: 'email',
  summary: 'send an email via SMTP (capability + env-config gated)',
  usage: '/email <to> :: <subject> :: <body>',
  handler: async ({ raw, targetSlots }) => {
    const body = raw.replace(/^email\s+/, '');
    const parts = body.split(/\s*::\s*/);
    if (parts.length !== 3) return { ok: false, message: '/email <to> :: <subject> :: <body>' };
    const [to, subject, text] = parts as [string, string, string];
    const slot = targetSlots[0] ?? 1;
    const host = process.env.SMTP_HOST ?? 'smtp.gmail.com';
    const { checkCapabilities } = await import('../lib/capabilities.js');
    const cap = checkCapabilities(store.getState().capabilities, {
      slot,
      kind: 'net',
      target: host,
    });
    if (!cap.ok) {
      return { ok: false, message: `permission denied: /grant ${slot} net:${host}` };
    }
    const { sendEmail } = await import('../lib/email.js');
    const r = await sendEmail({ to, subject, body: text });
    return { ok: r.ok, message: r.ok ? `email → ${to}` : `email failed: ${r.reason}` };
  },
});

register({
  name: 'calendar',
  summary: 'generate an .ics calendar event (capability + journaled)',
  usage: '/calendar <title> :: <ISO start> :: <duration like 1h30m>',
  handler: async ({ raw, targetSlots }) => {
    const body = raw.replace(/^calendar\s+/, '');
    const parts = body.split(/\s*::\s*/);
    if (parts.length !== 3) {
      return { ok: false, message: '/calendar <title> :: <2026-06-05T10:00> :: <1h30m>' };
    }
    const [title, startStr, durStr] = parts as [string, string, string];
    const { parseStart, parseDuration, renderIcs } = await import('../lib/calendar.js');
    const start = parseStart(startStr);
    const duration = parseDuration(durStr);
    if (!start)
      return { ok: false, message: 'bad start (use ISO 8601, e.g. 2026-06-05T10:00:00Z)' };
    if (duration === null) return { ok: false, message: 'bad duration (use 60m or 1h30m)' };

    const slot = targetSlots[0] ?? 1;
    const path = `event-${Date.now()}.ics`;
    const { checkCapabilities } = await import('../lib/capabilities.js');
    const cap = checkCapabilities(store.getState().capabilities, {
      slot,
      kind: 'write',
      target: path,
    });
    if (!cap.ok) return { ok: false, message: `permission denied: /grant ${slot} write:${path}` };
    const ics = renderIcs({ title, start, durationMinutes: duration });
    const { shadowWrite } = await import('../lib/shadowfs.js');
    const entry = await shadowWrite(path, ics, { bySlot: slot, label: '/calendar' });
    return { ok: true, message: `wrote ${path} (journaled ${entry.id.slice(0, 12)})` };
  },
});

register({
  name: 'say',
  summary: 'speak text via system TTS (macOS say / espeak / PowerShell)',
  usage: '/say <text>',
  handler: async ({ raw }) => {
    const text = raw.replace(/^say\s+/, '').trim();
    if (!text) return { ok: false, message: '/say <text>' };
    const { speak } = await import('../lib/voice.js');
    const r = await speak(text);
    return { ok: r.ok, message: r.ok ? 'spoke' : `tts failed: ${r.reason}` };
  },
});

register({
  name: 'triggers',
  summary: 'list configured OS-event triggers',
  usage: '/triggers',
  handler: async () => {
    const { loadTriggers } = await import('../lib/triggers.js');
    const t = await loadTriggers();
    if (t.length === 0) {
      return { ok: true, message: 'no triggers configured (edit ~/.singularity/triggers.json)' };
    }
    const lines = t.map(
      (x) => `  ${x.id} · ${x.source} ${x.match} → [${x.slot}] ${x.prompt.slice(0, 40)}`,
    );
    return { ok: true, message: `triggers:\n${lines.join('\n')}` };
  },
});

register({
  name: 'grammar',
  summary: 'show the dispatch grammar (operators + slash commands + keys)',
  usage: '/grammar',
  handler: async () => {
    const { renderGrammar, NO_COLOR } = await import('../lib/grammar.js');
    return { ok: true, message: renderGrammar(NO_COLOR) };
  },
});

register({
  name: 'recipe',
  summary: 'run a recipe (sequence of dispatches) or list available',
  usage: '/recipe <name>|list [--key=value ...]',
  handler: async ({ args }) => {
    const { loadRecipe, listRecipes, runRecipe } = await import('../lib/recipes.js');
    const sub = args[0];
    if (!sub || sub === 'list') {
      const names = await listRecipes();
      return {
        ok: true,
        message: names.length
          ? 'recipes:\n' + names.map((n) => `  ${n}`).join('\n')
          : 'no recipes found (put YAML in ~/.singularity/recipes/)',
      };
    }
    const recipe = await loadRecipe(sub);
    if (!recipe) return { ok: false, message: `recipe not found: ${sub}` };
    const vars: Record<string, string> = {};
    for (let i = 1; i < args.length; i++) {
      const m = args[i]!.match(/^--([A-Za-z_][\w-]*)=(.*)$/);
      if (m) vars[m[1]!] = m[2]!;
    }
    const { getRuntimeDispatcher } = await import('../lib/runtimeDispatch.js');
    const rt = getRuntimeDispatcher();
    if (!rt) return { ok: false, message: 'TUI runtime not active' };
    const dispatcher = {
      dispatch: async (input: string, slots: number[]) => {
        rt.submit(input, slots as Slot[]);
      },
      runSlash: async (text: string) => runSlash(text, store.getState().targetSlots),
    };
    const r = await runRecipe(recipe, dispatcher, vars);
    return r.ok
      ? { ok: true, message: `✓ recipe '${recipe.name}' ran ${r.stepsRun} steps` }
      : { ok: false, message: `recipe failed at step ${r.failed?.step}: ${r.failed?.reason}` };
  },
});

register({
  name: 'focus',
  summary: 'targeted row expands; other row shrinks',
  usage: '/focus on|off|toggle',
  handler: ({ args }) => {
    const cur = store.getState().focusMode;
    const v = args[0];
    const next = v === 'on' ? true : v === 'off' ? false : !cur;
    store.setFocusMode(next);
    return { ok: true, message: `focus: ${next ? 'on' : 'off'}` };
  },
});

register({
  name: 'compact',
  summary: 'hide ECG + per-pane footer to reclaim rows for content',
  usage: '/compact on|off|toggle',
  handler: ({ args }) => {
    const cur = store.getState().compactMode;
    const v = args[0];
    const next = v === 'on' ? true : v === 'off' ? false : !cur;
    store.setCompactMode(next);
    return { ok: true, message: `compact: ${next ? 'on' : 'off'}` };
  },
});
