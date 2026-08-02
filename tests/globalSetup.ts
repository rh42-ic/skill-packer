/**
 * Global setup: build the project once before any vitest worker starts.
 * This prevents per-worker BUILD_LOCK contention and test timeouts under
 * parallel load. Each worker's ensureBuilt() will find a fresh dist/ and
 * take the fast path.
 */
import { execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DIST_CLI = join(PROJECT_ROOT, 'dist', 'cli.mjs');

/** Recursively collect every .ts file under a directory. */
function collectTsFiles(dir: string): string[] {
  const { readdirSync } = require('fs') as typeof import('fs');
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

function newestSourceMtime(): number {
  const files = [
    ...collectTsFiles(join(PROJECT_ROOT, 'src')),
    ...collectTsFiles(join(PROJECT_ROOT, 'bin')),
  ];
  return files.reduce((max, file) => Math.max(max, statSync(file).mtimeMs), 0);
}

export function setup(): void {
  // Skip build if dist is already up-to-date.
  if (existsSync(DIST_CLI) && statSync(DIST_CLI).mtimeMs >= newestSourceMtime()) {
    return;
  }

  execSync('npm run build', {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
}
