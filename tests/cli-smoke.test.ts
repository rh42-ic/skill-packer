import { describe, it, expect } from 'vitest';
import { runCli } from './helpers.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

describe('cli smoke', () => {
  it('shows help for --help', () => {
    const { stdout, exitCode } = runCli(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('skill-packer');
  });

  it('shows help for -h', () => {
    const { stdout, exitCode } = runCli(['-h']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
  });

  it('shows pack help', () => {
    const { exitCode, stdout } = runCli(['pack', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
  });

  it('shows version', () => {
    const { stdout, exitCode } = runCli(['--version']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it('errors on unknown command', () => {
    const { stderr, exitCode } = runCli(['not-a-real-command']);
    expect(exitCode).toBe(1);
  });

  it('shows banner with no args', () => {
    const { stdout, exitCode } = runCli([]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Pack skills');
  });
});
