/**
 * Filesystem-based discovery tests ported from the skills repo.
 *
 * Covers the --full-depth option and bounded depth-2 discovery inside
 * skill container directories (e.g. `skills/<category>/<skill>/SKILL.md`).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { discoverSkills } from '../src/skills.ts';

function writeSkill(dir: string, name: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} description\n---\n\n# ${name}\n`
  );
}

describe('discoverSkills with fullDepth option', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skills-full-depth-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should only return root skill when fullDepth is false', async () => {
    writeSkill(testDir, 'root-skill');
    writeSkill(join(testDir, 'skills', 'nested-skill'), 'nested-skill');

    const skills = await discoverSkills(testDir, undefined, { fullDepth: false });

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('root-skill');
  });

  it('should return all skills when fullDepth is true', async () => {
    writeSkill(testDir, 'root-skill');
    writeSkill(join(testDir, 'skills', 'nested-skill-1'), 'nested-skill-1');
    writeSkill(join(testDir, 'skills', 'nested-skill-2'), 'nested-skill-2');

    const skills = await discoverSkills(testDir, undefined, { fullDepth: true });

    expect(skills).toHaveLength(3);
    expect(skills.map((s) => s.name).sort()).toEqual([
      'nested-skill-1',
      'nested-skill-2',
      'root-skill',
    ]);
  });

  it('should default to early return when no option is provided', async () => {
    writeSkill(testDir, 'root-skill');
    writeSkill(join(testDir, 'skills', 'nested-skill'), 'nested-skill');

    // No options passed - should default to early return
    const skills = await discoverSkills(testDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('root-skill');
  });

  it('should still find all skills when no root SKILL.md exists (regardless of fullDepth)', async () => {
    writeSkill(join(testDir, 'skills', 'skill-1'), 'skill-1');
    writeSkill(join(testDir, 'skills', 'skill-2'), 'skill-2');

    const skillsDefault = await discoverSkills(testDir);
    expect(skillsDefault.map((s) => s.name).sort()).toEqual(['skill-1', 'skill-2']);

    const skillsFullDepth = await discoverSkills(testDir, undefined, { fullDepth: true });
    expect(skillsFullDepth.map((s) => s.name).sort()).toEqual(['skill-1', 'skill-2']);
  });

  it('should not duplicate skills when root and nested have the same name', async () => {
    writeSkill(testDir, 'my-skill');
    writeSkill(join(testDir, 'skills', 'my-skill'), 'my-skill');

    const skills = await discoverSkills(testDir, undefined, { fullDepth: true });

    // Deduplicated by name
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');
  });
});

describe('discoverSkills — bounded depth-2 inside skill container dirs', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skills-nested-disk-${Date.now()}-${Math.random()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('discovers nested skills under skills/<category>/<skill>/SKILL.md', async () => {
    writeSkill(join(testDir, 'skills', 'product-a', 'skill-one'), 'skill-one');
    writeSkill(join(testDir, 'skills', 'product-a', 'skill-two'), 'skill-two');
    writeSkill(join(testDir, 'skills', 'product-b', 'skill-three'), 'skill-three');

    const skills = await discoverSkills(testDir);

    expect(skills.map((s) => s.name).sort()).toEqual(['skill-one', 'skill-three', 'skill-two']);
  });

  it('discovers mixed flat and nested skills in the same container', async () => {
    writeSkill(join(testDir, 'skills', 'flat-skill'), 'flat-skill');
    writeSkill(join(testDir, 'skills', 'category', 'nested-skill'), 'nested-skill');

    const skills = await discoverSkills(testDir);

    expect(skills.map((s) => s.name).sort()).toEqual(['flat-skill', 'nested-skill']);
  });

  it('does not descend past a SKILL.md found at depth 1', async () => {
    writeSkill(join(testDir, 'skills', 'foo'), 'outer-skill');
    writeSkill(join(testDir, 'skills', 'foo', 'inner'), 'inner-skill');

    const skills = await discoverSkills(testDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('outer-skill');
  });

  it('skips ignored directory names during depth-2 descent', async () => {
    writeSkill(join(testDir, 'skills', 'node_modules', 'inner', 'pkg-skill'), 'pkg-skill');
    writeSkill(join(testDir, 'skills', 'real-category', 'real-skill'), 'real-skill');

    const skills = await discoverSkills(testDir);

    expect(skills.map((s) => s.name).sort()).toEqual(['real-skill']);
  });

  it('discovers nested skills under agent-specific container dirs', async () => {
    writeSkill(join(testDir, '.agents', 'skills', 'category', 'agent-skill'), 'agent-skill');

    const skills = await discoverSkills(testDir);

    expect(skills.map((s) => s.name)).toEqual(['agent-skill']);
  });

  it('does not perform depth-2 descent from the repo root', async () => {
    // `examples/<category>/<skill>/SKILL.md` must stay invisible without --full-depth.
    writeSkill(join(testDir, 'examples', 'category', 'example-skill'), 'example-skill');
    writeSkill(join(testDir, 'skills', 'real-skill'), 'real-skill');

    const skills = await discoverSkills(testDir);

    expect(skills.map((s) => s.name)).toEqual(['real-skill']);
  });

  it('still requires --full-depth for skills deeper than two levels in a container', async () => {
    writeSkill(join(testDir, 'skills', 'level-1', 'level-2', 'deep-skill'), 'deep-skill');
    writeSkill(join(testDir, 'skills', 'shallow'), 'shallow-skill');

    const defaultSkills = await discoverSkills(testDir);
    expect(defaultSkills.map((s) => s.name).sort()).toEqual(['shallow-skill']);

    const fullSkills = await discoverSkills(testDir, undefined, { fullDepth: true });
    expect(fullSkills.map((s) => s.name).sort()).toEqual(['deep-skill', 'shallow-skill']);
  });

  it('still short-circuits when a root SKILL.md exists (no fullDepth)', async () => {
    writeSkill(testDir, 'root-skill');
    writeSkill(join(testDir, 'skills', 'category', 'nested'), 'nested-skill');

    const skills = await discoverSkills(testDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('root-skill');
  });
});
