import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the heavy dependencies
vi.mock('../pack.ts', () => ({
  packSkill: vi.fn(),
}));

vi.mock('../list.ts', () => ({
  listSkills: vi.fn(),
}));

vi.mock('../validate.ts', () => ({
  validateSkillPath: vi.fn(),
}));

vi.mock('../skills.ts', () => ({
  discoverSkills: vi.fn(),
}));

vi.mock('../git.ts', () => ({
  cloneRepo: vi.fn(),
  cleanupTempDir: vi.fn(),
}));

vi.mock('../source-parser.ts', () => ({
  parseSource: vi.fn(),
}));

import { packSkill } from '../pack.ts';
import { listSkills } from '../list.ts';
import { validateSkillPath } from '../validate.ts';
import { discoverSkills } from '../skills.ts';
import { cloneRepo } from '../git.ts';
import { parseSource } from '../source-parser.ts';
import { runPack, runList, runCheck, main } from '../cli.ts';

const mockPackSkill = vi.mocked(packSkill);
const mockListSkills = vi.mocked(listSkills);
const mockValidateSkillPath = vi.mocked(validateSkillPath);
const mockDiscoverSkills = vi.mocked(discoverSkills);
const mockParseSource = vi.mocked(parseSource);
const mockCloneRepo = vi.mocked(cloneRepo);

// Helper to capture exit
function mockProcessExit(expectedCode?: number) {
  return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    if (expectedCode !== undefined && code !== expectedCode) {
      throw new Error(`Expected exit code ${expectedCode}, got ${code}`);
    }
    throw { __exit: code ?? 0 };
  }) as any);
}

async function assertExits(fn: () => Promise<void>, expectedCode: number): Promise<void> {
  const spy = mockProcessExit(expectedCode);
  try {
    await fn();
  } catch (e: any) {
    if (e && typeof e === 'object' && '__exit' in e) {
      spy.mockRestore();
      return;
    }
  }
  spy.mockRestore();
}

describe('CLI', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Suppress vitest's default process.exit error
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('main()', () => {
    it('shows banner when no arguments', async () => {
      const oldArgv = process.argv;
      process.argv = ['node', 'skill-packer'];
      const logSpy = vi.spyOn(console, 'log');

      await main();

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Pack skills into .skill files');

      process.argv = oldArgv;
    });

    it('shows help for --help', async () => {
      const oldArgv = process.argv;
      process.argv = ['node', 'skill-packer', '--help'];
      const logSpy = vi.spyOn(console, 'log');

      await main();

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Usage:');
      expect(output).toContain('skill-packer <command>');

      process.argv = oldArgv;
    });

    it('shows help for -h', async () => {
      const oldArgv = process.argv;
      process.argv = ['node', 'skill-packer', '-h'];
      const logSpy = vi.spyOn(console, 'log');

      await main();

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Usage:');

      process.argv = oldArgv;
    });

    it('shows version for --version', async () => {
      const oldArgv = process.argv;
      process.argv = ['node', 'skill-packer', '--version'];
      const logSpy = vi.spyOn(console, 'log');

      await main();

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toMatch(/\d+\.\d+\.\d+/);

      process.argv = oldArgv;
    });

    it('exits with error for unknown command', async () => {
      const oldArgv = process.argv;
      process.argv = ['node', 'skill-packer', 'unknown-cmd'];

      await assertExits(() => main(), 1);

      process.argv = oldArgv;
    });
  });

  describe('runCheck', () => {
    it('validates a skill path', async () => {
      mockValidateSkillPath.mockResolvedValue({ valid: true, errors: [], warnings: [] });

      const logSpy = vi.spyOn(console, 'log');
      await runCheck(['/path/to/skill']);

      expect(mockValidateSkillPath).toHaveBeenCalledWith('/path/to/skill', { strict: false });
      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Skill is valid');
    });

    it('reports validation errors and exits 1', async () => {
      mockValidateSkillPath.mockResolvedValue({
        valid: false,
        errors: ['Missing name', 'Missing description'],
        warnings: [],
      });

      const logSpy = vi.spyOn(console, 'log');
      await assertExits(() => runCheck(['/path/to/skill']), 1);

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Validation failed');
    });

    it('exits when missing path', async () => {
      await assertExits(() => runCheck([]), 1);
    });

    it('handles "validate" alias via main()', async () => {
      mockValidateSkillPath.mockResolvedValue({ valid: true, errors: [], warnings: [] });

      const oldArgv = process.argv;
      process.argv = ['node', 'skill-packer', 'validate', '/path/to/skill'];

      await main();

      expect(mockValidateSkillPath).toHaveBeenCalledWith('/path/to/skill', { strict: false });

      process.argv = oldArgv;
    });
  });

  describe('runList', () => {
    it('calls listSkills with parsed options', async () => {
      mockListSkills.mockResolvedValue([]);

      await runList(['./skills', '--json', '--verbose']);

      expect(mockListSkills).toHaveBeenCalledWith({
        source: './skills',
        json: true,
        verbose: true,
        fullDepth: false,
      });
    });

    it('passes --full-depth flag', async () => {
      mockListSkills.mockResolvedValue([]);

      await runList(['--full-depth']);

      expect(mockListSkills).toHaveBeenCalledWith(
        expect.objectContaining({ fullDepth: true })
      );
    });

    it('handles "ls" alias via main()', async () => {
      mockListSkills.mockResolvedValue([]);

      const oldArgv = process.argv;
      process.argv = ['node', 'skill-packer', 'ls'];

      await main();

      expect(mockListSkills).toHaveBeenCalled();

      process.argv = oldArgv;
    });
  });

  describe('runPack', () => {
    it('packs a local skill', async () => {
      mockParseSource.mockReturnValue({
        type: 'local',
        url: '/resolved/path',
        localPath: '/resolved/path',
      });
      mockPackSkill.mockResolvedValue({
        outputPath: '/output/test-skill.skill',
        skillName: 'test-skill',
        filesIncluded: 5,
        filesExcluded: [],
        size: 1024,
      });

      await runPack(['./my-skill']);

      expect(mockPackSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          skillPath: '/resolved/path',
        })
      );
    });

    it('passes --output, --force, --verbose, --no-validate', async () => {
      mockParseSource.mockReturnValue({
        type: 'local',
        url: '/resolved/path',
        localPath: '/resolved/path',
      });
      mockPackSkill.mockResolvedValue({
        outputPath: '/custom/output.skill',
        skillName: 'output',
        filesIncluded: 3,
        filesExcluded: [],
        size: 512,
      });

      await runPack(['./my-skill', '--output', '/custom', '--force', '--verbose', '--no-validate']);

      expect(mockPackSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          skillPath: '/resolved/path',
          outputPath: '/custom',
          force: true,
          verbose: true,
          validate: false,
        })
      );
    });

    it('exits when missing source', async () => {
      await assertExits(() => runPack([]), 1);
    });

    it('exits when --output missing value', async () => {
      await assertExits(() => runPack(['./skill', '--output']), 1);
    });

    it('exits when --skill missing value', async () => {
      await assertExits(() => runPack(['./skill', '--skill']), 1);
    });

    it('resolves --skill filter and packs matched skill', async () => {
      mockParseSource.mockReturnValue({
        type: 'github',
        url: 'https://github.com/user/repo.git',
      });
      mockCloneRepo.mockResolvedValue('/tmp/cloned-repo');
      mockDiscoverSkills.mockResolvedValue([
        { name: 'skill-a', description: 'A', path: '/tmp/repo/skills/skill-a' },
        { name: 'skill-b', description: 'B', path: '/tmp/repo/skills/skill-b' },
      ]);
      mockPackSkill.mockResolvedValue({
        outputPath: '/output/skill-a.skill',
        skillName: 'skill-a',
        filesIncluded: 3,
        filesExcluded: [],
        size: 512,
      });

      await runPack(['user/repo', '--skill', 'skill-a']);

      expect(mockDiscoverSkills).toHaveBeenCalled();
      expect(mockPackSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          skillPath: '/tmp/repo/skills/skill-a',
        })
      );
    });

    it('exits when --skill does not match any skill', async () => {
      mockParseSource.mockReturnValue({
        type: 'github',
        url: 'https://github.com/user/repo.git',
      });
      mockCloneRepo.mockResolvedValue('/tmp/cloned-repo');
      mockDiscoverSkills.mockResolvedValue([
        { name: 'skill-a', description: 'A', path: '/tmp/repo/skills/skill-a' },
      ]);

      await assertExits(() => runPack(['user/repo', '--skill', 'nonexistent']), 1);
    });

    it('exits when no skills found in repo', async () => {
      mockParseSource.mockReturnValue({
        type: 'github',
        url: 'https://github.com/user/repo.git',
      });
      mockCloneRepo.mockResolvedValue('/tmp/cloned-repo');
      mockDiscoverSkills.mockResolvedValue([]);

      await assertExits(() => runPack(['user/repo', '--skill', 'any']), 1);
    });
  });
});
