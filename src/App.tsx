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
import { store, useStore, type Slot } from './store.js';
import { ArtifactPane } from './components/ArtifactPane.js';
import { LangGraphTicker } from './components/LangGraphTicker.js';
import { PCStrip } from './components/PCStrip.js';
import { fetchSnapshot, isConfigured as langsmithConfigured } from './lib/langsmith.js';
import { BOOT_TOTAL_MS } from './lib/effects.js';
import { closeLog } from './lib/sessionLog.js';
import { clarifyFollowup } from './lib/clarify.js';
import { saveTrust } from './lib/trust.js';
import { setRuntimeDispatcher } from './lib/runtimeDispatch.js';
import { initialize, dispatchOne, submitOperatorAware } from './dispatcher.js';

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
  const compactMode = useStore((s) => s.compactMode);
  const focusMode = useStore((s) => s.focusMode);

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
          a.lang === 'typescript'
            ? 'ts'
            : a.lang === 'javascript'
              ? 'js'
              : a.lang === 'python'
                ? 'py'
                : a.lang === 'json'
                  ? 'json'
                  : a.lang === 'markdown'
                    ? 'md'
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
            store.notify(
              'error',
              `cannot save: ${cap.reason} — /grant ${a.sourceSlot} write:${path}`,
            );
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
          void import('./lib/clipboard.js').then(async ({ copyToClipboard }) => {
            const ok = await copyToClipboard(a.content);
            if (ok) {
              store.notify(
                'info',
                `copied artifact #${store.getState().selectedArtifactIdx + 1} to clipboard`,
              );
            } else {
              store.notify('error', 'no clipboard tool found (pbcopy/clip/wl-copy/xclip/xsel)');
            }
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

    if (
      draft === '' &&
      (input === '!' || input === '/' || input === '?' || input === '>' || input === '@')
    ) {
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
      store.setPromptDraft('');

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
        return;
      }

      // Bare "?" + Enter → open the help overlay (quorum needs a question).
      if (text === '?') {
        store.setHelpVisible(true);
        return;
      }

      submitOperatorAware(text, store.getState().targetSlots);
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
      <Box
        width={cols}
        height={rows}
        alignItems="center"
        justifyContent="center"
        flexDirection="column"
      >
        <Text color={color.amber} bold>
          ⚠ terminal too small
        </Text>
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
                <ArtifactPane key={slot} targeted={targeted} width={paneWidth} height={topHeight} />
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
                <ArtifactPane key={slot} targeted={targeted} width={paneWidth} height={botHeight} />
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
