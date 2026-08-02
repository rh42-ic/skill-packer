import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Skill } from '../types.ts';

// We mock the modules used by listSkills BEFORE importing it
vi.mock('../git.ts', () => ({
  cloneRepo: vi.fn(),
  cleanupTempDir: vi.fn(),
  GitCloneError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'GitCloneError';
    }
  },
}));

vi.mock('../skills.ts', () => ({
  discoverSkills: vi.fn(),
  getSkillDisplayName: vi.fn((s: Skill) => s.name || 'unknown'),
}));

vi.mock('../source-parser.ts', () => ({
  parseSource: vi.fn(),
  getOwnerRepo: vi.fn(() => null),
}));

import { listSkills } from '../list.ts';
import { cloneRepo, cleanupTempDir, GitCloneError } from '../git.ts';
import { discoverSkills, getSkillDisplayName } from '../skills.ts';
import { parseSource } from '../source-parser.ts';

const mockCloneRepo = vi.mocked(cloneRepo);
const mockCleanupTempDir = vi.mocked(cleanupTempDir);
const mockDiscoverSkills = vi.mocked(discoverSkills);
const mockParseSource = vi.mocked(parseSource);

describe('listSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists skills from current directory when no source specified', async () => {
    const mockSkills: Skill[] = [
      { name: 'skill-a', description: 'Skill A', path: '/cwd/skill-a' },
      { name: 'skill-b', description: 'Skill B', path: '/cwd/skill-b' },
    ];
    mockDiscoverSkills.mockResolvedValue(mockSkills);

    const result = await listSkills({});

    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('skill-a');
    expect(result[1]!.name).toBe('skill-b');
  });

  it('lists skills from local source', async () => {
    mockParseSource.mockReturnValue({
      type: 'local',
      url: '/my/local/path',
      localPath: '/my/local/path',
    });
    mockDiscoverSkills.mockResolvedValue([
      { name: 'local-skill', description: 'Local', path: '/my/local/path/skill' },
    ]);

    const result = await listSkills({ source: '/my/local/path' });

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('local-skill');
    expect(mockParseSource).toHaveBeenCalledWith('/my/local/path');
  });

  it('clones and lists from remote source', async () => {
    mockParseSource.mockReturnValue({
      type: 'github',
      url: 'https://github.com/user/repo.git',
    });
    mockCloneRepo.mockResolvedValue('/tmp/cloned-repo');
    mockDiscoverSkills.mockResolvedValue([
      { name: 'remote-skill', description: 'Remote', path: '/tmp/cloned-repo/skills/skill' },
    ]);

    const result = await listSkills({ source: 'user/repo' });

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('remote-skill');
    expect(mockCloneRepo).toHaveBeenCalledWith('https://github.com/user/repo.git', undefined);
    expect(mockCleanupTempDir).toHaveBeenCalledWith('/tmp/cloned-repo');
  });

  it('clones with ref and subpath', async () => {
    mockParseSource.mockReturnValue({
      type: 'github',
      url: 'https://github.com/user/repo.git',
      ref: 'develop',
      subpath: 'packages/skill',
    });
    mockCloneRepo.mockResolvedValue('/tmp/cloned-repo');
    mockDiscoverSkills.mockResolvedValue([]);

    await listSkills({ source: 'user/repo' });

    expect(mockCloneRepo).toHaveBeenCalledWith('https://github.com/user/repo.git', 'develop');
  });

  it('handles no skills found', async () => {
    mockDiscoverSkills.mockResolvedValue([]);

    const result = await listSkills({});

    expect(result).toHaveLength(0);
  });

  it('cleans up temp dir on GitCloneError', async () => {
    mockParseSource.mockReturnValue({
      type: 'github',
      url: 'https://github.com/user/repo.git',
    });
    mockCloneRepo.mockRejectedValue(
      new GitCloneError('network error', 'https://github.com/user/repo.git')
    );

    // process.exit mock
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);

    await expect(listSkills({ source: 'user/repo' })).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it('cleans up temp dir even on success', async () => {
    mockParseSource.mockReturnValue({
      type: 'github',
      url: 'https://github.com/user/repo.git',
    });
    mockCloneRepo.mockResolvedValue('/tmp/cloned-repo');
    mockDiscoverSkills.mockResolvedValue([]);

    await listSkills({ source: 'user/repo' });

    expect(mockCleanupTempDir).toHaveBeenCalledWith('/tmp/cloned-repo');
  });

  it('handles "." as cwd', async () => {
    mockDiscoverSkills.mockResolvedValue([]);

    await listSkills({ source: '.' });

    // Should not call parseSource for "."
    expect(mockParseSource).not.toHaveBeenCalled();
  });

  it('handles "./" as cwd', async () => {
    mockDiscoverSkills.mockResolvedValue([]);

    await listSkills({ source: './' });

    expect(mockParseSource).not.toHaveBeenCalled();
  });
});
