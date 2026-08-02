import { describe, it, expect, afterEach, vi } from 'vitest';
import { getGitHubHost, isGitHubHost } from '../github-host.ts';
import { parseSource } from '../source-parser.ts';

describe('getGitHubHost', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns github.com when GH_HOST is not set', () => {
    vi.stubEnv('GH_HOST', undefined);
    expect(getGitHubHost()).toBe('github.com');
  });

  it('returns the custom host when GH_HOST is set', () => {
    vi.stubEnv('GH_HOST', 'github.mycompany.com');
    expect(getGitHubHost()).toBe('github.mycompany.com');
  });

  it('falls back to github.com when GH_HOST includes a protocol', () => {
    // GH_HOST is expected to be a hostname, not a URL. The implementation
    // prepends https:// before parsing, so "https://github.mycompany.com"
    // yields a pathname of "//github.mycompany.com" and is rejected.
    vi.stubEnv('GH_HOST', 'https://github.mycompany.com');
    expect(getGitHubHost()).toBe('github.com');
  });

  it('strips a trailing slash from GH_HOST', () => {
    vi.stubEnv('GH_HOST', 'github.mycompany.com/');
    expect(getGitHubHost()).toBe('github.mycompany.com');
  });

  it('falls back to github.com when GH_HOST is an empty string', () => {
    vi.stubEnv('GH_HOST', '');
    expect(getGitHubHost()).toBe('github.com');
  });

  it('returns github.com when GH_HOST is set to github.com explicitly', () => {
    vi.stubEnv('GH_HOST', 'github.com');
    expect(getGitHubHost()).toBe('github.com');
  });

  it('trims surrounding whitespace from GH_HOST', () => {
    vi.stubEnv('GH_HOST', '  github.mycompany.com  ');
    expect(getGitHubHost()).toBe('github.mycompany.com');
  });

  it('falls back to github.com when GH_HOST is only whitespace', () => {
    vi.stubEnv('GH_HOST', '   ');
    expect(getGitHubHost()).toBe('github.com');
  });

  it('falls back to github.com when GH_HOST includes a port', () => {
    vi.stubEnv('GH_HOST', 'github.mycompany.com:8080');
    expect(getGitHubHost()).toBe('github.com');
  });

  it('falls back to github.com when GH_HOST includes a path', () => {
    vi.stubEnv('GH_HOST', 'github.mycompany.com/path');
    expect(getGitHubHost()).toBe('github.com');
  });
});

describe('getGitHubHost — integration with parseSource', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves owner/repo shorthand against the custom host when GH_HOST is set', () => {
    vi.stubEnv('GH_HOST', 'github.mycompany.com');
    const result = parseSource('acme/agent-skills');
    // With a non-default host the shorthand becomes a generic git source
    // (see shorthandSourceType in source-parser.ts), mirroring
    // source-parser.test.ts GH_HOST behavior.
    expect(result.type).toBe('git');
    expect(result.url).toBe('https://github.mycompany.com/acme/agent-skills.git');
  });

  it('resolves owner/repo shorthand to github.com when GH_HOST is not set', () => {
    vi.stubEnv('GH_HOST', undefined);
    const result = parseSource('acme/agent-skills');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/acme/agent-skills.git');
  });
});

describe('isGitHubHost', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true for github.com', () => {
    expect(isGitHubHost('github.com')).toBe(true);
  });

  it('returns true for the configured GH_HOST', () => {
    vi.stubEnv('GH_HOST', 'github.mycompany.com');
    expect(isGitHubHost('github.mycompany.com')).toBe(true);
  });

  it('returns true for the configured GH_HOST case-insensitively', () => {
    vi.stubEnv('GH_HOST', 'Github.MyCompany.com');
    expect(isGitHubHost('github.mycompany.com')).toBe(true);
  });

  it('returns false for an unknown host', () => {
    expect(isGitHubHost('gitlab.com')).toBe(false);
  });

  it('returns false when GH_HOST is not set and host is not github.com', () => {
    vi.stubEnv('GH_HOST', undefined);
    expect(isGitHubHost('github.mycompany.com')).toBe(false);
  });
});
