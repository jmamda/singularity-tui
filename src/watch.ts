import { watch } from 'node:fs';
import { runHeadless } from './headless.js';

export interface WatchOpts {
  dir: string;
  target: string;
  template: string;
  debounceMs?: number;
}

export async function runWatch(opts: WatchOpts): Promise<number> {
  const debounce = opts.debounceMs ?? 800;
  const queue = new Set<string>();
  let timer: NodeJS.Timeout | null = null;

  process.stdout.write(`● watching ${opts.dir} → ${opts.target}\n`);

  watch(opts.dir, { recursive: true }, (event, file) => {
    if (!file) return;
    if (file.startsWith('.') || file.includes('node_modules')) return;
    queue.add(file);
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const files = [...queue];
      queue.clear();
      for (const f of files) {
        const prompt = opts.template.replace(/\{\{file\}\}/g, f);
        process.stdout.write(`\n─── change: ${f} ─────────────────────\n`);
        await runHeadless({ target: opts.target, prompt });
      }
    }, debounce);
  });

  // Keep alive forever
  return new Promise(() => {});
}
