import React from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { color } from './theme.js';
import { StatusBar } from './components/StatusBar.js';
import { Pane } from './components/Pane.js';
import { PromptBar } from './components/PromptBar.js';
import { BootScreen } from './components/BootScreen.js';
import { TimelineStrip } from './components/TimelineStrip.js';
import { RaceBars } from './components/RaceBars.js';
import { Notifications } from './components/Notifications.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { CommandPalette, paletteSelectedAction } from './components/CommandPalette.js';
import { store, useStore, type PaneState, type Slot } from './store.js';
import { claudeAdapter } from './adapters/claude.js';
import { opencodeAdapter } from './adapters/opencode.js';
import { codexAdapter } from './adapters/codex.js';
import { antigravityAdapter } from './adapters/antigravity.js';
import { langgraphAdapter } from './adapters/langgraph.js';
import { artifactSentinelAdapter } from './adapters/artifact.js';
import { demoAdapter } from './adapters/demo.js';
import { shellAdapter, registerCapabilitiesGetter } from './adapters/shell.js';
import { makeItermAdapter } from './adapters/iterm.js';
import { ArtifactPane } from './components/ArtifactPane.js';
import { LangGraphTicker } from './components/LangGraphTicker.js';
import { PCStrip } from './components/PCStrip.js';
import { feedPaneStream, inferTitle, sniffLanguage } from './lib/artifacts.js';
import { fetchSnapshot, isConfigured as langsmithConfigured } from './lib/langsmith.js';
import type { Adapter, AdapterEvent } from './adapters/types.js';
import { loadState } from './iterm/state.js';
import { BOOT_TOTAL_MS } from './lib/effects.js';
import { ensureDefaultProfile, loadProfile } from './lib/profiles.js';
import { loadHistory, saveHistory } from './lib/history.js';
import { logEvent, closeLog } from './lib/sessionLog.js';
import { isSlash, runSlash } from './commands/registry.js';
import { gitSummary, looksCodeRelated } from './lib/gitContext.js';
import { fireAndForget, setWebhookUrl } from './lib/webhook.js';
import { parseRelay } from './lib/relay.js';
import { classifyVote } from './lib/quorum.js';
import { extractPlan } from './lib/planExec.js';
import { rosterPreamble } from './lib/roster.js';
import { loadNotes, notesBlock, saveNotes } from './lib/notes.js';
import { loadProjectRules } from './lib/initRepo.js';
import { resolveFileRefs } from './lib/fileRefs.js';
import { extractNotes, newNotesOnly } from './lib/autoNotes.js';
import { extractClarifications, clarifyFollowup } from './lib/clarify.js';
import { extractConfidence } from './lib/confidence.js';
import { extractComments, resolveArtifactRef } from './lib/commentOn.js';
import { enablePersistence, restorePersistedJournal } from './lib/shadowfs.js';
import { loadTrust, saveTrust } from './lib/trust.js';
import { setRuntimeDispatcher } from './lib/runtimeDispatch.js';
import { checkCapabilities as capCheck } from './lib/capabilities.js';
import {
  OP_BROADCAST,
  OP_QUORUM,
  OP_PLAN_WORKER,
  OP_RELAY_RECEIVER,
  PERSONA_PLANNER,
  plannerInstruction,
} from './lib/promptEng.js';

const ADAPTER_BY_ID: Record<string, Adapter> = {
  claude: claudeAdapter,
  opencode: opencodeAdapter,
  codex: codexAdapter,
  antigravity: antigravityAdapter,
  langgraph: langgraphAdapter,
  shell: shellAdapter,
  demo: demoAdapter,
};

// Plumb the store's capability list into the shell adapter without coupling
// the adapter file to store.ts (would create a cycle).
registerCapabilitiesGetter(() => store.getState().capabilities);

let initialized = false;
async function initialize(profileName: string) {
  if (initialized) return;
  initialized = true;

  await ensureDefaultProfile();

  const persisted = await loadState();
  if (persisted?.sessions?.length === 4) {
    store.setItermMode(true);
    for (const session of persisted.sessions) {
      const adapter = makeItermAdapter({
        id: session.label.toLowerCase(),
        label: session.label,
        sessionId: session.sessionId,
      });
      const history = await loadHistory(session.slot);
      const pane: PaneState = {
        id: adapter.id,
        slot: session.slot,
        label: session.label,
        kind: 'cli',
        status: 'STANDBY',
        output: [],
        adapter,
        faultSinceMs: null,
        metrics: { sessionId: session.sessionId.slice(0, 8) },
        locked: false,
        turns: [],
        history,
        historyCursor: null,
        draftBeforeScroll: '',
        retries: 0,
        maxRetries: 0,
        pendingClarifications: [],
      };
      store.registerPane(pane);
    }
    return;
  }

  const profile = (await loadProfile(profileName)) ?? (await loadProfile('default'));
  if (!profile) return;

  if (profile.globalBudgetUsd) store.setGlobalBudget(profile.globalBudgetUsd);
  if (profile.webhookUrl) setWebhookUrl(profile.webhookUrl);
  if (profile.awareness) store.setAwareness(profile.awareness);
  if (profile.requireDispatchCapability) store.setRequireDispatchCapability(true);

  // Plugins from ~/.singularity/plugins/
  const { loadLocalPlugins } = await import('./lib/plugins.js');
  const loaded = await loadLocalPlugins();
  if (loaded.length > 0) store.notify('info', `loaded ${loaded.length} plugin(s): ${loaded.join(', ')}`);

  // Persistent shadow journal + trust survive crashes / restarts.
  await enablePersistence();
  await restorePersistedJournal();
  const savedTrust = await loadTrust();
  if (savedTrust) {
    for (const [slot, v] of Object.entries(savedTrust)) {
      const slotNum = Number(slot);
      const cur = store.getState().trust[slotNum] ?? 0.5;
      store.adjustTrust(slotNum, v - cur);
    }
  }

  // Restore notes from disk
  const notes = await loadNotes();
  if (notes.length > 0) store.setSharedNotes(notes);

  for (const pp of profile.panes) {
    // Artifact pane — sentinel adapter, no dispatch
    if (pp.kind === 'artifact') {
      const adapter = artifactSentinelAdapter;
      const pane: PaneState = {
        id: adapter.id,
        slot: pp.slot,
        label: pp.label ?? 'ARTIFACTS',
        kind: 'artifact',
        status: 'MONITOR',
        output: [],
        adapter,
        faultSinceMs: null,
        metrics: {},
        locked: false,
        turns: [],
        history: [],
        historyCursor: null,
        draftBeforeScroll: '',
        retries: 0,
        maxRetries: 0,
        pendingClarifications: [],
      };
      store.registerPane(pane);
      continue;
    }

    let adapter: Adapter | undefined;
    if (pp.adapterId?.startsWith('provider:')) {
      // provider:anthropic://claude-sonnet-4-6 → direct API
      const { parseProviderUri, makeProviderAdapter } = await import('./adapters/provider.js');
      const parsed = parseProviderUri(pp.adapterId.slice('provider:'.length));
      if (parsed) {
        adapter = makeProviderAdapter({
          id: pp.adapterId,
          label: pp.label ?? parsed.model.toUpperCase(),
          provider: parsed.provider,
          model: parsed.model,
        });
      }
    } else if (pp.adapterId) {
      adapter = ADAPTER_BY_ID[pp.adapterId];
    }
    if (!adapter) continue;
    const ok = await adapter.available();
    const history = await loadHistory(pp.slot);
    const pane: PaneState = {
      id: adapter.id,
      slot: pp.slot,
      label: pp.label ?? adapter.label,
      kind: adapter.kind === 'monitor' ? 'monitor' : 'cli',
      status: ok ? (adapter.kind === 'monitor' ? 'MONITOR' : 'STANDBY') : 'OFFLINE',
      output: [],
      adapter,
      faultSinceMs: null,
      metrics: {},
      locked: false,
      persona: pp.persona,
      turns: [],
      history,
      historyCursor: null,
      draftBeforeScroll: '',
      retries: 0,
      maxRetries: pp.maxRetries ?? 0,
      budgetUsd: pp.budgetUsd,
      gitContext: pp.gitContext,
      pendingClarifications: [],
    };
    store.registerPane(pane);
    if (ok && adapter.kind === 'monitor' && adapter.start) {
      void runStream(pp.slot, adapter.start(), { broadcastTrack: false, originalPrompt: null });
    }
  }
}

interface StreamOpts {
  broadcastTrack: boolean;
  originalPrompt: string | null;
}

async function runStream(
  slot: Slot,
  stream: AsyncIterable<AdapterEvent>,
  opts: StreamOpts,
) {
  const startedAt = Date.now();
  store.setMetrics(slot, { lastDispatchAt: startedAt, durationMs: undefined });
  let assistantText = '';
  let didFault = false;
  let didDone = false;

  for await (const ev of stream) {
    if (ev.type === 'token') {
      store.appendOutput(slot, ev.text);
      assistantText += ev.text;
      await logEvent({ kind: 'token', at: Date.now(), slot, text: ev.text });

      // Feed the artifact extractor and add any completed code blocks.
      const blocks = feedPaneStream(slot, ev.text);
      if (blocks.length > 0) {
        const pane = store.getState().panes.find((p) => p.slot === slot);
        for (const block of blocks) {
          const lang = sniffLanguage(block.content, block.lang);
          store.addArtifact({
            id: `${slot}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sourceSlot: slot,
            sourceLabel: pane?.label ?? `slot${slot}`,
            lang,
            content: block.content,
            createdAt: Date.now(),
            title: inferTitle(block.content),
          });
        }
      }

      if (opts.broadcastTrack) {
        const tokens = Math.max(1, Math.ceil(ev.text.length / 4));
        store.bumpBroadcast(slot, tokens, 'STREAMING', ev.text);
        const bcast = store.getState().broadcast;
        if (bcast?.quorum) {
          const prog = bcast.progress.find((p) => p.slot === slot);
          if (prog) {
            const vote = classifyVote(prog.responseSoFar);
            store.setBroadcastVote(slot, vote);
          }
        }
      }
    } else if (ev.type === 'status') {
      store.setStatus(slot, ev.status);
      if (ev.status === 'FAULT') didFault = true;
      if (ev.status === 'DONE') didDone = true;
      await logEvent({ kind: 'status', at: Date.now(), slot, status: ev.status });
      if (opts.broadcastTrack) store.bumpBroadcast(slot, 0, ev.status);
    } else if (ev.type === 'error') {
      store.appendOutput(slot, `[err] ${ev.message}\n`);
      await logEvent({ kind: 'error', at: Date.now(), slot, message: ev.message });
      fireAndForget({ event: 'fault', slot, message: ev.message });
    } else if (ev.type === 'meta') {
      store.appendOutput(slot, JSON.stringify(ev.data) + '\n');
    } else if (ev.type === 'session') {
      store.setRemoteSessionId(slot, ev.sessionId);
    } else if (ev.type === 'cost') {
      const pane = store.getState().panes.find((p) => p.slot === slot);
      const prev = pane?.metrics ?? {};
      store.setMetrics(slot, {
        tokensIn: (prev.tokensIn ?? 0) + ev.tokensIn,
        tokensOut: (prev.tokensOut ?? 0) + ev.tokensOut,
        costUsd: (prev.costUsd ?? 0) + ev.usd,
      });
      store.addCost(ev.usd);
      await logEvent({
        kind: 'cost',
        at: Date.now(),
        slot,
        tokensIn: ev.tokensIn,
        tokensOut: ev.tokensOut,
        usd: ev.usd,
      });
    }
    store.setMetrics(slot, { durationMs: Date.now() - startedAt });
  }

  if (assistantText) {
    store.appendTurn(slot, { role: 'assistant', content: assistantText, at: Date.now() });

    // Extract confidence from the first line, if present.
    const conf = extractConfidence(assistantText);
    if (conf) {
      store.setMetrics(slot, { confidence: conf.value });
    }

    // Auto-extract notes from the assistant response (if enabled).
    if (store.getState().autoNotes) {
      const found = extractNotes(assistantText);
      const fresh = newNotesOnly(found, store.getState().sharedNotes);
      if (fresh.length > 0) {
        for (const n of fresh) store.addSharedNote(n);
        void saveNotes(store.getState().sharedNotes);
        store.notify('info', `auto-noted ${fresh.length} from [${slot}]: ${fresh[0]!.slice(0, 48)}${fresh.length > 1 ? ' …' : ''}`);
      }
    }

    // Extract agent-to-agent comments and attach them to the referenced artifacts.
    const commentParses = extractComments(assistantText);
    if (commentParses.length > 0) {
      const arts = store.getState().artifacts;
      let attached = 0;
      for (const c of commentParses) {
        const target = resolveArtifactRef(c.ref, arts);
        if (!target) continue;
        const pane = store.getState().panes.find((p) => p.slot === slot);
        store.addArtifactComment({
          id: `${slot}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          artifactId: target.id,
          fromSlot: slot,
          fromLabel: pane?.label ?? `slot${slot}`,
          text: c.text,
          at: Date.now(),
        });
        attached++;
      }
      if (attached > 0) {
        store.notify('info', `[${slot}] attached ${attached} comment${attached === 1 ? '' : 's'}`);
      }
    }

    // Extract clarification requests and queue them for the user.
    const questions = extractClarifications(assistantText);
    if (questions.length > 0) {
      store.queueClarifications(slot, questions);
      // Enter clarify mode only if not already clarifying another pane.
      if (store.getState().clarifyingFor === null) {
        store.enterClarifyMode(slot);
        store.notify('warn', `[${slot}] asked ${questions.length} clarification${questions.length === 1 ? '' : 's'}`);
      }
    }
  }

  if (didDone) {
    const pane = store.getState().panes.find((p) => p.slot === slot);
    fireAndForget({
      event: 'done',
      slot,
      durationMs: Date.now() - startedAt,
      tokensOut: pane?.metrics.tokensOut,
      costUsd: pane?.metrics.costUsd,
    });
    store.resetRetries(slot);
  }

  if (didFault && opts.originalPrompt) {
    const pane = store.getState().panes.find((p) => p.slot === slot);
    if (pane && pane.retries < pane.maxRetries) {
      store.bumpRetries(slot);
      const backoff = 1000 * Math.pow(2, pane.retries);
      store.notify('warn', `[${slot}] retry ${pane.retries + 1}/${pane.maxRetries} in ${backoff / 1000}s`);
      setTimeout(() => dispatchOne(slot, opts.originalPrompt!, opts.broadcastTrack), backoff);
    }
  }
}

function checkBudget(slot: Slot): { ok: boolean; reason?: string } {
  const s = store.getState();
  if (s.globalBudgetUsd !== null && s.totalCostUsd >= s.globalBudgetUsd) {
    fireAndForget({ event: 'budget_exceeded', usd: s.totalCostUsd, cap: s.globalBudgetUsd });
    return { ok: false, reason: `global budget reached ($${s.totalCostUsd.toFixed(4)} / $${s.globalBudgetUsd.toFixed(2)})` };
  }
  const pane = s.panes.find((p) => p.slot === slot);
  if (pane && pane.budgetUsd && (pane.metrics.costUsd ?? 0) >= pane.budgetUsd) {
    fireAndForget({ event: 'budget_exceeded', slot, usd: pane.metrics.costUsd ?? 0, cap: pane.budgetUsd });
    return { ok: false, reason: `[${slot}] pane budget reached ($${(pane.metrics.costUsd ?? 0).toFixed(4)} / $${pane.budgetUsd.toFixed(2)})` };
  }
  return { ok: true };
}

type DispatchKind = 'normal' | 'broadcast' | 'quorum' | 'plan-worker' | 'relay' | 'planner';

const OP_FOR_KIND: Record<DispatchKind, string | null> = {
  normal: null,
  broadcast: OP_BROADCAST,
  quorum: OP_QUORUM,
  'plan-worker': OP_PLAN_WORKER,
  relay: OP_RELAY_RECEIVER,
  planner: null, // planner's persona already engineered; instruction in user prompt
};

function dispatchOne(
  slot: Slot,
  prompt: string,
  broadcastTrack = false,
  kind: DispatchKind = 'normal',
  personaOverride?: string,
) {
  const pane = store.getState().panes.find((p) => p.slot === slot);
  if (!pane || !pane.adapter.send) return;
  if (pane.kind === 'artifact') return;
  if (pane.status === 'OFFLINE') return;
  if (pane.locked) {
    store.notify('warn', `[${slot}] ${pane.label} is locked`);
    return;
  }

  // #13 Dispatch-level permission gate (opt-in via profile.requireDispatchCapability).
  // When enabled, a slot must hold a `dispatch:auto` (or wildcard) cap to act.
  if (store.getState().requireDispatchCapability) {
    const check = capCheck(store.getState().capabilities, {
      slot,
      kind: 'dispatch',
      target: 'auto',
    });
    if (!check.ok) {
      store.notify(
        'error',
        `[${slot}] dispatch denied: needs a dispatch capability. /grant ${slot} dispatch:auto 600`,
      );
      return;
    }
  }
  const budget = checkBudget(slot);
  if (!budget.ok) {
    store.notify('error', budget.reason!);
    return;
  }

  void (async () => {
    // Compose the final prompt: roster + shared notes + git context + user prompt.
    // Relay (`>N text`) is composed earlier in parseRelay and arrives as `prompt`.
    const s = store.getState();
    const blocks: string[] = [];
    if (s.awareness === 'roster') {
      blocks.push(rosterPreamble(s.panes, slot, s.artifacts));
    }
    // Project rules (SINGULARITY.md / AGENTS.md / CLAUDE.md)
    const rules = await loadProjectRules();
    if (rules) blocks.push(rules);
    // @file:N-M expansion
    const fileResolved = await resolveFileRefs(prompt);
    prompt = fileResolved.prompt;
    const notesBlk = notesBlock(s.sharedNotes);
    if (notesBlk) blocks.push(notesBlk);
    if (pane.gitContext && looksCodeRelated(prompt)) {
      const git = await gitSummary();
      if (git) blocks.push(git);
    }
    blocks.push(prompt);
    const finalPrompt = blocks.join('\n\n');

    // Auto-extract notes from the prompt before sending (if enabled).
    if (s.autoNotes) {
      const found = extractNotes(prompt);
      const fresh = newNotesOnly(found, s.sharedNotes);
      if (fresh.length > 0) {
        for (const n of fresh) store.addSharedNote(n);
        void saveNotes(store.getState().sharedNotes);
      }
    }

    store.setLastPrompt(slot, prompt);
    store.appendOutput(slot, `> ${prompt}\n\n`);
    store.appendTurn(slot, { role: 'user', content: prompt, at: Date.now() });
    store.pushHistory(slot, prompt);
    void saveHistory(slot, [...pane.history.filter((h) => h !== prompt), prompt].slice(-100));
    void logEvent({
      kind: 'dispatch',
      at: Date.now(),
      slot,
      prompt,
      persona: pane.persona,
      broadcast: broadcastTrack,
    });
    fireAndForget({
      event: 'dispatch',
      slot,
      prompt,
      persona: pane.persona,
      broadcast: broadcastTrack,
    });
    // Compose persona: base persona (or override) + operating-context for this kind
    const basePersona = personaOverride ?? pane.persona ?? '';
    const opCtx = OP_FOR_KIND[kind];
    const finalPersona = [basePersona, opCtx].filter(Boolean).join('\n\n').trim() || undefined;

    void runStream(
      slot,
      pane.adapter.send!(finalPrompt, {
        persona: finalPersona,
        resumeId: pane.remoteSessionId,
      }),
      { broadcastTrack, originalPrompt: prompt },
    );
  })();
}

function dispatchBroadcast(prompt: string, quorum = false) {
  const eligible = store
    .getState()
    .panes.filter(
      (p) =>
        p.status !== 'OFFLINE' &&
        p.adapter.kind === 'cli' &&
        p.kind !== 'artifact' &&
        !p.locked,
    )
    .map((p) => p.slot);
  if (eligible.length === 0) {
    store.notify('warn', 'no eligible panes for broadcast');
    return;
  }
  store.startBroadcast(prompt, eligible, quorum);
  const kind: DispatchKind = quorum ? 'quorum' : 'broadcast';
  for (const slot of eligible) dispatchOne(slot, prompt, true, kind);
}

let plannerSlot: Slot | null = null;

async function runPlanExec(goal: string) {
  const allPanes = store.getState().panes;
  const cliPanes = allPanes.filter((p) => p.adapter.kind === 'cli' && p.status !== 'OFFLINE');
  if (cliPanes.length === 0) {
    store.notify('warn', 'no eligible panes for plan-exec');
    return;
  }
  const planner = cliPanes.find((p) => p.label === 'CLAUDE') ?? cliPanes[0]!;
  plannerSlot = planner.slot;

  const instruction = plannerInstruction(
    cliPanes.map((p) => ({ slot: p.slot, label: p.label, persona: p.persona })),
  );
  const fullPrompt = `${instruction}\n\nGoal: ${goal}`;
  store.notify('info', `planner: [${planner.slot}] ${planner.label}`);

  // Override the planner pane's persona with PERSONA_PLANNER for this one dispatch.
  dispatchOne(planner.slot, fullPrompt, false, 'planner', PERSONA_PLANNER);

  // Poll for the planner's response (cheap: 250ms tick).
  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (Date.now() - startedAt > 120_000) {
      clearInterval(timer);
      store.notify('error', 'planner timed out');
      plannerSlot = null;
      return;
    }
    const p = store.getState().panes.find((x) => x.slot === planner.slot);
    if (!p) return;
    if (p.status !== 'DONE') return;
    const lastAssistant = [...p.turns].reverse().find((t) => t.role === 'assistant');
    if (!lastAssistant) return;
    clearInterval(timer);
    const steps = extractPlan(lastAssistant.content);
    if (steps.length === 0) {
      store.notify('warn', 'planner produced no parseable steps');
      plannerSlot = null;
      return;
    }
    store.notify('info', `dispatching ${steps.length} plan step(s)`);
    for (const step of steps) {
      dispatchOne(step.slot, step.task, false, 'plan-worker');
    }
    plannerSlot = null;
  }, 250);
}

function dispatchToTargets(prompt: string, targetSlots: Slot[]) {
  if (targetSlots.length === 0) return;
  if (targetSlots.length === 1) {
    dispatchOne(targetSlots[0]!, prompt);
    return;
  }
  store.startBroadcast(prompt, targetSlots);
  for (const slot of targetSlots) dispatchOne(slot, prompt, true);
}

/**
 * Module-level operator-aware submit. Used by both the input key handler
 * (when the user hits Enter) and the runtime dispatcher (so recipes,
 * triggers, and external callers all go through the same routing).
 */
export function submitOperatorAware(text: string, targetSlots: Slot[]): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (isSlash(trimmed)) {
    void runSlash(trimmed, targetSlots).then((res) => {
      if (res.message) store.notify(res.ok ? 'info' : 'error', res.message);
    });
    return;
  }
  if (trimmed.startsWith('!')) {
    dispatchBroadcast(trimmed.slice(1).trim());
    return;
  }
  if (trimmed.startsWith('?')) {
    const q = trimmed.slice(1).trim();
    if (!q) return;
    dispatchBroadcast(q, true);
    return;
  }
  if (trimmed.startsWith('@plan ')) {
    void runPlanExec(trimmed.slice(6).trim());
    return;
  }
  const artifactSend = trimmed.match(/^>>\s*(\d)\s*(.*)$/s);
  if (artifactSend) {
    const toSlot = Number(artifactSend[1]) as Slot;
    const action =
      (artifactSend[2] || '').trim() || 'Review or extend this code. Critique concretely.';
    const s2 = store.getState();
    const a = s2.artifacts[s2.selectedArtifactIdx];
    if (!a) {
      store.notify('warn', 'no artifact selected');
      return;
    }
    if (toSlot < 1 || toSlot > 4) {
      store.notify('error', '>>N must target pane 1-4');
      return;
    }
    const composed =
      `[artifact #${a.seq} from pane ${a.sourceSlot} ${a.sourceLabel}, lang=${a.lang}, title=${a.title ?? ''}]\n` +
      `\`\`\`${a.lang}\n${a.content}\n\`\`\`\n` +
      `[/artifact]\n\n${action}`;
    dispatchOne(toSlot, composed, false, 'relay');
    return;
  }
  const relay = parseRelay(trimmed);
  if (relay) {
    if (relay.relayed) dispatchOne(relay.toSlot, relay.prompt, false, 'relay');
    else store.notify('warn', 'no prior assistant response to relay');
    return;
  }
  dispatchToTargets(trimmed, targetSlots);
}

interface Props {
  profile?: string;
}

export function App({ profile = 'default' }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const panes = useStore((s) => s.panes);
  const targetSlots = useStore((s) => s.targetSlots);
  const draft = useStore((s) => s.promptDraft);
  const bootedAt = useStore((s) => s.bootedAt);
  const broadcast = useStore((s) => s.broadcast);
  const searchPattern = useStore((s) => s.searchPattern);
  const helpVisible = useStore((s) => s.helpVisible);
  const paletteVisible = useStore((s) => s.paletteVisible);

  const [now, setNow] = React.useState(Date.now());
  const [, setResizeNonce] = React.useState(0);
  React.useEffect(() => {
    void initialize(profile);
    const t = setInterval(() => setNow(Date.now()), 100);
    setRuntimeDispatcher({
      submit: (text, slots) => submitOperatorAware(text, slots ?? store.getState().targetSlots),
    });
    return () => {
      clearInterval(t);
      setRuntimeDispatcher(null);
    };
  }, [profile]);

  // Immediate re-layout on terminal resize (don't wait for the 100ms tick).
  React.useEffect(() => {
    const out = stdout;
    if (!out) return;
    const onResize = () => setResizeNonce((n) => n + 1);
    out.on('resize', onResize);
    return () => {
      out.off('resize', onResize);
    };
  }, [stdout]);

  React.useEffect(() => {
    const t = setInterval(() => {
      store.pushHistorySample();
      store.maybeClearBroadcast();
      store.pruneCapabilities();
      // Best-effort: persist trust every second; fire-and-forget.
      void saveTrust(store.getState().trust);
      store.dismissNotificationsBefore(Date.now() - 5000);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Background LangSmith poll — runs always when LANGSMITH_API_KEY is set.
  // Independent of pane layout; renders into the ticker.
  React.useEffect(() => {
    if (!langsmithConfigured()) return;
    let cancelled = false;
    const poll = async () => {
      const snap = await fetchSnapshot();
      if (!cancelled) store.setLanggraph(snap);
    };
    void poll();
    const t = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const booting = now - bootedAt < BOOT_TOTAL_MS;
  const primaryTarget = targetSlots[0] ?? null;

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      for (const p of store.getState().panes) void p.adapter.stop();
      closeLog();
      exit();
      return;
    }
    if (booting) return;

    // Help overlay is modal — any key dismisses it.
    if (store.getState().helpVisible) {
      store.setHelpVisible(false);
      return;
    }

    // Command palette (Ctrl+P or Cmd+P) is modal.
    if (store.getState().paletteVisible) {
      if (key.escape) {
        store.setPaletteVisible(false);
        return;
      }
      if (key.return) {
        const q = store.getState().paletteQuery;
        const sel = store.getState().paletteSelectedIdx;
        const action = paletteSelectedAction(q, sel);
        store.setPaletteVisible(false);
        if (action !== null) store.setPromptDraft(action);
        return;
      }
      if (key.upArrow) {
        store.movePaletteSelection(-1);
        return;
      }
      if (key.downArrow) {
        store.movePaletteSelection(1);
        return;
      }
      if (key.backspace || key.delete) {
        store.setPaletteQuery(store.getState().paletteQuery.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta && input.length === 1) {
        store.setPaletteQuery(store.getState().paletteQuery + input);
      }
      return;
    }

    if (key.ctrl && input === 'p') {
      store.setPaletteVisible(true);
      return;
    }

    if (key.escape) {
      if (store.getState().clarifyingFor !== null) {
        store.exitClarifyMode();
      }
      store.setTargets([]);
      store.setPromptDraft('');
      store.setSearch(null);
      return;
    }
    if (key.tab) {
      store.cycleTarget();
      return;
    }

    // Artifact pane navigation when it's the (only) target
    const target = primaryTarget
      ? store.getState().panes.find((p) => p.slot === primaryTarget)
      : null;
    const onArtifact = target?.kind === 'artifact';

    // Artifact filter mode — chars edit the filter, not the prompt draft.
    const inArtifactFilter = onArtifact && store.getState().artifactFilterMode;
    if (inArtifactFilter) {
      if (key.escape) {
        store.setArtifactFilterMode(false);
        return;
      }
      if (key.return) {
        store.setArtifactFilterMode(false);
        return;
      }
      if (key.backspace || key.delete) {
        const cur = store.getState().artifactFilter;
        store.setArtifactFilter(cur.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta && input.length === 1) {
        store.setArtifactFilter(store.getState().artifactFilter + input);
        return;
      }
      return; // swallow other keys while filtering
    }

    if (onArtifact && draft === '') {
      if (input === 'j') {
        store.selectArtifactDelta(1);
        return;
      }
      if (input === 'k') {
        store.selectArtifactDelta(-1);
        return;
      }
      if (input === '/') {
        store.setArtifactFilterMode(true);
        return;
      }
      if (input === 'p') {
        const arts = store.getState().artifacts;
        const cur = arts[store.getState().selectedArtifactIdx];
        if (cur) {
          store.togglePinArtifact(cur.id);
          const pinned = store.getState().pinnedArtifactIds.includes(cur.id);
          store.notify('info', `${pinned ? 'pinned' : 'unpinned'} artifact: ${cur.title}`);
        }
        return;
      }
      if (input === 's') {
        const a = store.getState().artifacts[store.getState().selectedArtifactIdx];
        if (!a) return;
        const ext =
          a.lang === 'typescript' ? 'ts'
          : a.lang === 'javascript' ? 'js'
          : a.lang === 'python' ? 'py'
          : a.lang === 'json' ? 'json'
          : a.lang === 'markdown' ? 'md'
          : a.lang || 'txt';
        const path = `artifact-${Date.now()}.${ext}`;
        void (async () => {
          // Same pipeline as /apply and /save: capability → sentinel → shadow journal.
          const { checkCapabilities } = await import('./lib/capabilities.js');
          const cap = checkCapabilities(store.getState().capabilities, {
            slot: a.sourceSlot,
            kind: 'write',
            target: path,
          });
          if (!cap.ok) {
            store.notify('error', `cannot save: ${cap.reason} — /grant ${a.sourceSlot} write:${path}`);
            return;
          }
          const { sentinelVerdict, TRUST_DELTAS } = await import('./lib/sentinel.js');
          const verdict = sentinelVerdict({ kind: 'write', target: path, slot: a.sourceSlot });
          if (!verdict.ok) {
            store.adjustTrust(a.sourceSlot, TRUST_DELTAS.veto);
            store.notify('error', `sentinel veto: ${verdict.reason}`);
            return;
          }
          const { shadowWrite } = await import('./lib/shadowfs.js');
          try {
            const entry = await shadowWrite(path, a.content, {
              bySlot: a.sourceSlot,
              label: `s-keybind artifact #${a.seq}`,
            });
            store.adjustTrust(a.sourceSlot, TRUST_DELTAS.cleanExecution);
            store.notify('info', `saved → ${path} (journaled ${entry.id.slice(0, 12)})`);
          } catch (e) {
            store.adjustTrust(a.sourceSlot, TRUST_DELTAS.fault);
            store.notify('error', `save failed: ${e}`);
          }
        })();
        return;
      }
      if (input === 'c') {
        const a = store.getState().artifacts[store.getState().selectedArtifactIdx];
        if (a) {
          import('node:child_process').then(({ spawn }) => {
            const p = spawn('pbcopy');
            p.stdin.write(a.content);
            p.stdin.end();
            store.notify('info', `copied artifact #${store.getState().selectedArtifactIdx + 1} to clipboard`);
          });
        }
        return;
      }
    }

    if (key.pageUp || (key.shift && key.upArrow)) {
      const t = primaryTarget;
      if (t) store.scrollPane(t, 10);
      return;
    }
    if (key.pageDown || (key.shift && key.downArrow)) {
      const t = primaryTarget;
      if (t) store.scrollPane(t, -10);
      return;
    }

    if (key.upArrow) {
      if (onArtifact) {
        store.selectArtifactDelta(-1);
        return;
      }
      if (primaryTarget) store.historyPrev(primaryTarget, draft);
      return;
    }
    if (key.downArrow) {
      if (onArtifact) {
        store.selectArtifactDelta(1);
        return;
      }
      if (primaryTarget) store.historyNext(primaryTarget);
      return;
    }

    if (draft === '' && (input === '!' || input === '/' || input === '?' || input === '>' || input === '@')) {
      store.setPromptDraft(input);
      return;
    }

    // digit toggles target inclusion (when draft is empty)
    if (draft === '' && input >= '1' && input <= '5') {
      store.toggleTarget(Number(input) as Slot);
      return;
    }

    if (key.return) {
      const text = store.getState().promptDraft.trim();
      if (!text) return;

      // Clarify mode — answer goes back to the asking pane as a follow-up.
      const clarifyingSlot = store.getState().clarifyingFor;
      if (clarifyingSlot) {
        const askingPane = store.getState().panes.find((p) => p.slot === clarifyingSlot);
        const q = askingPane?.pendingClarifications[0];
        if (q) {
          const followup = clarifyFollowup(q.question, text);
          store.popClarification(clarifyingSlot);
          // If more queued, stay in clarify mode for this same pane.
          if ((askingPane?.pendingClarifications.length ?? 0) <= 1) {
            store.exitClarifyMode();
          }
          dispatchOne(clarifyingSlot, followup);
        }
        store.setPromptDraft('');
        return;
      }

      if (isSlash(text)) {
        void runSlash(text, store.getState().targetSlots).then((res) => {
          if (res.message) store.notify(res.ok ? 'info' : 'error', res.message);
        });
        store.setPromptDraft('');
        return;
      }

      if (text.startsWith('!')) {
        dispatchBroadcast(text.slice(1).trim());
        store.setPromptDraft('');
        return;
      }

      if (text.startsWith('?')) {
        const q = text.slice(1).trim();
        if (!q) {
          // bare "?" + Enter → open the help overlay (quorum needs a question)
          store.setHelpVisible(true);
          store.setPromptDraft('');
          return;
        }
        dispatchBroadcast(q, true);
        store.setPromptDraft('');
        return;
      }

      if (text.startsWith('@plan ')) {
        void runPlanExec(text.slice(6).trim());
        store.setPromptDraft('');
        return;
      }

      // >>N [action] — dispatch the selected artifact as the prompt to pane N
      const artifactSend = text.match(/^>>\s*(\d)\s*(.*)$/s);
      if (artifactSend) {
        const toSlot = Number(artifactSend[1]) as Slot;
        const action = (artifactSend[2] || '').trim() || 'Review or extend this code. Critique concretely.';
        const s2 = store.getState();
        const a = s2.artifacts[s2.selectedArtifactIdx];
        if (!a) {
          store.notify('warn', 'no artifact selected — produce or select one first');
          store.setPromptDraft('');
          return;
        }
        if (toSlot < 1 || toSlot > 4) {
          store.notify('error', '>>N must target pane 1-4');
          store.setPromptDraft('');
          return;
        }
        const composed =
          `[artifact #${a.seq} from pane ${a.sourceSlot} ${a.sourceLabel}, lang=${a.lang}, title=${a.title ?? ''}]\n` +
          `\`\`\`${a.lang}\n${a.content}\n\`\`\`\n` +
          `[/artifact]\n\n${action}`;
        dispatchOne(toSlot, composed, false, 'relay');
        store.setPromptDraft('');
        return;
      }

      const relay = parseRelay(text);
      if (relay) {
        if (!relay.relayed) {
          store.notify('warn', 'no prior assistant response in source pane to relay');
        } else {
          dispatchOne(relay.toSlot, relay.prompt, false, 'relay');
        }
        store.setPromptDraft('');
        return;
      }

      dispatchToTargets(text, store.getState().targetSlots);
      store.setPromptDraft('');
      return;
    }

    if (key.backspace || key.delete) {
      store.setPromptDraft(draft.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      store.setPromptDraft(draft + input);
    }
  });

  const cols = stdout?.columns ?? 100;
  const rows = stdout?.rows ?? 30;

  if (booting) {
    return <BootScreen startedAt={bootedAt} cols={cols} rows={rows} />;
  }

  if (helpVisible) {
    return <HelpOverlay cols={cols} rows={rows} />;
  }

  if (paletteVisible) {
    return <CommandPalette cols={cols} rows={rows} />;
  }

  // Graceful degradation: refuse to render a garbled grid in a too-small terminal.
  const MIN_COLS = 60;
  const MIN_ROWS = 20;
  if (cols < MIN_COLS || rows < MIN_ROWS) {
    return (
      <Box width={cols} height={rows} alignItems="center" justifyContent="center" flexDirection="column">
        <Text color={color.amber} bold>⚠ terminal too small</Text>
        <Text color={color.inactive}>
          {cols}×{rows} — need at least {MIN_COLS}×{MIN_ROWS}
        </Text>
        <Text color={color.inactive}>resize the window to continue</Text>
      </Box>
    );
  }

  const paneWidth = Math.floor((cols - 2) / 2);
  const langgraphSnap = store.getState().langgraph;
  const showLanggraphTicker = langgraphSnap !== null;
  const compactMode = useStore((s) => s.compactMode);
  const focusMode = useStore((s) => s.focusMode);
  const reserved = 3 + 5 + (broadcast ? 6 : 0) + 4 + 2 + (showLanggraphTicker ? 3 : 0);
  const totalPaneHeight = Math.max(18, rows - reserved);

  // Compact panes need fewer min rows.
  const minRow = compactMode ? 5 : 9;

  // Focus mode: if a row contains a target, it gets 2/3; the other gets 1/3.
  // If both rows have targets (or none do), heights split equally.
  const topHasTarget = targetSlots.some((s) => s === 1 || s === 2);
  const botHasTarget = targetSlots.some((s) => s === 3 || s === 4);
  let topHeight: number;
  let botHeight: number;
  if (focusMode && topHasTarget && !botHasTarget) {
    topHeight = Math.max(minRow, Math.floor((totalPaneHeight * 2) / 3));
    botHeight = Math.max(minRow, totalPaneHeight - topHeight);
  } else if (focusMode && botHasTarget && !topHasTarget) {
    botHeight = Math.max(minRow, Math.floor((totalPaneHeight * 2) / 3));
    topHeight = Math.max(minRow, totalPaneHeight - botHeight);
  } else {
    topHeight = Math.max(minRow, Math.floor(totalPaneHeight / 2));
    botHeight = Math.max(minRow, totalPaneHeight - topHeight);
  }

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <StatusBar />
      <Box flexDirection="column">
        <Box>
          {[1, 2].map((slot) => {
            const pane = panes.find((p) => p.slot === slot);
            if (!pane) return null;
            const targeted = targetSlots.includes(slot as Slot);
            if (pane.kind === 'artifact') {
              return (
                <ArtifactPane
                  key={slot}
                  targeted={targeted}
                  width={paneWidth}
                  height={topHeight}
                />
              );
            }
            return (
              <Pane
                key={slot}
                pane={pane}
                targeted={targeted}
                width={paneWidth}
                height={topHeight}
                faultSinceMs={pane.faultSinceMs}
                metrics={pane.metrics}
                searchPattern={searchPattern}
                compact={compactMode}
                scrollOffset={store.getState().scrollOffset[slot] ?? 0}
              />
            );
          })}
        </Box>
        <Box>
          {[3, 4].map((slot) => {
            const pane = panes.find((p) => p.slot === slot);
            if (!pane) return null;
            const targeted = targetSlots.includes(slot as Slot);
            if (pane.kind === 'artifact') {
              return (
                <ArtifactPane
                  key={slot}
                  targeted={targeted}
                  width={paneWidth}
                  height={botHeight}
                />
              );
            }
            return (
              <Pane
                key={slot}
                pane={pane}
                targeted={targeted}
                width={paneWidth}
                height={botHeight}
                faultSinceMs={pane.faultSinceMs}
                metrics={pane.metrics}
                searchPattern={searchPattern}
                compact={compactMode}
                scrollOffset={store.getState().scrollOffset[slot] ?? 0}
              />
            );
          })}
        </Box>
      </Box>
      <TimelineStrip width={cols} />
      <PCStrip width={cols} />
      {showLanggraphTicker ? <LangGraphTicker width={cols} /> : null}
      {broadcast ? <RaceBars width={cols} /> : null}
      <Notifications />
      <PromptBar />
    </Box>
  );
}
