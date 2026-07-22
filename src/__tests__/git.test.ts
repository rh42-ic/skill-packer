import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitCloneError } from '../git.ts';

describe('GitCloneError', () => {
  it('creates an error with the correct name', () => {
    const err = new GitCloneError('something went wrong');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(GitCloneError);
    expect(err.name).toBe('GitCloneError');
    expect(err.message).toBe('something went wrong');
  });

  it('is catchable by instanceof', () => {
    try {
      throw new GitCloneError('clone failed');
    } catch (e) {
      expect(e instanceof GitCloneError).toBe(true);
      expect(e instanceof Error).toBe(true);
    }
  });
});
