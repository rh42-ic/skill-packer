import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import {
  isSubpathSafe,
  getSkillDisplayName,
  shouldInstallInternalSkills,
  parseSkillMd,
} from '../skills.ts';
import type { Skill } from '../types.ts';

describe('isSubpathSafe', () => {
  it('returns true for a normal subpath', () => {
    expect(isSubpathSafe('/base/repo', 'skills/my-skill')).toBe(true);
  });

  it('returns true for "." subpath', () => {
    expect(isSubpathSafe('/base/repo', '.')).toBe(true);
  });

  it('returns true for empty subpath', () => {
    expect(isSubpathSafe('/base/repo', '')).toBe(true);
  });

  it('returns false for ".." traversal', () => {
    expect(isSubpathSafe('/base/repo', '../escape')).toBe(false);
  });

  it('returns false for subpath escaping via ".."', () => {
    expect(isSubpathSafe('/base/repo', 'skills/../../etc/passwd')).toBe(false);
  });

  it('handles relative base path', () => {
    expect(isSubpathSafe('./repo', 'skills/my-skill')).toBe(true);
    expect(isSubpathSafe('./repo', '../../etc')).toBe(false);
  });
});

describe('getSkillDisplayName', () => {
  it('returns skill name when available', () => {
    const skill: Skill = {
      name: 'my-skill',
      description: 'A skill',
      path: '/some/path/skill-dir',
    };
    expect(getSkillDisplayName(skill)).toBe('my-skill');
  });

  it('returns basename when name is empty', () => {
    const skill: Skill = {
      name: '',
      description: 'A skill',
      path: '/some/path/skill-dir',
    };
    expect(getSkillDisplayName(skill)).toBe('skill-dir');
  });
});

describe('shouldInstallInternalSkills', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns false when INSTALL_INTERNAL_SKILLS is not set', () => {
    delete process.env.INSTALL_INTERNAL_SKILLS;
    expect(shouldInstallInternalSkills()).toBe(false);
  });

  it('returns true when INSTALL_INTERNAL_SKILLS=1', () => {
    process.env.INSTALL_INTERNAL_SKILLS = '1';
    expect(shouldInstallInternalSkills()).toBe(true);
  });

  it('returns true when INSTALL_INTERNAL_SKILLS=true', () => {
    process.env.INSTALL_INTERNAL_SKILLS = 'true';
    expect(shouldInstallInternalSkills()).toBe(true);
  });

  it('returns false when INSTALL_INTERNAL_SKILLS=0', () => {
    process.env.INSTALL_INTERNAL_SKILLS = '0';
    expect(shouldInstallInternalSkills()).toBe(false);
  });
});

// ============================================================
// parseSkillMd integration tests
// ============================================================
describe('parseSkillMd', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `skill-parser-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses a valid SKILL.md', async () => {
    const skillPath = join(tmpDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: my-plugin
description: Does amazing things
metadata:
  version: "1.0"
---
# My Plugin

Plugin body.`
    );

    const skill = await parseSkillMd(skillPath);
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('my-plugin');
    expect(skill!.description).toBe('Does amazing things');
    expect(skill!.path).toBe(tmpDir);
    expect(skill!.rawContent).toContain('# My Plugin');
    expect(skill!.metadata).toEqual({ version: '1.0' });
  });

  it('returns null for SKILL.md without name', async () => {
    const skillPath = join(tmpDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
description: Missing name
---
body`
    );

    const skill = await parseSkillMd(skillPath);
    expect(skill).toBeNull();
  });

  it('returns null for SKILL.md without description', async () => {
    const skillPath = join(tmpDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: no-desc
---
body`
    );

    const skill = await parseSkillMd(skillPath);
    expect(skill).toBeNull();
  });

  it('returns null when file does not exist', async () => {
    const skill = await parseSkillMd(join(tmpDir, 'nonexistent.md'));
    expect(skill).toBeNull();
  });

  it('returns null when name is not a string', async () => {
    const skillPath = join(tmpDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: 123
description: A skill
---
body`
    );

    const skill = await parseSkillMd(skillPath);
    expect(skill).toBeNull();
  });

  it('filters internal skills by default', async () => {
    const skillPath = join(tmpDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: internal-skill
description: Hidden from public
metadata:
  internal: true
---
body`
    );

    const skill = await parseSkillMd(skillPath);
    expect(skill).toBeNull();
  });

  it('includes internal skills when includeInternal is true', async () => {
    const skillPath = join(tmpDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: internal-skill
description: Hidden from public
metadata:
  internal: true
---
body`
    );

    const skill = await parseSkillMd(skillPath, { includeInternal: true });
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('internal-skill');
  });
});
