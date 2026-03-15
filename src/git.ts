import { mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { simpleGit } from 'simple-git';

const TEMP_DIR_PREFIX = 'skill-packer-';

export class GitCloneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitCloneError';
  }
}

function generateTempDir(): string {
  const randomId = Math.random().toString(36).slice(2);
  return join(tmpdir(), `${TEMP_DIR_PREFIX}${randomId}`);
}

export async function cloneRepo(url: string, ref?: string): Promise<string> {
  const tempDir = generateTempDir();

  await mkdir(tempDir, { recursive: true });

  const git = simpleGit();

  try {
    await git.clone(url, tempDir, ['--depth', '1']);

    if (ref && ref !== 'main' && ref !== 'master') {
      const repoGit = simpleGit(tempDir);
      try {
        await repoGit.fetch(['origin', ref]);
        await repoGit.checkout(ref);
      } catch {
        // If ref fetch fails, continue with default branch
      }
    }

    return tempDir;
  } catch (e) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    const message = e instanceof Error ? e.message : 'Unknown error';
    throw new GitCloneError(`Failed to clone repository: ${message}`);
  }
}

export async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}