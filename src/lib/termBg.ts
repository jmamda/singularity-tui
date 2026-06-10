/**
 * Own the terminal's background while the TUI runs (OSC 11). Ink only colors
 * the cells it draws, so on a non-black terminal profile every unpainted cell
 * flashes the profile color through the UI. Supported by Terminal.app, iTerm2,
 * and most modern emulators; unknown sequences are ignored harmlessly.
 */

let applied = false;

export function setTerminalBackground(hex: string): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\x1b]11;${hex}\x07`);
  applied = true;
}

export function resetTerminalBackground(): void {
  if (!applied || !process.stdout.isTTY) return;
  // OSC 111 = reset background to the user's profile default.
  process.stdout.write('\x1b]111\x07');
  applied = false;
}
