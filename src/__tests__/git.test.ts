import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitCloneError } from '../git.ts';

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
