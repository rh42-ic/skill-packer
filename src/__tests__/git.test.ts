import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const simpleGitMock = vi.hoisted(() => vi.fn());

vi.mock('simple-git', () => ({
  default: simpleGitMock,
  simpleGit: simpleGitMock,
}));

import { GitCloneError, cloneRepo, getRepoSizeBytes } from '../git.ts';

function createGitClientMock(clone: ReturnType<typeof vi.fn>) {
  const client = {
    clone,
    env: vi.fn(),
  };
  client.env.mockReturnValue(client);
  return client;
}

// A client that delegates clone to the real `git` binary using the exact env
// object that createGitClient passes down, so transport allowlist semantics
// are genuinely exercised against git itself.
function createRealGitClientMock() {
  let capturedEnv: NodeJS.ProcessEnv = {};
  const client = {
    clone: vi.fn(),
    env: vi.fn(),
  };
  client.clone.mockImplementation(
    (url: string, dir: string, args: string[]) =>
      new Promise<void>((resolve, reject) => {
        execFile('git', ['clone', url, dir, ...args], { env: capturedEnv }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      })
  );
  client.env.mockImplementation((envObj: NodeJS.ProcessEnv) => {
    capturedEnv = envObj;
    return client;
  });
  return client;
}

function runGit(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { env }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe('GitCloneError', () => {
  it('creates an error with the correct name', () => {
    const err = new GitCloneError('something went wrong', 'https://example.com/repo.git');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(GitCloneError);
    expect(err.name).toBe('GitCloneError');
    expect(err.message).toBe('something went wrong');
    expect(err.url).toBe('https://example.com/repo.git');
    expect(err.isTimeout).toBe(false);
    expect(err.isAuthError).toBe(false);
  });

  it('records timeout and auth flags', () => {
    const err = new GitCloneError('boom', 'https://example.com/repo.git', true, true);
    expect(err.isTimeout).toBe(true);
    expect(err.isAuthError).toBe(true);
  });

  it('is catchable by instanceof', () => {
    try {
      throw new GitCloneError('clone failed', 'https://example.com/repo.git');
    } catch (e) {
      expect(e instanceof GitCloneError).toBe(true);
      expect(e instanceof Error).toBe(true);
    }
  });
});

describe('cloneRepo security', () => {
  const createdDirs: string[] = [];

  beforeEach(() => {
    simpleGitMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects the command-executing ext transport before invoking git', async () => {
    await expect(cloneRepo('ext::sh -c id')).rejects.toThrow('Unsupported Git transport: ext');

    expect(simpleGitMock).not.toHaveBeenCalled();
  });

  it('sets the hard-coded LFS filter overrides and safe env for clone', async () => {
    vi.stubEnv('EDITOR', 'skills-test-editor');
    vi.stubEnv('GIT_ASKPASS', 'skills-test-askpass');
    vi.stubEnv('PAGER', 'skills-test-pager');
    const clone = vi.fn().mockResolvedValue(undefined);
    const client = createGitClientMock(clone);
    simpleGitMock.mockReturnValueOnce(client);

    const tempDir = await cloneRepo('https://github.com/Giphy/giphy-codex-skills.git');
    createdDirs.push(tempDir);

    expect(simpleGitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: [
          'filter.lfs.required=false',
          'filter.lfs.smudge=',
          'filter.lfs.clean=',
          'filter.lfs.process=',
        ],
        unsafe: {
          allowUnsafeAlias: true,
          allowUnsafeAskPass: true,
          allowUnsafeConfigEnvCount: true,
          allowUnsafeConfigPaths: true,
          allowUnsafeCredentialHelper: true,
          allowUnsafeDiffExternal: true,
          allowUnsafeDiffTextConv: true,
          allowUnsafeEditor: true,
          allowUnsafeFilter: true,
          allowUnsafeFsMonitor: true,
          allowUnsafeGpgProgram: true,
          allowUnsafeGitProxy: true,
          allowUnsafeHooksPath: true,
          allowUnsafeMergeDriver: true,
          allowUnsafePack: true,
          allowUnsafePager: true,
          allowUnsafeProtocolOverride: true,
          allowUnsafeSshCommand: true,
          allowUnsafeTemplateDir: true,
        },
      })
    );
    expect(simpleGitMock.mock.calls[0]![0]).not.toHaveProperty('env');
    expect(client.env).toHaveBeenCalledWith(
      expect.objectContaining({
        EDITOR: 'skills-test-editor',
        GIT_ASKPASS: 'skills-test-askpass',
        GIT_TERMINAL_PROMPT: '0',
        GIT_ALLOW_PROTOCOL: 'https:http:ssh:git:file',
        GIT_LFS_SKIP_SMUDGE: '1',
        PAGER: 'skills-test-pager',
      })
    );
  });
});

describe('cloneRepo transport allowlist', () => {
  const tempDirs: string[] = [];
  const originalEnv = {
    GIT_ALLOW_PROTOCOL: process.env.GIT_ALLOW_PROTOCOL,
    GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
    GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM,
  };

  beforeEach(() => {
    simpleGitMock.mockReset();
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('overrides inherited allowances for command-capable transports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skills-transport-test-'));
    tempDirs.push(root);
    const globalConfig = join(root, 'global.gitconfig');

    await writeFile(
      globalConfig,
      '[protocol "skills-test"]\n  allow = always\n[protocol "fd"]\n  allow = always\n'
    );

    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    process.env.GIT_CONFIG_NOSYSTEM = '1';

    // Baseline: without the allowlist env var, git honors the config allow=always
    // and attempts to invoke the missing git-remote-skills-test helper.
    await expect(
      runGit(['clone', 'skills-test::fixture', join(root, 'baseline')], process.env)
    ).rejects.toThrow(/remote-skills-test/);

    // Route cloneRepo through a client that delegates to the real git binary
    // using the exact env createGitClient passes down.
    simpleGitMock.mockReturnValue(createRealGitClientMock());

    // A hostile inherited GIT_ALLOW_PROTOCOL cannot re-enable command-capable
    // transports: createGitClient overrides it with the fixed allowlist.
    process.env.GIT_ALLOW_PROTOCOL = 'skills-test:ext:fd';
    await expect(cloneRepo('skills-test::fixture')).rejects.toThrow(/transport .* not allowed/i);
    await expect(cloneRepo('ext::git-remote-skills-test')).rejects.toThrow(
      'Unsupported Git transport: ext'
    );
    await expect(cloneRepo('fd::3')).rejects.toThrow(/transport .* not allowed/i);
  });
});

describe('getRepoSizeBytes', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns bytes for valid GitHub API response', async () => {
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ size: 108 }) });
    global.fetch = mockFetch as any;

    const result = await getRepoSizeBytes('user/repo');

    expect(result).toBe(108 * 1024);
  });

  it('returns 0 when API returns non-200', async () => {
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    global.fetch = mockFetch as any;

    const result = await getRepoSizeBytes('user/repo');

    expect(result).toBe(0);
  });

  it('returns 0 when size field is missing', async () => {
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch as any;

    const result = await getRepoSizeBytes('user/repo');

    expect(result).toBe(0);
  });

  it('returns 0 when size field is 0 (empty/new repo)', async () => {
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ size: 0 }) });
    global.fetch = mockFetch as any;

    const result = await getRepoSizeBytes('user/repo');

    expect(result).toBe(0);
  });

  it('returns 0 when fetch throws (network error)', async () => {
    const mockFetch = vi.fn();
    mockFetch.mockRejectedValue(new Error('network error'));
    global.fetch = mockFetch as any;

    const result = await getRepoSizeBytes('user/repo');

    expect(result).toBe(0);
  });

  it('returns 0 for invalid ownerRepo format', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    const result = await getRepoSizeBytes('just-a-string');

    expect(result).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 0 when API returns 403 (rate limit)', async () => {
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValue({ ok: false, status: 403 });
    global.fetch = mockFetch as any;

    const result = await getRepoSizeBytes('user/repo');

    expect(result).toBe(0);
  });
});
