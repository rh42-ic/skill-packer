import { mkdtemp, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, normalize, resolve, sep } from 'path';
import { simpleGit } from 'simple-git';

const DEFAULT_CLONE_TIMEOUT_MS = 300_000; // 5 minutes
const ALLOWED_GIT_PROTOCOLS = 'https:http:ssh:git:file';
const CLONE_TIMEOUT_MS = (() => {
  const raw = process.env.SKILLS_CLONE_TIMEOUT_MS;
  if (!raw) return DEFAULT_CLONE_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CLONE_TIMEOUT_MS;
})();

export class GitCloneError extends Error {
  readonly url: string;
  readonly isTimeout: boolean;
  readonly isAuthError: boolean;

  constructor(message: string, url: string, isTimeout = false, isAuthError = false) {
    super(message);
    this.name = 'GitCloneError';
    this.url = url;
    this.isTimeout = isTimeout;
    this.isAuthError = isAuthError;
  }
}

function isAuthFailure(message: string): boolean {
  return (
    message.includes('Authentication failed') ||
    message.includes('could not read Username') ||
    message.includes('Permission denied') ||
    message.includes('Repository not found') ||
    message.includes('requested URL returned error: 403')
  );
}

function createGitClient() {
  const git = simpleGit({
    timeout: { block: CLONE_TIMEOUT_MS },
    // Disable LFS filter entirely for this clone — LFS-tracked files
    // are left as pointer files, which the skills packer doesn't read.
    config: [
      'filter.lfs.required=false',
      'filter.lfs.smudge=',
      'filter.lfs.clean=',
      'filter.lfs.process=',
    ],
    // Preserve environment variables for credentials, configuration, SSH,
    // proxies, editors, pagers, and related Git tooling. These allowances
    // apply only to trusted env vars already controlled by the caller.
    // This client is used only for clone with fixed options.
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
  });

  git.env({
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ALLOW_PROTOCOL: ALLOWED_GIT_PROTOCOLS,
    GIT_LFS_SKIP_SMUDGE: '1',
  });

  return git;
}

export async function cloneRepo(url: string, ref?: string): Promise<string> {
  if (/^ext::/i.test(url)) {
    throw new GitCloneError('Unsupported Git transport: ext', url);
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'skill-packer-'));
  const cloneOptions = ref ? ['--depth', '1', '--branch', ref] : ['--depth', '1'];

  try {
    await createGitClient().clone(url, tempDir, cloneOptions);
    return tempDir;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('block timeout') || errorMessage.includes('timed out');
    const isAuthError = isAuthFailure(errorMessage);

    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    if (isTimeout) {
      const seconds = Math.round(CLONE_TIMEOUT_MS / 1000);
      throw new GitCloneError(
        `Clone timed out after ${seconds}s. Common causes:\n` +
          `  - Large repository: raise the timeout with SKILLS_CLONE_TIMEOUT_MS=600000 (10m)\n` +
          `  - Slow network: retry, or clone manually and pass the local path\n` +
          `  - Private repo without credentials: ensure auth is configured`,
        url,
        true,
        false
      );
    }

    if (isAuthError) {
      throw new GitCloneError(
        `Authentication failed for ${url}.\n` +
          `  - For private repos, ensure you have access\n` +
          `  - For SSH: Check your keys with 'ssh -T git@github.com'\n` +
          `  - For HTTPS: Run 'gh auth login' or configure git credentials`,
        url,
        false,
        true
      );
    }

    throw new GitCloneError(`Failed to clone ${url}: ${errorMessage}`, url, false, false);
  }
}

export async function cleanupTempDir(dir: string): Promise<void> {
  // Validate that the directory path is within tmpdir to prevent deletion of arbitrary paths
  const normalizedDir = normalize(resolve(dir));
  const normalizedTmpDir = normalize(resolve(tmpdir()));

  if (!normalizedDir.startsWith(normalizedTmpDir + sep) && normalizedDir !== normalizedTmpDir) {
    throw new Error('Attempted to clean up directory outside of temp directory');
  }

  await rm(dir, { recursive: true, force: true });
}
