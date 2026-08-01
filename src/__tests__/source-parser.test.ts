import { describe, it, expect } from 'vitest';
import { parseSource, parseOwnerRepo, getOwnerRepo } from '../source-parser.ts';
import type { ParsedSource } from '../types.ts';

describe('parseSource', () => {
  // ============ LOCAL PATHS ============
  describe('local paths', () => {
    it('resolves relative path starting with ./', () => {
      const result = parseSource('./my-skill');
      expect(result.type).toBe('local');
      expect(result.localPath).toBeDefined();
      expect(result.localPath!.endsWith('my-skill')).toBe(true);
    });

    it('resolves relative path starting with ../', () => {
      const result = parseSource('../parent-dir');
      expect(result.type).toBe('local');
      expect(result.localPath).toBeDefined();
      expect(result.localPath!.endsWith('parent-dir')).toBe(true);
    });

    it('resolves "." as local', () => {
      const result = parseSource('.');
      expect(result.type).toBe('local');
    });

    it('resolves ".." as local', () => {
      const result = parseSource('..');
      expect(result.type).toBe('local');
    });

    it('resolves absolute path on Linux', () => {
      const result = parseSource('/absolute/path/to/skill');
      expect(result.type).toBe('local');
      expect(result.localPath).toBe('/absolute/path/to/skill');
    });

    it('resolves Windows absolute path', () => {
      const result = parseSource('C:\\Users\\skill');
      expect(result.type).toBe('local');
      // On Linux, resolve() prepends cwd; check ends-with instead
      expect(result.localPath!.endsWith('Users\\skill') || result.localPath!.endsWith('Users/skill')).toBe(true);
    });
  });

  // ============ GITHUB ============
  describe('github', () => {
    it('parses github.com/owner/repo URL', () => {
      const result = parseSource('https://github.com/anthropics/skills');
      expect(result.type).toBe('github');
      expect(result.url).toBe('https://github.com/anthropics/skills.git');
    });

    it('parses github URL with .git suffix', () => {
      const result = parseSource('https://github.com/anthropics/skills.git');
      expect(result.type).toBe('github');
      expect(result.url).toBe('https://github.com/anthropics/skills.git');
    });

    it('parses github tree URL with ref', () => {
      const result = parseSource('https://github.com/anthropics/skills/tree/main');
      expect(result.type).toBe('github');
      expect(result.url).toBe('https://github.com/anthropics/skills.git');
      expect(result.ref).toBe('main');
    });

    it('parses github tree URL with ref and subpath', () => {
      const result = parseSource('https://github.com/anthropics/skills/tree/main/skills/my-skill');
      expect(result.type).toBe('github');
      expect(result.url).toBe('https://github.com/anthropics/skills.git');
      expect(result.ref).toBe('main');
      expect(result.subpath).toBe('skills/my-skill');
    });

    it('parses owner/repo shorthand', () => {
      const result = parseSource('anthropics/skills');
      expect(result.type).toBe('github');
      expect(result.url).toBe('https://github.com/anthropics/skills.git');
    });

    it('parses owner/repo/subpath shorthand', () => {
      const result = parseSource('anthropics/skills/skills/my-skill');
      expect(result.type).toBe('github');
      expect(result.url).toBe('https://github.com/anthropics/skills.git');
      expect(result.subpath).toBe('skills/my-skill');
    });

    it('parses owner/repo@skill filter', () => {
      const result = parseSource('anthropics/skills@skill-creator');
      expect(result.type).toBe('github');
      expect(result.url).toBe('https://github.com/anthropics/skills.git');
      expect(result.skillFilter).toBe('skill-creator');
    });

    it('parses github: prefix', () => {
      const result = parseSource('github:anthropics/skills');
      expect(result.type).toBe('github');
      expect(result.url).toBe('https://github.com/anthropics/skills.git');
    });
  });

  // ============ GITLAB ============
  describe('gitlab', () => {
    it('parses gitlab.com/owner/repo URL', () => {
      const result = parseSource('https://gitlab.com/group/subgroup/repo');
      // The regex gitlabRepoMatch needs at least one slash in the path
      expect(result.type).toBe('gitlab');
      expect(result.url).toBe('https://gitlab.com/group/subgroup/repo.git');
    });

    it('parses gitlab tree URL with ref', () => {
      const result = parseSource('https://gitlab.com/group/repo/-/tree/main');
      expect(result.type).toBe('gitlab');
      expect(result.url).toBe('https://gitlab.com/group/repo.git');
      expect(result.ref).toBe('main');
    });

    it('parses gitlab tree URL with ref and subpath', () => {
      const result = parseSource('https://gitlab.com/group/repo/-/tree/main/path/to/skill');
      expect(result.type).toBe('gitlab');
      expect(result.url).toBe('https://gitlab.com/group/repo.git');
      expect(result.ref).toBe('main');
      expect(result.subpath).toBe('path/to/skill');
    });

    it('parses gitlab: prefix shorthand', () => {
      const result = parseSource('gitlab:group/repo');
      expect(result.type).toBe('gitlab');
      expect(result.url).toBe('https://gitlab.com/group/repo.git');
    });

    it('parses gitlab.com/owner/repo simple URL', () => {
      const result = parseSource('https://gitlab.com/owner/repo');
      expect(result.type).toBe('gitlab');
      expect(result.url).toBe('https://gitlab.com/owner/repo.git');
    });
  });

  // ============ WELL-KNOWN ============
  describe('well-known URLs', () => {
    it('parses non-GitHub/GitLab HTTP URL as well-known', () => {
      const result = parseSource('https://example.com/my-skill.zip');
      expect(result.type).toBe('well-known');
      expect(result.url).toBe('https://example.com/my-skill.zip');
    });

    it('parses HTTP URL as well-known', () => {
      const result = parseSource('http://my-server.com/skills');
      expect(result.type).toBe('well-known');
      expect(result.url).toBe('http://my-server.com/skills');
    });

    it('treats raw.githubusercontent.com as download', () => {
      const result = parseSource('https://raw.githubusercontent.com/user/repo/main/file');
      // Raw GitHub URLs are detected as hosted artifacts and use download type
      expect(result.type).toBe('download');
    });
  });

  // ============ GIT ============
  describe('generic Git URLs', () => {
    it('parses .git URL as git type', () => {
      const result = parseSource('https://git.example.com/repo.git');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://git.example.com/repo.git');
    });

    it('parses SSH git URL as git type', () => {
      const result = parseSource('git@github.com:user/repo.git');
      expect(result.type).toBe('git');
      expect(result.url).toBe('git@github.com:user/repo.git');
    });
  });

  // ============ EDGE CASES ============
  describe('edge cases', () => {
    it('rejects unsafe subpath with ".." traversal', () => {
      expect(() => parseSource('anthropics/skills/../escape')).toThrow('Unsafe subpath');
    });

    it('rejects unsafe subpath with Windows-style traversal', () => {
      expect(() => parseSource('anthropics/skills/..\\escape')).toThrow('Unsafe subpath');
    });

    it('parses github URL with subpath and .git', () => {
      const result = parseSource('https://github.com/user/repo.git');
      expect(result.type).toBe('github');
      expect(result.url).toBe('https://github.com/user/repo.git');
    });

    it('parses github.com URL without protocol (falls to git)', () => {
      // "github.com/owner/repo" without protocol — but it has a slash in the domain-like part
      // Actually it would match githubRepoMatch: /github\.com\/([^/]+)\/([^/]+)/
      const result = parseSource('github.com/owner/repo');
      expect(result.type).toBe('github');
      expect(result.url).toBe('https://github.com/owner/repo.git');
    });
  });
});

describe('parseOwnerRepo', () => {
  it('parses owner/repo', () => {
    const result = parseOwnerRepo('anthropics/skills');
    expect(result).toEqual({ owner: 'anthropics', repo: 'skills' });
  });

  it('parses owner/repo with special chars', () => {
    const result = parseOwnerRepo('my-org/my-repo');
    expect(result).toEqual({ owner: 'my-org', repo: 'my-repo' });
  });

  it('returns null for single segment', () => {
    const result = parseOwnerRepo('justname');
    expect(result).toBeNull();
  });

  it('returns null for three segments', () => {
    const result = parseOwnerRepo('a/b/c');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = parseOwnerRepo('');
    expect(result).toBeNull();
  });
});

describe('getOwnerRepo', () => {
  it('returns null for local type', () => {
    const source: ParsedSource = { type: 'local', url: '/path/to/skill' };
    expect(getOwnerRepo(source)).toBeNull();
  });

  it('extracts owner/repo from HTTPS GitHub URL', () => {
    const source: ParsedSource = {
      type: 'github',
      url: 'https://github.com/anthropics/skills.git',
    };
    expect(getOwnerRepo(source)).toBe('anthropics/skills');
  });

  it('extracts owner/repo from HTTPS GitLab URL', () => {
    const source: ParsedSource = {
      type: 'gitlab',
      url: 'https://gitlab.com/group/sub/repo.git',
    };
    expect(getOwnerRepo(source)).toBe('group/sub/repo');
  });

  it('strips .git suffix', () => {
    const source: ParsedSource = {
      type: 'git',
      url: 'https://example.com/owner/repo.git',
    };
    expect(getOwnerRepo(source)).toBe('owner/repo');
  });

  it('extracts from SSH git URL', () => {
    const source: ParsedSource = {
      type: 'git',
      url: 'git@github.com:anthropics/skills.git',
    };
    expect(getOwnerRepo(source)).toBe('anthropics/skills');
  });

  it('returns null for non-HTTP non-SSH URL', () => {
    const source: ParsedSource = {
      type: 'git',
      url: 'some-random-string',
    };
    expect(getOwnerRepo(source)).toBeNull();
  });

  it('returns null for HTTPS URL without path segments', () => {
    const source: ParsedSource = {
      type: 'well-known',
      url: 'https://example.com',
    };
    expect(getOwnerRepo(source)).toBeNull();
  });
});
