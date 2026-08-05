import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync, copyFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runCli, writeSkill, createTestHomeEnvironment } from './helpers.js';

let testDir: string;

// The first runCli() call lazily builds the CLI (npm run build), which can take
// several seconds and would blow vitest's default 5s test timeout. Warm the
// build up once up front with a generous hook timeout instead.
beforeAll(() => {
  runCli(['--version']);
}, 120_000);

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'add-e2e-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

/** Pack a source skill directory and return the path to the produced .skill file. */
function packSkillToFile(skillSrc: string): string {
  const packedDir = join(testDir, 'packed');
  const packResult = runCli(['pack', skillSrc, '-o', packedDir]);
  expect(packResult.exitCode).toBe(0);

  const skillFiles = readdirSync(packedDir).filter((f) => f.endsWith('.skill'));
  expect(skillFiles).toHaveLength(1);
  return join(packedDir, skillFiles[0]!);
}

describe('add command (end-to-end)', () => {
  it('installs a .skill file into the project scope', () => {
    const skillSrc = join(testDir, 'demo-skill');
    writeSkill(skillSrc, 'demo-skill');
    const skillPath = packSkillToFile(skillSrc);

    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    const result = runCli(['add', skillPath], { cwd: projectDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('.agents/skills');

    const installedSkillMd = join(projectDir, '.agents', 'skills', 'demo-skill', 'SKILL.md');
    expect(existsSync(installedSkillMd)).toBe(true);
    expect(readFileSync(installedSkillMd, 'utf-8')).toContain('name: demo-skill');
  });

  it('installs a .skill file globally with --global', () => {
    const skillSrc = join(testDir, 'demo-skill');
    writeSkill(skillSrc, 'demo-skill');
    const skillPath = packSkillToFile(skillSrc);

    const homeDir = join(testDir, 'home');
    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    const result = runCli(['add', skillPath, '--global'], {
      cwd: projectDir,
      env: createTestHomeEnvironment(homeDir),
    });

    expect(result.exitCode).toBe(0);

    const installedSkillMd = join(homeDir, '.agents', 'skills', 'demo-skill', 'SKILL.md');
    expect(existsSync(installedSkillMd)).toBe(true);
    expect(readFileSync(installedSkillMd, 'utf-8')).toContain('name: demo-skill');
  });

  it('fails with exit code 1 when the .skill file does not exist', () => {
    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    const result = runCli(['add', join(testDir, 'missing.skill')], { cwd: projectDir });

    expect(result.exitCode).toBe(1);
  });

  it('works via the install alias', () => {
    const skillSrc = join(testDir, 'demo-skill');
    writeSkill(skillSrc, 'demo-skill');
    const skillPath = packSkillToFile(skillSrc);

    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    const result = runCli(['install', skillPath], { cwd: projectDir });

    expect(result.exitCode).toBe(0);

    const installedSkillMd = join(projectDir, '.agents', 'skills', 'demo-skill', 'SKILL.md');
    expect(existsSync(installedSkillMd)).toBe(true);
    expect(readFileSync(installedSkillMd, 'utf-8')).toContain('name: demo-skill');
  });

  it('works via the unpack alias', () => {
    const skillSrc = join(testDir, 'demo-skill');
    writeSkill(skillSrc, 'demo-skill');
    const skillPath = packSkillToFile(skillSrc);

    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    const result = runCli(['unpack', skillPath], { cwd: projectDir });

    expect(result.exitCode).toBe(0);

    const installedSkillMd = join(projectDir, '.agents', 'skills', 'demo-skill', 'SKILL.md');
    expect(existsSync(installedSkillMd)).toBe(true);
    expect(readFileSync(installedSkillMd, 'utf-8')).toContain('name: demo-skill');
  });

  it('resolves a bare skill name from the current directory', () => {
    const skillSrc = join(testDir, 'demo-skill');
    writeSkill(skillSrc, 'demo-skill');
    const skillPath = packSkillToFile(skillSrc);

    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    copyFileSync(skillPath, join(projectDir, 'demo-skill.skill'));

    const result = runCli(['add', 'demo-skill'], { cwd: projectDir });

    expect(result.exitCode).toBe(0);

    const installedSkillMd = join(projectDir, '.agents', 'skills', 'demo-skill', 'SKILL.md');
    expect(existsSync(installedSkillMd)).toBe(true);
    expect(readFileSync(installedSkillMd, 'utf-8')).toContain('name: demo-skill');
  });

  it('resolves a bare skill name from $SKILL_PACKER_REPO_DIR', () => {
    const skillSrc = join(testDir, 'demo-skill');
    writeSkill(skillSrc, 'demo-skill');
    const skillPath = packSkillToFile(skillSrc);

    const repoDir = join(testDir, 'repo');
    mkdirSync(repoDir, { recursive: true });
    copyFileSync(skillPath, join(repoDir, 'demo-skill.skill'));

    const homeDir = join(testDir, 'home');
    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    const result = runCli(['add', 'demo-skill'], {
      cwd: projectDir,
      env: { ...createTestHomeEnvironment(homeDir), SKILL_PACKER_REPO_DIR: repoDir },
    });

    expect(result.exitCode).toBe(0);

    const installedSkillMd = join(projectDir, '.agents', 'skills', 'demo-skill', 'SKILL.md');
    expect(existsSync(installedSkillMd)).toBe(true);
    expect(readFileSync(installedSkillMd, 'utf-8')).toContain('name: demo-skill');
  });

  it('fails with exit code 1 and a helpful hint when a bare name is not found', () => {
    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    const result = runCli(['add', 'ghost-skill'], { cwd: projectDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Skill file not found: ghost-skill');
    expect(result.stderr).toContain('Searched:');
    expect(result.stderr).toContain('SKILL_PACKER_REPO_DIR');
  });

  it('fails when the .skill file exceeds --max-skill-size', () => {
    const projectDir = join(testDir, 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'x.skill'), 'y'.repeat(2 * 1024));

    const result = runCli(['add', 'x.skill', '--max-skill-size', '1kb'], {
      cwd: projectDir,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('too large');
  });
}, 10_000);
