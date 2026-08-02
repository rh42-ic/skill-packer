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
  discoverSkills,
  filterSkills,
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

// ============================================================
// filterSkills tests
// ============================================================
function makeSkill(name: string, path: string = '/tmp/skill'): Skill {
  return { name, description: 'desc', path };
}

const filterSkillsFixture: Skill[] = [
  makeSkill('convex-best-practices'),
  makeSkill('Convex Best Practices'),
  makeSkill('simple-skill'),
  makeSkill('foo'),
  makeSkill('bar'),
];

describe('filterSkills', () => {
  describe('direct matching', () => {
    it('matches exact name', () => {
      const result = filterSkills(filterSkillsFixture, ['foo']);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('foo');
    });

    it('matches case insensitive', () => {
      const result = filterSkills(filterSkillsFixture, ['FOO']);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('foo');
    });

    it('matches kebab-case skill name', () => {
      const result = filterSkills(filterSkillsFixture, ['convex-best-practices']);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('convex-best-practices');
    });

    it('matches multiple skills', () => {
      const result = filterSkills(filterSkillsFixture, ['foo', 'bar']);
      expect(result.length).toBe(2);
      const names = result.map((s) => s.name).sort();
      expect(names).toEqual(['bar', 'foo']);
    });
  });

  describe('quoted multi-word names', () => {
    it('matches quoted multi-word name', () => {
      // Simulates: --skill "Convex Best Practices"
      const result = filterSkills(filterSkillsFixture, ['Convex Best Practices']);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Convex Best Practices');
    });

    it('matches quoted multi-word name case insensitive', () => {
      const result = filterSkills(filterSkillsFixture, ['convex best practices']);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Convex Best Practices');
    });
  });

  describe('unquoted multi-word names (should not match)', () => {
    it('does not match unquoted multi-word args', () => {
      // Simulates: --skill Convex Best Practices (unquoted - shell splits into 3 args)
      // This should NOT match - users must quote multi-word names
      const result = filterSkills(filterSkillsFixture, ['Convex', 'Best', 'Practices']);
      expect(result.length).toBe(0);
    });

    it('does not match partial words', () => {
      const result = filterSkills(filterSkillsFixture, ['Convex', 'Best']);
      expect(result.length).toBe(0);
    });
  });

  describe('no matches', () => {
    it('returns empty array when no matches', () => {
      const result = filterSkills(filterSkillsFixture, ['nonexistent']);
      expect(result.length).toBe(0);
    });

    it('returns empty array for empty input', () => {
      const result = filterSkills(filterSkillsFixture, []);
      expect(result.length).toBe(0);
    });
  });
});

// ============================================================
// parseSkillMd warning behavior
// ============================================================
describe('parseSkillMd with non-string frontmatter values', () => {
  let testDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testDir = join(tmpdir(), `skills-nonstring-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    warnSpy.mockRestore();
  });

  it('rejects skill with numeric name', async () => {
    const skillPath = join(testDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: 123
description: A skill with numeric name
---

# Numeric Name Skill
`
    );
    const result = await parseSkillMd(skillPath);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('must be strings'));
  });

  it('rejects skill with boolean name', async () => {
    const skillPath = join(testDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: true
description: A skill with boolean name
---

# Boolean Name Skill
`
    );
    const result = await parseSkillMd(skillPath);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('must be strings'));
  });

  it('rejects skill with array name', async () => {
    const skillPath = join(testDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name:
  - foo
  - bar
description: A skill with array name
---

# Array Name Skill
`
    );
    const result = await parseSkillMd(skillPath);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('must be strings'));
  });

  it('rejects skill with numeric description', async () => {
    const skillPath = join(testDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: valid-name
description: 456
---

# Numeric Description Skill
`
    );
    const result = await parseSkillMd(skillPath);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('must be strings'));
  });

  it('accepts skill with valid string name and description', async () => {
    const skillPath = join(testDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: valid-skill
description: A valid skill
---

# Valid Skill
`
    );
    const result = await parseSkillMd(skillPath);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('valid-skill');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('parseSkillMd warnings on parse failures', () => {
  let testDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testDir = join(tmpdir(), `skills-warn-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    warnSpy.mockRestore();
  });

  it('warns when YAML frontmatter fails to parse', async () => {
    // A description containing ": " is parsed by the yaml package as a nested
    // compact mapping and throws a "Nested mappings are not allowed" error.
    const skillPath = join(testDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: my-skill
description: Configure the harness: Hooks, MCP Servers, Skills
---

# My Skill
`
    );
    const result = await parseSkillMd(skillPath);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(skillPath));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('YAML parse error'));
  });

  it('warns once when discovery skips a malformed skill', async () => {
    const skillDir = join(testDir, 'skills', 'broken-skill');
    const skillPath = join(skillDir, 'SKILL.md');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      skillPath,
      `---
name: broken-skill
description: Configure the harness: Hooks, MCP Servers, Skills
---
`
    );

    const result = await discoverSkills(testDir);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(skillPath));
  });

  it('strips terminal escapes from malformed-skill warnings', async () => {
    const skillDir = join(testDir, 'skills', 'broken-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---
name: broken-skill
description: Configure \x1b[31mthe harness: Hooks
---
`
    );

    await discoverSkills(testDir);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warning = String(warnSpy.mock.calls[0]?.[0]);
    expect(warning).toContain('Configure the harness: Hooks');
    expect(warning).not.toContain('\x1b');
  });

  it('warns when name is missing', async () => {
    const skillPath = join(testDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
description: A skill with no name
---

# No Name
`
    );
    const result = await parseSkillMd(skillPath);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing required'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('name'));
  });

  it('warns when description is missing', async () => {
    const skillPath = join(testDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: nameless
---

# No Description
`
    );
    const result = await parseSkillMd(skillPath);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing required'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('description'));
  });

  it('warns when SKILL.md cannot be read', async () => {
    const skillPath = join(testDir, 'does-not-exist', 'SKILL.md');
    const result = await parseSkillMd(skillPath);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failed to read file'));
  });

  it('warns when an internal skill is filtered by default', async () => {
    const skillPath = join(testDir, 'SKILL.md');
    writeFileSync(
      skillPath,
      `---
name: internal-skill
description: An internal skill
metadata:
  internal: true
---

# Internal Skill
`
    );
    const result = await parseSkillMd(skillPath);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('internal skill not enabled'));
  });
});
