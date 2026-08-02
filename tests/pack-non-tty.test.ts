/**
 * Non-TTY behavior for `pack` when multiple skills are discovered without
 * --skill or --all.
 *
 * runCli() spawns the CLI as a subprocess with piped stdin, so
 * `process.stdin.isTTY` is falsy and the interactive selection path degrades
 * to an error that lists the discovered skills.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runCli, writeSkill } from './helpers.js';

let testDir: string;

// The first runCli() call lazily builds the CLI (npm run build), which can take
// several seconds and would blow vitest's default 5s test timeout. Warm the
// build up once up front with a generous hook timeout instead.
beforeAll(() => {
  runCli(['--version']);
}, 120_000);

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'pack-notty-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function skillFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.skill'));
}

function outputOf(result: { stdout: string; stderr: string }): string {
  return result.stdout + result.stderr;
}

describe('pack in a non-TTY environment', () => {
  it('errors with a listing when multiple skills are found without --skill/--all', () => {
    writeSkill(join(testDir, 'a'), 'skill-a');
    writeSkill(join(testDir, 'b'), 'skill-b');

    const result = runCli(['pack', testDir]);

    expect(result.exitCode).toBe(1);
    const output = outputOf(result);
    expect(output).toContain('Multiple skills found');
    expect(output).toContain('Use --skill or --all');
    expect(output).toContain('skill-a');
    expect(output).toContain('skill-b');
  });

  it('packs a single skill when --skill is given', () => {
    writeSkill(join(testDir, 'a'), 'skill-a');
    writeSkill(join(testDir, 'b'), 'skill-b');

    const result = runCli(['pack', testDir, '--skill', 'skill-a', '--output', testDir]);

    expect(result.exitCode).toBe(0);

    const files = skillFiles(testDir);
    expect(files).toHaveLength(1);
  });

  it('packs all skills when --all is given', () => {
    writeSkill(join(testDir, 'a'), 'skill-a');
    writeSkill(join(testDir, 'b'), 'skill-b');

    const result = runCli(['pack', testDir, '--all', '--output', testDir]);

    expect(result.exitCode).toBe(0);

    const files = skillFiles(testDir);
    expect(files).toHaveLength(2);
  });

  it('errors when no skills are found', () => {
    // testDir contains no SKILL.md anywhere
    const result = runCli(['pack', testDir]);

    expect(result.exitCode).toBe(1);
    expect(outputOf(result)).toContain('No skills found');
  });
}, 5000);
