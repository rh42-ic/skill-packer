/**
 * Tests for plugin manifest handling: getPluginSkillPaths, getPluginGroupings,
 * and discovery of skills declared in marketplace.json / plugin.json manifests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { getPluginSkillPaths, getPluginGroupings } from '../src/plugin-manifest.ts';
import { discoverSkills } from '../src/skills.ts';

describe('getPluginSkillPaths', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `plugin-paths-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeManifest(name: 'marketplace.json' | 'plugin.json', content: unknown) {
    mkdirSync(join(testDir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(testDir, '.claude-plugin', name), JSON.stringify(content));
  }

  it('returns declared skill dirs and conventional skills dir for marketplace plugins', async () => {
    writeManifest('marketplace.json', {
      plugins: [
        {
          name: 'test-plugin',
          source: './plugins/test-plugin',
          skills: ['./skills/alpha/skill-a', './skills/beta/skill-b'],
        },
      ],
    });

    const paths = await getPluginSkillPaths(testDir);

    // Declared skill paths become search dirs (their parents are walked by discovery)
    expect(paths).toContain(join(testDir, 'plugins/test-plugin/skills/alpha'));
    expect(paths).toContain(join(testDir, 'plugins/test-plugin/skills/beta'));
    // Conventional skills dir is always included
    expect(paths).toContain(join(testDir, 'plugins/test-plugin/skills'));
  });

  it('respects metadata.pluginRoot', async () => {
    writeManifest('marketplace.json', {
      metadata: { pluginRoot: './plugins' },
      plugins: [{ name: 'my-plugin', source: './my-plugin', skills: ['./skills/my-skill'] }],
    });

    const paths = await getPluginSkillPaths(testDir);

    // Skill search dirs resolve relative to pluginRoot
    expect(paths).toContain(join(testDir, 'plugins/my-plugin/skills'));
  });

  it('returns conventional skills dir from plugin.json', async () => {
    writeManifest('plugin.json', {
      name: 'single-plugin',
      skills: ['./custom/dir'],
    });

    const paths = await getPluginSkillPaths(testDir);

    expect(paths).toContain(join(testDir, 'skills'));
    expect(paths).toContain(join(testDir, 'custom'));
  });

  it('skips remote source objects', async () => {
    writeManifest('marketplace.json', {
      plugins: [{ name: 'remote', source: { source: 'github', repo: 'owner/repo' }, skills: ['./skills/x'] }],
    });

    const paths = await getPluginSkillPaths(testDir);

    expect(paths).toEqual([]);
  });

  it('returns empty array when no manifests exist', async () => {
    const paths = await getPluginSkillPaths(testDir);
    expect(paths).toEqual([]);
  });

  it('returns empty array for invalid JSON', async () => {
    mkdirSync(join(testDir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(testDir, '.claude-plugin/marketplace.json'), 'not valid json');
    writeFileSync(join(testDir, '.claude-plugin/plugin.json'), 'not valid json either');

    const paths = await getPluginSkillPaths(testDir);
    expect(paths).toEqual([]);
  });

  it('rejects plugin sources and skill paths without ./ prefix', async () => {
    writeManifest('marketplace.json', {
      plugins: [
        { name: 'bare', source: 'bare-plugin', skills: ['./skills/x'] }, // invalid source
        { name: 'valid', source: './valid-plugin', skills: ['bare-skill-path'] }, // invalid skill path
      ],
    });

    const paths = await getPluginSkillPaths(testDir);

    expect(paths).toEqual([join(testDir, 'valid-plugin/skills')]);
  });

  it('rejects traversal paths that escape basePath', async () => {
    writeManifest('marketplace.json', {
      plugins: [
        { source: './ok', skills: ['../../../outside/skill'] },
        { source: './../escape', skills: ['./skills/x'] },
      ],
    });

    const paths = await getPluginSkillPaths(testDir);

    // The escaping plugin base and traversal skill dirs must not be included,
    // but the conventional skills dir for the in-bounds plugin remains.
    expect(paths).toEqual([join(testDir, 'ok/skills')]);
  });
});

describe('getPluginGroupings', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `plugin-grouping-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeManifest(name: 'marketplace.json' | 'plugin.json', content: unknown) {
    mkdirSync(join(testDir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(testDir, '.claude-plugin', name), JSON.stringify(content));
  }

  it('maps skill dirs to plugin names from marketplace.json', async () => {
    writeManifest('marketplace.json', {
      metadata: { pluginRoot: './plugins' },
      plugins: [
        { name: 'plugin-a', source: './plugin-a', skills: ['./skills/skill-1'] },
        { name: 'plugin-b', source: './plugin-b', skills: ['./skills/skill-2'] },
      ],
    });

    const groupings = await getPluginGroupings(testDir);

    expect(groupings.get(resolve(join(testDir, 'plugins/plugin-a/skills/skill-1')))).toBe('plugin-a');
    expect(groupings.get(resolve(join(testDir, 'plugins/plugin-b/skills/skill-2')))).toBe('plugin-b');
  });

  it('maps skill dirs to plugin names from plugin.json', async () => {
    writeManifest('plugin.json', {
      name: 'single-plugin',
      skills: ['./skills/only-skill'],
    });

    const groupings = await getPluginGroupings(testDir);

    expect(groupings.get(resolve(join(testDir, 'skills/only-skill')))).toBe('single-plugin');
  });

  it('skips remote source objects and plugins without names', async () => {
    writeManifest('marketplace.json', {
      plugins: [
        { source: './remote', skills: ['./skills/x'] }, // no name
        { name: 'remote-plugin', source: { source: 'github', repo: 'owner/repo' }, skills: ['./skills/y'] },
      ],
    });

    const groupings = await getPluginGroupings(testDir);
    expect(groupings.size).toBe(0);
  });

  it('returns empty map for missing or invalid manifests', async () => {
    expect((await getPluginGroupings(testDir)).size).toBe(0);

    mkdirSync(join(testDir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(testDir, '.claude-plugin/marketplace.json'), 'not valid json');
    expect((await getPluginGroupings(testDir)).size).toBe(0);
  });
});

describe('discoverSkills with plugin manifests', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skills-manifest-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeManifest(name: 'marketplace.json' | 'plugin.json', content: unknown) {
    mkdirSync(join(testDir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(testDir, '.claude-plugin', name), JSON.stringify(content));
  }

  function writeSkill(relDir: string, name: string) {
    mkdirSync(join(testDir, relDir), { recursive: true });
    writeFileSync(
      join(testDir, relDir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${name} description\n---\n\n# ${name}\n`
    );
  }

  it('should discover skills from marketplace.json', async () => {
    writeManifest('marketplace.json', {
      name: 'test-marketplace',
      owner: { name: 'Test' },
      plugins: [
        {
          name: 'test-plugin',
          source: './plugins/test-plugin',
          skills: ['./skills/test-skill'],
        },
      ],
    });
    writeSkill('plugins/test-plugin/skills/test-skill', 'manifest-skill');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('manifest-skill');
  });

  it('should respect metadata.pluginRoot', async () => {
    writeManifest('marketplace.json', {
      metadata: { pluginRoot: './plugins' },
      plugins: [{ name: 'my-plugin', source: './my-plugin', skills: ['./skills/my-skill'] }],
    });
    writeSkill('plugins/my-plugin/skills/my-skill', 'pluginroot-skill');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('pluginroot-skill');
  });

  it('should discover skills from plugin.json', async () => {
    writeManifest('plugin.json', {
      name: 'single-plugin',
      skills: ['./skills/single-skill'],
    });
    writeSkill('skills/single-skill', 'single-plugin-skill');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('single-plugin-skill');
  });

  it('should skip remote source objects', async () => {
    writeManifest('marketplace.json', {
      plugins: [
        {
          name: 'remote-plugin',
          source: { source: 'github', repo: 'owner/repo' },
          skills: ['./skills/remote-skill'],
        },
      ],
    });

    // The remote source must be ignored; nothing local is declared or present.
    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(0);
  });

  it('should handle missing manifest gracefully', async () => {
    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(0);
  });

  it('should handle invalid JSON gracefully', async () => {
    mkdirSync(join(testDir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(testDir, '.claude-plugin/marketplace.json'), 'not valid json');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(0);
  });

  it('should deduplicate skills found via manifest and priority dirs', async () => {
    writeManifest('plugin.json', { skills: ['./skills/dupe-skill'] });
    writeSkill('skills/dupe-skill', 'dupe-skill');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
  });

  it('should discover multiple skills from multiple plugins', async () => {
    writeManifest('marketplace.json', {
      plugins: [
        { name: 'plugin-a', source: './plugin-a', skills: ['./skills/skill-1', './skills/skill-2'] },
        { name: 'plugin-b', source: './plugin-b', skills: ['./skills/skill-3'] },
      ],
    });
    writeSkill('plugin-a/skills/skill-1', 'skill-1');
    writeSkill('plugin-a/skills/skill-2', 'skill-2');
    writeSkill('plugin-b/skills/skill-3', 'skill-3');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(3);
    expect(skills.map((s) => s.name).sort()).toEqual(['skill-1', 'skill-2', 'skill-3']);
  });

  it('should handle plugin without source (root-level plugin)', async () => {
    writeManifest('marketplace.json', {
      plugins: [{ name: 'root-plugin', skills: ['./skills/root-skill'] }],
    });
    writeSkill('skills/root-skill', 'root-skill');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('root-skill');
  });

  it('should discover skills from conventional skills/ when plugin.json has no skills array', async () => {
    writeManifest('plugin.json', {
      name: 'plugin-without-skills-field',
      description: 'A plugin that does not declare skills explicitly',
    });
    writeSkill('skills/undeclared-skill', 'undeclared-skill');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('undeclared-skill');
  });

  it('should discover skills from conventional skills/ when plugin.json has empty skills array', async () => {
    writeManifest('plugin.json', { name: 'plugin-with-empty-skills', skills: [] });
    writeSkill('skills/empty-array-skill', 'empty-array-skill');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('empty-array-skill');
  });

  it('should discover skills from marketplace plugin without skills array', async () => {
    writeManifest('marketplace.json', {
      plugins: [{ name: 'plugin-no-skills-field', source: './my-plugin' }],
    });
    writeSkill('my-plugin/skills/auto-discovered', 'auto-discovered');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('auto-discovered');
  });

  it('should discover both explicit and conventional skills from same plugin', async () => {
    writeManifest('marketplace.json', {
      plugins: [{ name: 'mixed-plugin', source: './mixed', skills: ['./custom-skills/explicit-skill'] }],
    });
    writeSkill('mixed/custom-skills/explicit-skill', 'explicit-skill');
    writeSkill('mixed/skills/conventional-skill', 'conventional-skill');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(['conventional-skill', 'explicit-skill']);
  });

  it('should assign pluginName from plugin groupings', async () => {
    writeManifest('marketplace.json', {
      metadata: { pluginRoot: './plugins' },
      plugins: [{ name: 'grouped-plugin', source: './grouped-plugin', skills: ['./skills/grouped-skill'] }],
    });
    writeSkill('plugins/grouped-plugin/skills/grouped-skill', 'grouped-skill');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].pluginName).toBe('grouped-plugin');
  });

  it('should reject paths that traverse outside basePath', async () => {
    writeManifest('marketplace.json', {
      plugins: [
        { source: '../../../etc', skills: ['./passwd'] },
        { source: 'legit', skills: ['../../../outside/skill'] },
      ],
    });
    writeSkill('legit/skills/valid-skill', 'valid-skill');

    // A skill created outside testDir must NOT be discovered
    const outsideDir = join(testDir, '..', `outside-${Date.now()}`);
    mkdirSync(join(outsideDir, 'skill'), { recursive: true });
    writeFileSync(
      join(outsideDir, 'skill/SKILL.md'),
      `---
name: outside-skill
description: Should not be discovered
---
`
    );

    try {
      const skills = await discoverSkills(testDir);
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('valid-skill');
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('should reject absolute paths in manifests', async () => {
    writeManifest('plugin.json', { skills: ['/etc/passwd', '/tmp/malicious-skill'] });
    writeSkill('skills/safe-skill', 'safe-skill');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('safe-skill');
  });

  it('should reject paths without ./ prefix (per Claude Code convention)', async () => {
    writeManifest('marketplace.json', {
      metadata: { pluginRoot: 'custom-plugins' }, // Missing './' prefix - INVALID
      plugins: [{ source: './my-plugin', skills: ['./custom-skills/my-skill'] }],
    });
    writeSkill('custom-plugins/my-plugin/custom-skills/my-skill', 'unreachable-skill');
    writeSkill('skills/standard-skill', 'standard-skill');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('standard-skill');
  });

  it('should reject plugin sources without ./ prefix', async () => {
    writeManifest('marketplace.json', {
      plugins: [
        { source: 'bare-plugin', skills: ['./skills/skill1'] }, // Invalid - no './'
        { source: './valid-plugin', skills: ['./skills/skill2'] }, // Valid
      ],
    });
    writeSkill('bare-plugin/skills/skill1', 'bare-skill');
    writeSkill('valid-plugin/skills/skill2', 'valid-skill');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('valid-skill');
  });

  it('should reject skill paths without ./ prefix', async () => {
    writeManifest('plugin.json', {
      skills: ['invalid-loc/bare-skill', './valid-loc/valid-skill'],
    });
    writeSkill('invalid-loc/bare-skill', 'bare-skill');
    writeSkill('valid-loc/valid-skill', 'valid-skill');
    writeSkill('skills/standard', 'standard-skill');

    const skills = await discoverSkills(testDir);
    expect(skills.map((s) => s.name).sort()).toEqual(['standard-skill', 'valid-skill']);
  });
});
