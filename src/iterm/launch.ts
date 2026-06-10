import { runAppleScript, escapeAppleString } from './applescript.js';

export interface ItermSession {
  slot: 1 | 2 | 3 | 4;
  label: string;
  command: string;
  sessionId: string;
  tty: string;
}

interface LaunchSpec {
  slot: 1 | 2 | 3 | 4;
  label: string;
  command: string;
}

export function isInsideIterm(): boolean {
  return process.env.TERM_PROGRAM === 'iTerm.app';
}

/**
 * Builds 4 iTerm2 splits below the current session (controller stays on top).
 * Layout target:
 *   [controller]   ← current session
 *   ├──────┬──────┤
 *   │ slot1 │ slot2 │
 *   ├──────┼──────┤
 *   │ slot3 │ slot4 │
 *
 * Returns session ids in slot order. When not inside iTerm2, opens a new
 * iTerm window first and uses its initial session as the controller proxy.
 */
export async function launchSplits(specs: LaunchSpec[]): Promise<ItermSession[]> {
  if (specs.length !== 4) throw new Error('launchSplits expects exactly 4 specs');

  // We split the *current* session horizontally → bottom-half "row container".
  // Then we split that bottom container into 4 panes (2×2).
  // Each split returns the new session id; the original keeps the controller.
  const cmds = specs.map((s) => escapeAppleString(s.command));
  const labels = specs.map((s) => escapeAppleString(s.label));

  // The cleanest, most reliable approach: open a fresh iTerm window with 4 splits.
  // We forgo "split current session" to avoid mangling the user's existing layout.
  const fullScript = `
tell application "iTerm2"
  activate
  set newWindow to (create window with default profile)
  tell current session of newWindow
    set name to "${labels[0]}"
    write text "${cmds[0]}"
    set s1 to id
    set t1 to tty
    set rightSession to (split vertically with default profile)
  end tell
  tell rightSession
    set name to "${labels[1]}"
    write text "${cmds[1]}"
    set s2 to id
    set t2 to tty
  end tell
  -- split slot1 horizontally to make slot3 below it
  tell session id s1 of newWindow
    set bottomLeft to (split horizontally with default profile)
  end tell
  tell bottomLeft
    set name to "${labels[2]}"
    write text "${cmds[2]}"
    set s3 to id
    set t3 to tty
  end tell
  -- split slot2 horizontally to make slot4 below it
  tell session id s2 of newWindow
    set bottomRight to (split horizontally with default profile)
  end tell
  tell bottomRight
    set name to "${labels[3]}"
    write text "${cmds[3]}"
    set s4 to id
    set t4 to tty
  end tell
  return s1 & "|" & t1 & "::" & s2 & "|" & t2 & "::" & s3 & "|" & t3 & "::" & s4 & "|" & t4
end tell
`;

  const out = await runAppleScript(fullScript);
  const parts = out.split('::');
  if (parts.length !== 4) {
    throw new Error(`unexpected iTerm2 launch output: ${out}`);
  }
  return parts.map((part, i) => {
    const [sessionId, tty] = part.split('|');
    return {
      slot: specs[i]!.slot,
      label: specs[i]!.label,
      command: specs[i]!.command,
      sessionId: sessionId ?? '',
      tty: tty ?? '',
    };
  });
}

export async function sendToSession(sessionId: string, text: string): Promise<void> {
  const escaped = escapeAppleString(text);
  const script = `
tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if id of s is "${escapeAppleString(sessionId)}" then
          tell s to write text "${escaped}"
          return
        end if
      end repeat
    end repeat
  end repeat
end tell
`;
  await runAppleScript(script);
}

export async function killSession(sessionId: string): Promise<void> {
  const script = `
tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if id of s is "${escapeAppleString(sessionId)}" then
          tell s to close
          return
        end if
      end repeat
    end repeat
  end repeat
end tell
`;
  await runAppleScript(script);
}
