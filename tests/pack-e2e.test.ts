import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
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
  testDir = mkdtempSync(join(tmpdir(), 'pack-e2e-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function skillFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.skill'));
}

describe('pack command (end-to-end)', () => {
  it('packs a single local skill into a valid .skill file', () => {
    writeSkill(testDir, 'my-skill', 'Test description');

    const result = runCli(['pack', testDir, '--output', testDir]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Packed:');

    const files = skillFiles(testDir);
    expect(files).toHaveLength(1);

    const skillPath = join(testDir, files[0]!);
    expect(existsSync(skillPath)).toBe(true);
    const header = readFileSync(skillPath);
    expect(header[0]).toBe(0x50); // 'P'
    expect(header[1]).toBe(0x4b); // 'K'
  });

  it('packs only the requested skill with --skill', () => {
    writeSkill(join(testDir, 'skill-a'), 'skill-a');
    writeSkill(join(testDir, 'skill-b'), 'skill-b');

    const result = runCli(['pack', testDir, '--skill', 'skill-a', '--output', testDir]);

    expect(result.exitCode).toBe(0);

    const files = skillFiles(testDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('skill-a');
  });

  it('packs all skills with --all', () => {
    writeSkill(join(testDir, 'skill-a'), 'skill-a');
    writeSkill(join(testDir, 'skill-b'), 'skill-b');

    const result = runCli(['pack', testDir, '--all', '--output', testDir]);

    expect(result.exitCode).toBe(0);

    const files = skillFiles(testDir);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.includes('skill-a'))).toBe(true);
    expect(files.some((f) => f.includes('skill-b'))).toBe(true);
  });

  it('fails with a non-zero exit code when validation fails', () => {
    writeFileSync(join(testDir, 'SKILL.md'), 'no frontmatter\n');

    const result = runCli(['pack', testDir, '--output', testDir]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Validation failed');
  });
}, 5000);
