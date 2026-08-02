import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseSource, getOwnerRepo } from '../source-parser.ts';
import { getGitHubHost } from '../github-host.ts';
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

// ============================================================
// Ported edge cases from the skills repo test suites
// ============================================================
describe('parseSource — GitHub tree branch+path disambiguation', () => {
  it('treats first tree segment as branch, rest as path', () => {
    const result = parseSource('https://github.com/owner/repo/tree/feature/my-feature');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/owner/repo.git');
    expect(result.ref).toBe('feature');
    expect(result.subpath).toBe('my-feature');
  });

  it('parses github URL with .git suffix and #branch', () => {
    const result = parseSource('https://github.com/owner/repo.git#feature/install');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/owner/repo.git');
    expect(result.ref).toBe('feature/install');
  });

  it('does not treat a blob URL anchor as a ref', () => {
    const result = parseSource('https://github.com/owner/repo/blob/main/README.md#L10');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/owner/repo.git');
    expect(result.ref).toBeUndefined();
  });
});

describe('parseSource — GitHub shorthand with refs', () => {
  it('parses owner/repo#branch', () => {
    const result = parseSource('owner/repo#my-branch');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/owner/repo.git');
    expect(result.ref).toBe('my-branch');
    expect(result.subpath).toBeUndefined();
  });

  it('parses owner/repo/path#branch', () => {
    const result = parseSource('owner/repo/skills/my-skill#feature/skills');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/owner/repo.git');
    expect(result.ref).toBe('feature/skills');
    expect(result.subpath).toBe('skills/my-skill');
  });

  it('parses owner/repo#branch@skill combined shorthand', () => {
    const result = parseSource('owner/repo#my-branch@my-skill');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/owner/repo.git');
    expect(result.ref).toBe('my-branch');
    expect(result.skillFilter).toBe('my-skill');
  });
});

describe('parseSource — GitLab subgroups', () => {
  it('parses subgroup (3 levels)', () => {
    const result = parseSource('https://gitlab.com/coresofthq/ai/agent-skills');
    expect(result.type).toBe('gitlab');
    expect(result.url).toBe('https://gitlab.com/coresofthq/ai/agent-skills.git');
  });

  it('parses deep subgroup with .git suffix', () => {
    const result = parseSource('https://gitlab.com/org/team/project/repo.git');
    expect(result.type).toBe('gitlab');
    expect(result.url).toBe('https://gitlab.com/org/team/project/repo.git');
  });

  it('parses subgroup with tree/branch', () => {
    const result = parseSource('https://gitlab.com/group/subgroup/repo/-/tree/main');
    expect(result.type).toBe('gitlab');
    expect(result.url).toBe('https://gitlab.com/group/subgroup/repo.git');
    expect(result.ref).toBe('main');
    expect(result.subpath).toBeUndefined();
  });

  it('parses subgroup with tree/branch/path', () => {
    const result = parseSource('https://gitlab.com/group/subgroup/repo/-/tree/main/path/to/skill');
    expect(result.type).toBe('gitlab');
    expect(result.url).toBe('https://gitlab.com/group/subgroup/repo.git');
    expect(result.ref).toBe('main');
    expect(result.subpath).toBe('path/to/skill');
  });

  it('parses trailing slash', () => {
    const result = parseSource('https://gitlab.com/group/subgroup/repo/');
    expect(result.type).toBe('gitlab');
    expect(result.url).toBe('https://gitlab.com/group/subgroup/repo.git');
  });
});

describe('parseSource — hosted artifact URLs', () => {
  it.each([
    'https://raw.githubusercontent.com/acme/skills/main/SKILL.md',
    'https://github.com/acme/skills/releases/download/v1/skills.tgz',
    'https://github.com/acme/skills/archive/refs/heads/main.zip',
    'https://gitlab.com/acme/skills/-/archive/main/skills-main.tar.gz',
  ])('parses hosted artifact URL as a direct download: %s', (url) => {
    const result = parseSource(url);
    expect(result.type).toBe('download');
    expect(result.url).toBe(url);
  });
});

describe('getOwnerRepo edge cases', () => {
  it('extracts owner/repo from URL with query string', () => {
    const parsed = { type: 'git', url: 'https://git.example.com/owner/repo?ref=main' } as const;
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('extracts owner/repo from URL with fragment', () => {
    const parsed = { type: 'git', url: 'https://git.example.com/owner/repo#readme' } as const;
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('extracts owner/repo from URL with .git and query string', () => {
    const parsed = { type: 'git', url: 'https://git.example.com/owner/repo.git?ref=main' } as const;
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('extracts GitLab subgroup (2 levels)', () => {
    const parsed = { type: 'git', url: 'https://gitlab.com/group/subgroup/repo' } as const;
    expect(getOwnerRepo(parsed)).toBe('group/subgroup/repo');
  });

  it('extracts GitLab subgroup (3 levels)', () => {
    const parsed = { type: 'git', url: 'https://gitlab.com/org/team/project/repo.git' } as const;
    expect(getOwnerRepo(parsed)).toBe('org/team/project/repo');
  });

  it('extracts GitLab subgroup with query string', () => {
    const parsed = { type: 'git', url: 'https://gitlab.com/group/subgroup/repo?ref=main' } as const;
    expect(getOwnerRepo(parsed)).toBe('group/subgroup/repo');
  });

  it('extracts owner/repo from SSH URL without .git suffix', () => {
    const parsed = { type: 'git', url: 'git@github.com:owner/repo' } as const;
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('extracts owner/repo from SSH URL with scheme and port', () => {
    const parsed = {
      type: 'git',
      url: 'ssh://git@git.company.com:7999/org/team/repo.git',
    } as const;
    expect(getOwnerRepo(parsed)).toBe('org/team/repo');
  });

  it('returns null for SSH URL without an owner path', () => {
    const parsed = { type: 'git', url: 'git@github.com:repo.git' } as const;
    expect(getOwnerRepo(parsed)).toBeNull();
  });
});

describe('GH_HOST env variable behavior', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses GH_HOST for shorthand GitHub Enterprise sources', () => {
    vi.stubEnv('GH_HOST', 'github.example.com');

    expect(parseSource('acme/agent-skills')).toEqual({
      type: 'git',
      url: 'https://github.example.com/acme/agent-skills.git',
      subpath: undefined,
    });
  });

  it('uses GH_HOST for github: prefixed sources', () => {
    vi.stubEnv('GH_HOST', 'github.example.com');

    expect(parseSource('github:acme/agent-skills@review')).toEqual({
      type: 'git',
      url: 'https://github.example.com/acme/agent-skills.git',
      skillFilter: 'review',
    });
  });

  it('does not override explicit github.com URLs with GH_HOST', () => {
    vi.stubEnv('GH_HOST', 'github.example.com');

    expect(parseSource('https://github.com/owner/repo')).toEqual({
      type: 'github',
      url: 'https://github.com/owner/repo.git',
    });
  });

  it('getGitHubHost defaults to github.com when GH_HOST is empty', () => {
    vi.stubEnv('GH_HOST', '');
    expect(getGitHubHost()).toBe('github.com');
  });

  it('getGitHubHost returns a valid custom host', () => {
    vi.stubEnv('GH_HOST', 'github.example.com');
    expect(getGitHubHost()).toBe('github.example.com');
  });

  it('getGitHubHost rejects hosts with a port', () => {
    vi.stubEnv('GH_HOST', 'github.example.com:8080');
    expect(getGitHubHost()).toBe('github.com');
  });

  it('getGitHubHost accepts a trailing slash', () => {
    vi.stubEnv('GH_HOST', 'github.example.com/');
    expect(getGitHubHost()).toBe('github.example.com');
  });
});
