import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldExclude, formatBytes } from '../pack.ts';
import { existsSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// ============================================================
// Pure function tests
// ============================================================
describe('shouldExclude', () => {
  it('excludes node_modules directory at any level', () => {
    expect(shouldExclude('node_modules')).toBe(true);
    expect(shouldExclude('path/to/node_modules/package')).toBe(true);
    expect(shouldExclude('node_modules/pkg/index.js')).toBe(true);
  });

  it('excludes .git directory', () => {
    expect(shouldExclude('.git')).toBe(true);
    expect(shouldExclude('.git/objects/abc')).toBe(true);
  });

  it('excludes dist directory', () => {
    expect(shouldExclude('dist/bundle.js')).toBe(true);
  });

  it('excludes build directory', () => {
    expect(shouldExclude('build/output.js')).toBe(true);
  });

  it('excludes __pycache__ directory', () => {
    expect(shouldExclude('__pycache__/module.pyc')).toBe(true);
  });

  it('excludes evals directory', () => {
    expect(shouldExclude('evals/test.ts')).toBe(true);
  });

  it('excludes .DS_Store files', () => {
    expect(shouldExclude('.DS_Store')).toBe(true);
    expect(shouldExclude('subdir/.DS_Store')).toBe(true);
  });

  it('excludes Thumbs.db files', () => {
    expect(shouldExclude('Thumbs.db')).toBe(true);
  });

  it('excludes *.pyc files', () => {
    expect(shouldExclude('module.pyc')).toBe(true);
  });

  it('excludes *.pyo files', () => {
    expect(shouldExclude('module.pyo')).toBe(true);
  });

  it('excludes .env files', () => {
    expect(shouldExclude('.env')).toBe(true);
  });

  it('excludes .env.local files', () => {
    expect(shouldExclude('.env.local')).toBe(true);
  });

  it('does not exclude regular files', () => {
    expect(shouldExclude('SKILL.md')).toBe(false);
    expect(shouldExclude('src/index.ts')).toBe(false);
    expect(shouldExclude('README.md')).toBe(false);
  });

  it('does not exclude regular directories', () => {
    expect(shouldExclude('src')).toBe(false);
    expect(shouldExclude('skills/my-skill')).toBe(false);
  });

  it('handles Windows-style path separators', () => {
    expect(shouldExclude('node_modules\\pkg\\index.js')).toBe(true);
    expect(shouldExclude('src\\index.ts')).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats bytes less than 1024', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048575)).toBe('1024.0 KB');
  });

  it('formats MB', () => {
    expect(formatBytes(1048576)).toBe('1.00 MB');
    expect(formatBytes(5242880)).toBe('5.00 MB');
  });
});

// ============================================================
// Integration test for packSkill
// ============================================================
describe('packSkill', () => {
  let tmpDir: string;
  let skillDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `skill-packer-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
    skillDir = join(tmpDir, 'test-skill');
    mkdirSync(skillDir, { recursive: true });

    // Create a minimal valid skill
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---
name: test-skill
description: A test skill for unit testing
---
# Test Skill

This is a test skill.`
    );

    // Add some extra files
    writeFileSync(join(skillDir, 'README.md'), '# Test Skill');
    writeFileSync(join(skillDir, 'index.ts'), 'export {}');
    mkdirSync(join(skillDir, 'src'));
    writeFileSync(join(skillDir, 'src', 'helper.ts'), 'export const x = 1;');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('packs a valid skill directory', async () => {
    const { packSkill } = await import('../pack.ts');
    const result = await packSkill({
      skillPath: skillDir,
      outputPath: tmpDir,
    });

    expect(result.skillName).toBe('test-skill');
    expect(result.outputPath).toBe(join(tmpDir, 'test-skill.skill'));
    expect(result.filesIncluded).toBeGreaterThanOrEqual(4); // SKILL.md, README.md, index.ts, src/helper.ts
    expect(existsSync(result.outputPath)).toBe(true);
  });

  it('skips excluded files and directories', async () => {
    // Add some excluded content
    mkdirSync(join(skillDir, 'node_modules'));
    writeFileSync(join(skillDir, 'node_modules', 'dep.js'), '');
    writeFileSync(join(skillDir, '.DS_Store'), '');
    mkdirSync(join(skillDir, '.git'));
    writeFileSync(join(skillDir, '.git', 'HEAD'), '');

    const { packSkill } = await import('../pack.ts');
    const result = await packSkill({
      skillPath: skillDir,
      outputPath: tmpDir,
    });

    expect(result.filesExcluded.length).toBeGreaterThanOrEqual(3);
    expect(result.filesExcluded).toContain('node_modules');
    expect(result.filesExcluded).toContain('.DS_Store');
    expect(result.filesExcluded).toContain('.git');
  });

  it('fails when output file exists and force is false', async () => {
    // Pre-create the output file
    writeFileSync(join(tmpDir, 'test-skill.skill'), 'existing');

    const { packSkill } = await import('../pack.ts');
    await expect(
      packSkill({
        skillPath: skillDir,
        outputPath: tmpDir,
        force: false,
      })
    ).rejects.toThrow('File already exists');
  });

  it('returns skipped result when onConflict is skip', async () => {
    // Pre-create the output file
    writeFileSync(join(tmpDir, 'test-skill.skill'), 'existing');

    const { packSkill } = await import('../pack.ts');
    const result = await packSkill({
      skillPath: skillDir,
      outputPath: tmpDir,
      force: false,
      onConflict: 'skip',
    });

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain('File already exists');
    expect(result.outputPath).toBe(join(tmpDir, 'test-skill.skill'));
    expect(result.skillName).toBe('test-skill');
    expect(result.filesIncluded).toBe(0);
    expect(result.filesExcluded).toEqual([]);
    expect(result.size).toBe(0);
  });

  it('overwrites when force is true', async () => {
    writeFileSync(join(tmpDir, 'test-skill.skill'), 'existing');

    const { packSkill } = await import('../pack.ts');
    const result = await packSkill({
      skillPath: skillDir,
      outputPath: tmpDir,
      force: true,
    });

    expect(existsSync(result.outputPath)).toBe(true);
  });

  it('fails validation for invalid skill', async () => {
    // Create invalid skill without SKILL.md
    const invalidDir = join(tmpDir, 'invalid-skill');
    mkdirSync(invalidDir, { recursive: true });

    const { packSkill } = await import('../pack.ts');
    await expect(
      packSkill({
        skillPath: invalidDir,
        outputPath: tmpDir,
      })
    ).rejects.toThrow('Validation failed');
  });

  it('skips validation when validate=false', async () => {
    const invalidDir = join(tmpDir, 'no-validate-skill');
    mkdirSync(invalidDir, { recursive: true });
    writeFileSync(join(invalidDir, 'README.md'), '# Just a dir');

    const { packSkill } = await import('../pack.ts');
    const result = await packSkill({
      skillPath: invalidDir,
      outputPath: tmpDir,
      validate: false,
    });

    expect(result.skillName).toBe('no-validate-skill');
    expect(existsSync(result.outputPath)).toBe(true);
  });

  describe('symlink handling', () => {
    it('drops all symlinks by default (no symlinks option)', async () => {
      const externalDir = join(tmpDir, 'external');
      mkdirSync(externalDir, { recursive: true });
      writeFileSync(join(externalDir, 'outside.md'), '# Outside');

      // Internal symlink
      symlinkSync(join(skillDir, 'src', 'helper.ts'), join(skillDir, 'internal-link.ts'));
      // External symlink
      symlinkSync(join(externalDir, 'outside.md'), join(skillDir, 'external-link.md'));

      const { packSkill } = await import('../pack.ts');
      const result = await packSkill({
        skillPath: skillDir,
        outputPath: tmpDir,
      });

      // Both symlinks should be excluded
      expect(result.filesExcluded).toContain('internal-link.ts');
      expect(result.filesExcluded).toContain('external-link.md');
      // Neither should be included
      expect(result.filesIncluded).toBe(4); // original 4 files only
    });

    it('resolves internal symlinks when symlinks=internal', async () => {
      // Create symlink inside skill dir pointing to another skill file
      symlinkSync(join(skillDir, 'README.md'), join(skillDir, 'readme-link.md'));

      const { packSkill } = await import('../pack.ts');
      const result = await packSkill({
        skillPath: skillDir,
        outputPath: tmpDir,
        symlinks: 'internal',
      });

      expect(result.filesIncluded).toBeGreaterThanOrEqual(5); // 4 original + symlink
      expect(result.filesExcluded).not.toContain('readme-link.md');
    });

    it('resolves internal symlink to a directory when symlinks=internal', async () => {
      const subDir = join(skillDir, 'sub');
      mkdirSync(subDir, { recursive: true });
      writeFileSync(join(subDir, 'nested.md'), '# nested');

      symlinkSync(subDir, join(skillDir, 'sub-link'));

      const { packSkill } = await import('../pack.ts');
      const result = await packSkill({
        skillPath: skillDir,
        outputPath: tmpDir,
        symlinks: 'internal',
      });

      // The symlink was followed and the nested file included
      expect(result.filesExcluded).not.toContain('sub-link');
      expect(result.filesIncluded).toBeGreaterThanOrEqual(6); // 4 original + sub/nested.md + symlink dir entry
    });

    it('rejects external symlinks when symlinks=internal', async () => {
      const externalDir = join(tmpDir, 'external');
      mkdirSync(externalDir, { recursive: true });
      writeFileSync(join(externalDir, 'outside.md'), '# Outside');

      symlinkSync(join(externalDir, 'outside.md'), join(skillDir, 'external-link.md'));

      const { packSkill } = await import('../pack.ts');
      await expect(
        packSkill({
          skillPath: skillDir,
          outputPath: tmpDir,
          symlinks: 'internal',
        })
      ).rejects.toThrow('points outside skill directory');
    });

    it('follows external symlinks with warning when symlinks=all', async () => {
      const externalDir = join(tmpDir, 'external');
      mkdirSync(externalDir, { recursive: true });
      writeFileSync(join(externalDir, 'outside.md'), '# Outside');

      symlinkSync(join(externalDir, 'outside.md'), join(skillDir, 'external-link.md'));

      const { packSkill } = await import('../pack.ts');
      const result = await packSkill({
        skillPath: skillDir,
        outputPath: tmpDir,
        symlinks: 'all',
      });

      expect(result.filesIncluded).toBeGreaterThanOrEqual(5);
      expect(result.filesExcluded).not.toContain('external-link.md');
    });

    it('rejects when total size exceeds maxSize via symlink resolution (symlinks=all)', async () => {
      const externalDir = join(tmpDir, 'external');
      mkdirSync(externalDir, { recursive: true });
      writeFileSync(join(externalDir, 'outside.md'), '# This is some external content that adds up');

      symlinkSync(join(externalDir, 'outside.md'), join(skillDir, 'ext-link.md'));

      const { packSkill } = await import('../pack.ts');
      await expect(
        packSkill({
          skillPath: skillDir,
          outputPath: tmpDir,
          symlinks: 'all',
          maxSkillSize: 50, // very small limit — symlink target alone pushes it over
        })
      ).rejects.toThrow('exceeds maximum skill size');
    });

    it('rejects when total uncompressed size exceeds maxSize', async () => {
      const { packSkill } = await import('../pack.ts');
      await expect(
        packSkill({
          skillPath: skillDir,
          outputPath: tmpDir,
          maxSkillSize: 10, // impossibly small
        })
      ).rejects.toThrow('exceeds maximum skill size');
    });

    it('detects symlink loops and rejects', async () => {
      // Create a -> b -> a loop
      symlinkSync(join(skillDir, 'loop-b'), join(skillDir, 'loop-a'));
      symlinkSync(join(skillDir, 'loop-a'), join(skillDir, 'loop-b'));

      const { packSkill } = await import('../pack.ts');
      await expect(
        packSkill({
          skillPath: skillDir,
          outputPath: tmpDir,
          symlinks: 'internal',
        })
      ).rejects.toThrow('loop');
    }, 10000);

    it('rejects broken symlinks', async () => {
      symlinkSync(join(skillDir, 'nonexistent-file'), join(skillDir, 'broken-link'));

      const { packSkill } = await import('../pack.ts');
      await expect(
        packSkill({
          skillPath: skillDir,
          outputPath: tmpDir,
          symlinks: 'internal',
        })
      ).rejects.toThrow();
    }, 10000);
  });
});
