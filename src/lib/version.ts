import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

let cached: string | null = null;

/** Version from package.json (works from src/ via tsx and from dist/). */
export function packageVersion(): string {
  if (cached) return cached;
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    cached = JSON.parse(readFileSync(pkgPath, 'utf8')).version ?? '0.0.0';
  } catch {
    cached = '0.0.0';
  }
  return cached!;
}
