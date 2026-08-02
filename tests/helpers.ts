/**
 * Shared utilities for integration tests that exercise the real skill-packer
 * CLI as a subprocess.
 *
 * How the CLI is launched:
 * - `tsx` is not a dependency, and `src/cli.ts` uses bundler-style `.js`
 *   import specifiers (`import { success } from './print.js'`) that plain Node
 *   cannot resolve from source.
 * - Neither `src/cli.ts` nor the built `dist/cli.mjs` invoke `main()` by
 *   themselves — only the bin wrappers (`bin/cli.mjs`, `bin/pack-skill.mjs`)
 *   import the built bundle and call `main()` explicitly.
 *
 * So these helpers build the project on demand (`npm run build`, only when
 * `dist/cli.mjs` is missing or stale) and then spawn `node bin/cli.mjs <args>`
 * as a subprocess.
 */

// ALL CLI operations timeout at 10s — skill-packer never takes longer.

import { execFileSync, execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const CLI_ENTRY = join(PROJECT_ROOT, 'bin', 'cli.mjs');
const DIST_CLI = join(PROJECT_ROOT, 'dist', 'cli.mjs');
const BUILD_LOCK = join(PROJECT_ROOT, 'dist', '.building');

const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let buildChecked = false;

/** Recursively collect every `.ts` file under a directory. */
function collectTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
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

/**
 * Ensure `dist/cli.mjs` exists and is up to date with `src/`. Runs
 * `npm run build` once per process when the build output is missing or stale.
 * A lock file serializes concurrent rebuilds (vitest may import this helper
 * from multiple workers).
 */
function ensureBuilt(): void {
  if (buildChecked) return;

  if (existsSync(DIST_CLI) && statSync(DIST_CLI).mtimeMs >= newestSourceMtime()) {
    buildChecked = true;
    return;
  }

  const lockStart = Date.now();
  while (existsSync(BUILD_LOCK)) {
    if (Date.now() - lockStart > 120_000) {
      // Stale lock (a previous run crashed mid-build); break through it.
      rmSync(BUILD_LOCK, { force: true });
      break;
    }
    // Synchronous sleep via Atomics.wait on the main thread.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }

  // Another worker may have just finished building while we waited.
  if (existsSync(DIST_CLI) && statSync(DIST_CLI).mtimeMs >= newestSourceMtime()) {
    buildChecked = true;
    return;
  }

  mkdirSync(dirname(BUILD_LOCK), { recursive: true });
  writeFileSync(BUILD_LOCK, String(process.pid));
  try {
    execSync(`${NPM_BIN} run build`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  } catch (error: any) {
    const stderr = error?.stderr?.toString() ?? '';
    throw new Error(
      `skill-packer build failed (needed to run CLI integration tests):\n${stderr}`
    );
  } finally {
    rmSync(BUILD_LOCK, { force: true });
  }
  buildChecked = true;
}

/**
 * Run the skill-packer CLI as a subprocess and return stdout/stderr/exitCode.
 * Uses the built binary via the `bin/cli.mjs` entry point (rebuilding on
 * demand when the dist output is stale).
 */
export function runCli(
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string>; timeout?: number }
): { stdout: string; stderr: string; exitCode: number } {
  ensureBuilt();
  const env = { ...process.env, ...opts?.env };
  try {
    const stdout = execFileSync(process.execPath, [CLI_ENTRY, ...args], {
      cwd: opts?.cwd,
      env,
      timeout: opts?.timeout ?? 10_000,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout: stripAnsi(stdout), stderr: '', exitCode: 0 };
  } catch (e: any) {
    const stdout = stripAnsi(e.stdout?.toString() ?? '');
    const stderr = stripAnsi(e.stderr?.toString() ?? '');
    const exitCode = e.status ?? 1;
    return { stdout, stderr, exitCode };
  }
}

/**
 * Run the CLI with stdin input (for interactive prompts like
 * "Pack all N skills? [y/N]").
 */
export function runCliWithInput(
  args: string[],
  input: string,
  opts?: { cwd?: string; env?: Record<string, string>; timeout?: number }
): { stdout: string; stderr: string; exitCode: number } {
  ensureBuilt();
  const env = { ...process.env, ...opts?.env };
  try {
    const stdout = execFileSync(process.execPath, [CLI_ENTRY, ...args], {
      cwd: opts?.cwd,
      env,
      input: input + '\n',
      timeout: opts?.timeout ?? 10_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: stripAnsi(stdout), stderr: '', exitCode: 0 };
  } catch (e: any) {
    const stdout = stripAnsi(e.stdout?.toString() ?? '');
    const stderr = stripAnsi(e.stderr?.toString() ?? '');
    const exitCode = e.status ?? 1;
    return { stdout, stderr, exitCode };
  }
}

/** Strip ANSI escape codes from a string. */
export function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\].*?(?:\x07|\x1B\\)/g, '');
}

/**
 * Write a minimal SKILL.md file to a directory and return its path.
 * Creates the directory if it does not exist.
 */
export function writeSkill(dir: string, name: string, description = 'Test skill'): string {
  mkdirSync(dir, { recursive: true });
  const skillPath = join(dir, 'SKILL.md');
  const content = `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nTest content.\n`;
  writeFileSync(skillPath, content);
  return skillPath;
}

/** Write a JSON file, creating directories as needed. */
export function writeJson(filePath: string, data: unknown): string {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

/**
 * Build an isolated test environment that points HOME and common config/data
 * directories at a temporary directory, so tests do not touch the real user
 * config. Ported from the skills repo's test utils.
 */
export function createTestHomeEnvironment(home: string): Record<string, string> {
  return {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_STATE_HOME: join(home, '.local', 'state'),
    XDG_CACHE_HOME: join(home, '.cache'),
    APPDATA: join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(home, 'AppData', 'Local'),
  };
}
