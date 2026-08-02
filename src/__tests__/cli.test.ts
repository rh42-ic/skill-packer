import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the heavy dependencies
vi.mock('../pack.ts', () => ({
  packSkill: vi.fn(),
  formatBytes: vi.fn((bytes: number) => `${bytes} B`),
}));

vi.mock('../list.ts', () => ({
  listSkills: vi.fn(),
}));

vi.mock('../validate.ts', () => ({
  validateSkillPath: vi.fn(),
}));

vi.mock('../skills.ts', () => ({
  discoverSkills: vi.fn(),
  filterSkills: vi.fn(),
}));

vi.mock('../git.ts', () => ({
  cloneRepo: vi.fn(),
  cleanupTempDir: vi.fn(),
}));

vi.mock('../source-parser.ts', () => ({
  parseSource: vi.fn(),
  getOwnerRepo: vi.fn(() => null),
}));

vi.mock('readline', () => ({
  createInterface: vi.fn(),
}));

import { packSkill } from '../pack.ts';
import { listSkills } from '../list.ts';
import { validateSkillPath } from '../validate.ts';
import { discoverSkills, filterSkills } from '../skills.ts';
import { cloneRepo, cleanupTempDir } from '../git.ts';
import { parseSource } from '../source-parser.ts';
import * as readline from 'readline';
import { runPack, runList, runCheck, main } from '../cli.ts';

const mockPackSkill = vi.mocked(packSkill);
const mockListSkills = vi.mocked(listSkills);
const mockValidateSkillPath = vi.mocked(validateSkillPath);
const mockDiscoverSkills = vi.mocked(discoverSkills);
const mockFilterSkills = vi.mocked(filterSkills);
const mockParseSource = vi.mocked(parseSource);
const mockCloneRepo = vi.mocked(cloneRepo);
const mockCleanupTempDir = vi.mocked(cleanupTempDir);
const mockCreateInterface = vi.mocked(readline.createInterface);

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
    // Default filterSkills: case-insensitive name match
    mockFilterSkills.mockImplementation((skills: Array<{ name: string; description: string; path: string }>, names: string[]) => {
      const lowerNames = names.map(n => n.toLowerCase());
      return skills.filter(s => lowerNames.includes(s.name.toLowerCase()));
    });
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

    it.each(['--help', '-h'])('shows help for %s', async (flag) => {
      const oldArgv = process.argv;
      process.argv = ['node', 'skill-packer', flag];
      const logSpy = vi.spyOn(console, 'log');

      await main();

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Usage:');
      expect(output).toContain('skill-packer <command>');

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
      const errorSpy = vi.spyOn(console, 'error');
      await assertExits(() => runCheck(['/path/to/skill']), 1);

      const output = [...logSpy.mock.calls, ...errorSpy.mock.calls].map(c => c.join(' ')).join('\n');
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

      expect(mockListSkills).toHaveBeenCalledWith(
        expect.objectContaining({ source: undefined, json: false, verbose: false, fullDepth: false })
      );

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
      mockDiscoverSkills.mockResolvedValue([
        { name: 'test-skill', description: 'Test skill', path: '/resolved/path' },
      ]);
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
      mockDiscoverSkills.mockResolvedValue([
        { name: 'test-skill', description: 'Test skill', path: '/resolved/path' },
      ]);
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

    // --verbose should suppress the silent "Packed:" line for single skill
    it('suppresses silent-mode "Packed:" line when --verbose is set', async () => {
      mockParseSource.mockReturnValue({
        type: 'local',
        url: '/resolved/path',
        localPath: '/resolved/path',
      });
      mockDiscoverSkills.mockResolvedValue([
        { name: 'test-skill', description: 'Test skill', path: '/resolved/path' },
      ]);
      mockPackSkill.mockResolvedValue({
        outputPath: '/output/test-skill.skill',
        skillName: 'test-skill',
        filesIncluded: 5,
        filesExcluded: [],
        size: 1024,
      });

      const logSpy = vi.spyOn(console, 'log');
      await runPack(['./my-skill', '--verbose']);

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      // Verbose mode should not print the terse "Packed:" summary
      expect(output).not.toMatch(/✓ Packed:/);
    });
  });

  describe('--all batch mode', () => {
    beforeEach(() => {
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
        outputPath: '/output/test-skill.skill',
        skillName: 'test-skill',
        filesIncluded: 5,
        filesExcluded: [],
        size: 1024,
      });
    });

    it.each(['--all', '-a'])('batch-packs all skills with %s flag', async (flag) => {
      await runPack(['user/repo', flag]);

      expect(mockCloneRepo).toHaveBeenCalled();
      expect(mockDiscoverSkills).toHaveBeenCalledWith(
        '/tmp/cloned-repo', undefined, { fullDepth: true }
      );
      expect(mockPackSkill).toHaveBeenCalledTimes(2);
    });

    it('passes each skill.path as skillPath to packSkill', async () => {
      await runPack(['user/repo', '--all']);

      expect(mockPackSkill).toHaveBeenNthCalledWith(1, expect.objectContaining({
        skillPath: '/tmp/repo/skills/skill-a',
      }));
      expect(mockPackSkill).toHaveBeenNthCalledWith(2, expect.objectContaining({
        skillPath: '/tmp/repo/skills/skill-b',
      }));
    });

    it('prints per-file "Packed:" line in silent mode', async () => {
      mockPackSkill
        .mockResolvedValueOnce({
          outputPath: '/output/skill-a.skill',
          skillName: 'skill-a',
          filesIncluded: 3,
          filesExcluded: [],
          size: 512,
        })
        .mockResolvedValueOnce({
          outputPath: '/output/skill-b.skill',
          skillName: 'skill-b',
          filesIncluded: 7,
          filesExcluded: [],
          size: 2048,
        });

      const logSpy = vi.spyOn(console, 'log');
      await runPack(['user/repo', '--all']);

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Packed:');
      expect(output).toContain('/output/skill-a.skill');
      expect(output).toContain('/output/skill-b.skill');
    });

    it.each([
      { args: ['--output', '/custom'], expected: { outputPath: '/custom' } },
      { args: ['--force'], expected: { force: true } },
      { args: ['--no-validate'], expected: { validate: false } },
      { args: ['--strict'], expected: { strict: true } },
      { args: ['--force', '--no-validate'], expected: { force: true, validate: false } },
    ])('forwards $args to every packSkill call in --all mode', async ({ args, expected }) => {
      await runPack(['user/repo', '--all', ...args]);

      expect(mockPackSkill).toHaveBeenCalledTimes(2);
      expect(mockPackSkill).toHaveBeenNthCalledWith(1, expect.objectContaining(expected));
      expect(mockPackSkill).toHaveBeenNthCalledWith(2, expect.objectContaining(expected));
    });

    it('exits with code 1 when no skills are discovered', async () => {
      mockDiscoverSkills.mockResolvedValue([]);

      const logSpy = vi.spyOn(console, 'log');
      const errorSpy = vi.spyOn(console, 'error');
      await assertExits(() => runPack(['user/repo', '--all']), 1);

      const output = [...logSpy.mock.calls, ...errorSpy.mock.calls].map(c => c.join(' ')).join('\n');
      expect(output).toContain('No skills found');
    });

    it('continues packing remaining skills when one fails, prints summary, and exits 1', async () => {
      mockPackSkill
        .mockRejectedValueOnce(new Error('Validation failed'))
        .mockResolvedValueOnce({
          outputPath: '/output/skill-b.skill',
          skillName: 'skill-b',
          filesIncluded: 7,
          filesExcluded: [],
          size: 2048,
        });

      const logSpy = vi.spyOn(console, 'log');
      const errorSpy = vi.spyOn(console, 'error');
      await assertExits(() => runPack(['user/repo', '--all']), 1);

      // Both skills attempted (skip-and-continue, not fail-fast)
      expect(mockPackSkill).toHaveBeenCalledTimes(2);
      const output = [...logSpy.mock.calls, ...errorSpy.mock.calls].map(c => c.join(' ')).join('\n');
      const stripped = output.replace(/\x1B\[\d+m/g, '');
      // Failed skill noted inline, remaining skill still packed
      expect(stripped).toContain('Failed: skill-a');
      expect(stripped).toContain('Packed:');
      expect(stripped).toContain('/output/skill-b.skill');
      // Summary printed with counts
      expect(stripped).toContain('1 succeeded, 1 failed');
    });

    it('prints full-success summary and does not exit 1 when all skills pack', async () => {
      const logSpy = vi.spyOn(console, 'log');
      await runPack(['user/repo', '--all']);

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      const stripped = output.replace(/\x1B\[\d+m/g, '');
      expect(stripped).toContain('2 succeeded, 0 failed');
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('prints verbose banners and suppresses per-file output in verbose mode', async () => {
      const logSpy = vi.spyOn(console, 'log');
      await runPack(['user/repo', '--all', '--verbose']);

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Packing all skills');
      // Strip ANSI escape codes before matching (verbose output is colored)
      const stripped = output.replace(/\x1B\[\d+m/g, '');
      expect(stripped).toMatch(/Found 2 skills/);
      // Verbose mode omits the per-file "Packed:" line
      expect(output).not.toContain('Packed:');
    });

    it('skips --all path when --skill is also specified', async () => {
      await runPack(['user/repo', '--all', '--skill', 'skill-a']);

      // --skill path calls discoverSkills once (without fullDepth)
      expect(mockDiscoverSkills).toHaveBeenCalledTimes(1);
      expect(mockDiscoverSkills).not.toHaveBeenCalledWith(
        expect.anything(), undefined, { fullDepth: true }
      );
      // Only one packSkill call for the matched skill
      expect(mockPackSkill).toHaveBeenCalledTimes(1);
      expect(mockPackSkill).toHaveBeenCalledWith(expect.objectContaining({
        skillPath: '/tmp/repo/skills/skill-a',
      }));
    });

    it('works with local source in --all mode', async () => {
      mockParseSource.mockReturnValue({
        type: 'local',
        url: '/resolved/path',
        localPath: '/resolved/path',
      });
      mockDiscoverSkills.mockResolvedValue([
        { name: 'local-skill', description: 'Local', path: '/resolved/path/skills/local-skill' },
      ]);

      await runPack(['./skills-dir', '--all']);

      // No clone for local source
      expect(mockCloneRepo).not.toHaveBeenCalled();
      // discoverSkills called on the local path
      expect(mockDiscoverSkills).toHaveBeenCalledWith(
        '/resolved/path', undefined, { fullDepth: true }
      );
      expect(mockPackSkill).toHaveBeenCalledTimes(1);
      expect(mockPackSkill).toHaveBeenCalledWith(expect.objectContaining({
        skillPath: '/resolved/path/skills/local-skill',
      }));
    });
  });

  describe('interactive selection (no --skill / --all, remote source)', () => {
    beforeEach(() => {
      mockParseSource.mockReturnValue({
        type: 'github',
        url: 'https://github.com/user/repo.git',
      });
      mockCloneRepo.mockResolvedValue('/tmp/cloned-repo');
      mockPackSkill.mockResolvedValue({
        outputPath: '/output/test-skill.skill',
        skillName: 'test-skill',
        filesIncluded: 5,
        filesExcluded: [],
        size: 1024,
      });
    });

    it('auto-packs when a single skill is discovered', async () => {
      mockDiscoverSkills.mockResolvedValue([
        { name: 'only-skill', description: 'Only', path: '/tmp/repo/skills/only-skill' },
      ]);

      await runPack(['user/repo']);

      expect(mockDiscoverSkills).toHaveBeenCalledWith(
        '/tmp/cloned-repo', undefined, { fullDepth: true }
      );
      expect(mockPackSkill).toHaveBeenCalledTimes(1);
      expect(mockCreateInterface).not.toHaveBeenCalled();
      expect(mockPackSkill).toHaveBeenCalledWith(expect.objectContaining({
        skillPath: '/tmp/repo/skills/only-skill',
      }));
    });

    it('exits with error when no skills found', async () => {
      mockDiscoverSkills.mockResolvedValue([]);

      const logSpy = vi.spyOn(console, 'log');
      const errorSpy = vi.spyOn(console, 'error');
      await assertExits(() => runPack(['user/repo']), 1);

      expect([...logSpy.mock.calls, ...errorSpy.mock.calls].map(c => c.join(' ')).join('\n')).toContain('No skills found');
    });

    it('exits with error listing available skills in non-TTY with multiple skills', async () => {
      // Simulate non-TTY by removing isTTY
      const originalTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });

      mockDiscoverSkills.mockResolvedValue([
        { name: 'skill-a', description: 'A', path: '/tmp/a' },
        { name: 'skill-b', description: 'B', path: '/tmp/b' },
      ]);

      const logSpy = vi.spyOn(console, 'log');
      const errorSpy = vi.spyOn(console, 'error');
      try {
        await assertExits(() => runPack(['user/repo']), 1);
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalTTY, configurable: true });
      }

      const output = [...logSpy.mock.calls, ...errorSpy.mock.calls].map(c => c.join(' ')).join('\n');
      expect(output).toContain('Multiple skills found');
      expect(output).toContain('skill-a');
      expect(output).toContain('skill-b');
    });

    it.each(['y', 'Y', 'yes'])('lists skills, prompts user, and packs all on "%s"', async (answer) => {
      const originalTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      mockDiscoverSkills.mockResolvedValue([
        { name: 'skill-a', description: 'A', path: '/tmp/a' },
        { name: 'skill-b', description: 'B', path: '/tmp/b' },
      ]);

      mockCreateInterface.mockReturnValue({
        question: vi.fn((_query: string, callback: (answer: string) => void) => {
          callback(answer);
          return { close: vi.fn() } as any;
        }),
        close: vi.fn(),
      } as any);

      const logSpy = vi.spyOn(console, 'log');
      try {
        await runPack(['user/repo']);
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalTTY, configurable: true });
      }

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Skills found');
      expect(output).toContain('skill-a');
      expect(output).toContain('skill-b');
      expect(mockPackSkill).toHaveBeenCalledTimes(2);
      expect(mockPackSkill).toHaveBeenCalledWith(expect.objectContaining({ skillPath: '/tmp/a' }));
      expect(mockPackSkill).toHaveBeenCalledWith(expect.objectContaining({ skillPath: '/tmp/b' }));
    });

    it('lists skills, prompts user, and cancels on "n" in TTY', async () => {
      const originalTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

      mockDiscoverSkills.mockResolvedValue([
        { name: 'skill-a', description: 'A', path: '/tmp/a' },
        { name: 'skill-b', description: 'B', path: '/tmp/b' },
      ]);

      mockCreateInterface.mockReturnValue({
        question: vi.fn((_query: string, callback: (answer: string) => void) => {
          callback('n');
          return { close: vi.fn() } as any;
        }),
        close: vi.fn(),
      } as any);

      const logSpy = vi.spyOn(console, 'log');
      try {
        await assertExits(() => runPack(['user/repo']), 0);
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalTTY, configurable: true });
      }

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Skills found');
      expect(output).toContain('Cancelled');
      expect(mockPackSkill).not.toHaveBeenCalled();
      expect(mockCleanupTempDir).toHaveBeenCalled();
    });

    it('cancels on blank input (Enter) in TTY', async () => {
      mockDiscoverSkills.mockResolvedValue([
        { name: 'skill-a', description: 'A', path: '/tmp/a' },
        { name: 'skill-b', description: 'B', path: '/tmp/b' },
      ]);
      const mockQuestion = vi.fn((_query: string, callback: (answer: string) => void) => {
        callback('');
        return { close: vi.fn() } as any;
      });
      mockCreateInterface.mockReturnValue({ question: mockQuestion, close: vi.fn() } as any);
      const originalTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      const logSpy = vi.spyOn(console, 'log');
      try {
        await assertExits(() => runPack(['user/repo']), 0);
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalTTY, configurable: true });
      }
      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Cancelled');
      expect(mockPackSkill).not.toHaveBeenCalled();
    });

    it('trims whitespace from " y " and confirms', async () => {
      mockDiscoverSkills.mockResolvedValue([
        { name: 'skill-a', description: 'A', path: '/tmp/a' },
        { name: 'skill-b', description: 'B', path: '/tmp/b' },
      ]);
      const mockQuestion = vi.fn((_query: string, callback: (answer: string) => void) => {
        callback(' y ');
        return { close: vi.fn() } as any;
      });
      mockCreateInterface.mockReturnValue({ question: mockQuestion, close: vi.fn() } as any);
      const originalTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      try {
        await runPack(['user/repo']);
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalTTY, configurable: true });
      }
      expect(mockPackSkill).toHaveBeenCalledTimes(2);
      expect(mockPackSkill).toHaveBeenCalledWith(expect.objectContaining({ skillPath: '/tmp/a' }));
      expect(mockPackSkill).toHaveBeenCalledWith(expect.objectContaining({ skillPath: '/tmp/b' }));
    });

    it('cancels on non-matching input like "nope"', async () => {
      mockDiscoverSkills.mockResolvedValue([
        { name: 'skill-a', description: 'A', path: '/tmp/a' },
        { name: 'skill-b', description: 'B', path: '/tmp/b' },
      ]);
      const mockQuestion = vi.fn((_query: string, callback: (answer: string) => void) => {
        callback('nope');
        return { close: vi.fn() } as any;
      });
      mockCreateInterface.mockReturnValue({ question: mockQuestion, close: vi.fn() } as any);
      const originalTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      try {
        await assertExits(() => runPack(['user/repo']), 0);
      } finally {
        Object.defineProperty(process.stdin, 'isTTY', { value: originalTTY, configurable: true });
      }
      expect(mockPackSkill).not.toHaveBeenCalled();
    });
  });
});
