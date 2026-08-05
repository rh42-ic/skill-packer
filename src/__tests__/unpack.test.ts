import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { packSkill } from '../pack.ts';
import { unpackSkill, resolveSkillFile } from '../unpack.ts';
import { parseSize } from '../size-utils.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { Zip, ZipDeflate } from 'fflate';

// ============================================================
// Helpers
// ============================================================

function writeSkillFile(dir: string, name: string, description = 'Test skill'): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---
name: ${name}
description: ${description}
---

# ${name}

Test content.
`
  );
}

/** Build a ZIP archive in memory with the given entries (using fflate, like pack.ts). */
function craftZip(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const zip = new Zip();
  zip.ondata = (_err, chunk, _final) => {
    chunks.push(chunk);
  };
  for (const entry of entries) {
    const def = new ZipDeflate(entry.name, { level: 6 });
    def.os = 3; // Unix
    def.attrs = (0o644) << 16;
    zip.add(def);
    def.push(entry.data, true);
  }
  zip.end();

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function writeZip(zipData: Uint8Array, dir: string, name: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, zipData);
  return path;
}

function b2(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function b4(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

/**
 * Patch the central-directory declared uncompressed size of an entry to a
 * different value. Simulates a crafted archive that lies about how much its
 * payload actually decompresses to.
 */
function patchCentralDirSize(zipBytes: Uint8Array, entryName: string, newSize: number): Uint8Array {
  const copy = new Uint8Array(zipBytes);

  // Locate the end-of-central-directory record (scan from the end).
  let eocd = copy.length - 22;
  for (; eocd >= 0 && b4(copy, eocd) !== 0x06054b50; eocd--) {
    /* scan */
  }
  if (eocd < 0) throw new Error('patchCentralDirSize: EOCD not found');

  // Walk central directory headers looking for the entry.
  let offset = b4(copy, eocd + 16);
  while (b4(copy, offset) === 0x02014b50) {
    const nameLen = b2(copy, offset + 28);
    const extraLen = b2(copy, offset + 30);
    const commentLen = b2(copy, offset + 32);
    const name = new TextDecoder('utf-8').decode(
      copy.subarray(offset + 46, offset + 46 + nameLen)
    );
    if (name === entryName) {
      // Uncompressed size field: 4 little-endian bytes at central-dir +24.
      copy[offset + 24] = newSize & 0xff;
      copy[offset + 25] = (newSize >>> 8) & 0xff;
      copy[offset + 26] = (newSize >>> 16) & 0xff;
      copy[offset + 27] = (newSize >>> 24) & 0xff;
      return copy;
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`patchCentralDirSize: entry not found: ${entryName}`);
}

const SKILL_MD = `---
name: test-skill
description: A test skill for unit testing
---

# Test Skill

This is a test skill.`;

// ============================================================
// unpackSkill tests
// ============================================================
describe('unpackSkill', () => {
  let tmpDir: string;
  let targetDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `skill-packer-unpack-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
    targetDir = join(tmpDir, 'installed');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('unpacks a packed .skill file preserving structure, content and permissions', async () => {
    const skillDir = join(tmpDir, 'test-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), SKILL_MD);
    mkdirSync(join(skillDir, 'scripts'), { recursive: true });
    writeFileSync(join(skillDir, 'scripts', 'run.sh'), '#!/bin/sh\necho hello\n');
    chmodSync(join(skillDir, 'scripts', 'run.sh'), 0o755);

    const packResult = await packSkill({ skillPath: skillDir, outputPath: tmpDir });
    expect(existsSync(packResult.outputPath)).toBe(true);

    const result = await unpackSkill({
      skillFile: packResult.outputPath,
      targetDir,
    });

    expect(result.skillName).toBe('test-skill');
    expect(result.installPath).toBe(targetDir);
    expect(result.filesIncluded).toBe(2);
    expect(result.size).toBeGreaterThan(0);

    const skillMdPath = join(targetDir, 'test-skill', 'SKILL.md');
    const scriptPath = join(targetDir, 'test-skill', 'scripts', 'run.sh');
    expect(existsSync(skillMdPath)).toBe(true);
    expect(existsSync(scriptPath)).toBe(true);

    expect(readFileSync(skillMdPath, 'utf-8')).toBe(SKILL_MD);
    expect(readFileSync(scriptPath, 'utf-8')).toBe('#!/bin/sh\necho hello\n');

    // Executable bit restored from zip entry attrs.
    expect(statSync(scriptPath).mode & 0o777).toBe(0o755);
    // Default mode applied for entries without a meaningful mode.
    expect(statSync(skillMdPath).mode & 0o777).toBe(0o644);
  });

  it('overwrites an existing target directory (stale files are removed)', async () => {
    const skillDir = join(tmpDir, 'test-skill');
    writeSkillFile(skillDir, 'test-skill');
    const packResult = await packSkill({ skillPath: skillDir, outputPath: tmpDir });

    // Pre-populate the target with a stale file that is not in the archive.
    mkdirSync(join(targetDir, 'test-skill'), { recursive: true });
    writeFileSync(join(targetDir, 'test-skill', 'stale.txt'), 'stale');

    await unpackSkill({ skillFile: packResult.outputPath, targetDir });

    expect(existsSync(join(targetDir, 'test-skill', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(targetDir, 'test-skill', 'stale.txt'))).toBe(false);
  });

  it('preserves other skills already installed in the target directory', async () => {
    const skillDir = join(tmpDir, 'test-skill');
    writeSkillFile(skillDir, 'test-skill');
    const packResult = await packSkill({ skillPath: skillDir, outputPath: tmpDir });

    // Another skill installed alongside: it must survive re-installing a
    // different skill into the same target directory.
    mkdirSync(join(targetDir, 'other-skill'), { recursive: true });
    writeFileSync(join(targetDir, 'other-skill', 'SKILL.md'), '# Other skill\n');

    await unpackSkill({ skillFile: packResult.outputPath, targetDir });

    expect(existsSync(join(targetDir, 'test-skill', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(targetDir, 'other-skill', 'SKILL.md'))).toBe(true);
  });

  it('rejects archives with path traversal entries (..)', async () => {
    const zipData = craftZip([
      { name: 'test-skill/SKILL.md', data: new TextEncoder().encode(SKILL_MD) },
      { name: '../evil.txt', data: new TextEncoder().encode('evil') },
    ]);
    const zipPath = writeZip(zipData, tmpDir, 'evil.skill');

    await expect(unpackSkill({ skillFile: zipPath, targetDir })).rejects.toThrow(
      'Unsafe path in archive: ../evil.txt'
    );
  });

  it('rejects archives with entries from differing top-level directories', async () => {
    const zipData = craftZip([
      { name: 'test-skill/SKILL.md', data: new TextEncoder().encode(SKILL_MD) },
      { name: 'other/evil.txt', data: new TextEncoder().encode('evil') },
    ]);
    const zipPath = writeZip(zipData, tmpDir, 'mixed.skill');

    await expect(unpackSkill({ skillFile: zipPath, targetDir })).rejects.toThrow(
      'share a single top-level skill directory'
    );
  });

  it('rejects archives missing SKILL.md', async () => {
    const zipData = craftZip([
      { name: 'foo/readme.txt', data: new TextEncoder().encode('# readme') },
    ]);
    const zipPath = writeZip(zipData, tmpDir, 'no-skill-md.skill');

    await expect(unpackSkill({ skillFile: zipPath, targetDir })).rejects.toThrow(
      'Archive is not a valid skill: missing SKILL.md'
    );
  });

  it('rejects files that are not ZIP archives', async () => {
    const textPath = join(tmpDir, 'not-a-zip.skill');
    writeFileSync(textPath, 'hello world, this is not a zip');

    await expect(unpackSkill({ skillFile: textPath, targetDir })).rejects.toThrow(
      'Not a valid .skill file: missing ZIP magic bytes'
    );
  });

  it('rejects archives whose actual decompressed size exceeds the cap despite a small declared size', async () => {
    // An entry whose real content is ~3mb of zeros (deflates to a few KB), but
    // whose central-directory declared uncompressed size is patched down to 1024
    // bytes. With maxSkillSize = 2mb the declared-size pre-check passes and the
    // streaming actual-byte guard must reject the archive before OOM.
    const bigContent = new Uint8Array(3 * 1024 * 1024); // all zeros
    const zipData = craftZip([
      { name: 'test-skill/SKILL.md', data: new TextEncoder().encode(SKILL_MD) },
      { name: 'test-skill/big.bin', data: bigContent },
    ]);
    const patched = patchCentralDirSize(zipData, 'test-skill/big.bin', 1024);
    const zipPath = writeZip(patched, tmpDir, 'bomb.skill');

    // Declared sizes are small, so rejection must come from the actual-byte
    // accounting during streaming extraction (2mb cap < 3mb real content).
    await expect(
      unpackSkill({ skillFile: zipPath, targetDir, maxSkillSize: parseSize('2mb') })
    ).rejects.toThrow('maximum uncompressed size');
  });

  it('rejects input files larger than the maxSkillSize cap', async () => {
    const textPath = join(tmpDir, 'too-big.skill');
    writeFileSync(textPath, 'x'.repeat(2 * 1024));

    await expect(
      unpackSkill({ skillFile: textPath, targetDir, maxSkillSize: parseSize('1kb') })
    ).rejects.toThrow('too large');
  });
});

// ============================================================
// resolveSkillFile tests
// ============================================================
describe('resolveSkillFile', () => {
  let tmpDir: string;
  let cwd: string;
  let repoDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `skill-packer-resolve-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
    cwd = join(tmpDir, 'cwd');
    repoDir = join(tmpDir, 'repo');
    mkdirSync(cwd, { recursive: true });
    mkdirSync(repoDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves a bare name to <cwd>/<name>.skill', () => {
    writeFileSync(join(cwd, 'my-skill.skill'), 'x');
    const result = resolveSkillFile('my-skill', { cwd, repoDir });
    expect(result.file).toBe(join(cwd, 'my-skill.skill'));
    expect(result.candidates).toEqual([
      join(cwd, 'my-skill'),
      join(cwd, 'my-skill.skill'),
      join(repoDir, 'my-skill'),
      join(repoDir, 'my-skill.skill'),
    ]);
  });

  it('resolves a bare name to <cwd>/<name> when no .skill file exists', () => {
    writeFileSync(join(cwd, 'my-skill'), 'x');
    const result = resolveSkillFile('my-skill', { cwd, repoDir });
    expect(result.file).toBe(join(cwd, 'my-skill'));
  });

  it('falls back to <repoDir>/<name>.skill when not found in cwd', () => {
    writeFileSync(join(repoDir, 'my-skill.skill'), 'x');
    const result = resolveSkillFile('my-skill', { cwd, repoDir });
    expect(result.file).toBe(join(repoDir, 'my-skill.skill'));
  });

  it('prefers cwd over repoDir when both have a match', () => {
    writeFileSync(join(cwd, 'my-skill.skill'), 'cwd');
    writeFileSync(join(repoDir, 'my-skill.skill'), 'repo');
    const result = resolveSkillFile('my-skill', { cwd, repoDir });
    expect(result.file).toBe(join(cwd, 'my-skill.skill'));
  });

  it('treats path-looking input as a path, returned as-is', () => {
    const existing = join(tmpDir, 'existing.skill');
    writeFileSync(existing, 'x');
    const result = resolveSkillFile(existing, { cwd, repoDir });
    expect(result.file).toBe(existing);
    expect(result.candidates).toEqual([existing]);
  });

  it('returns file undefined with the single candidate for a non-existent path', () => {
    const missing = resolveSkillFile(join(tmpDir, 'nope.skill'), { cwd, repoDir });
    expect(missing.file).toBeUndefined();
    expect(missing.candidates).toEqual([join(tmpDir, 'nope.skill')]);

    const relMissing = resolveSkillFile('./missing.skill', { cwd, repoDir });
    expect(relMissing.file).toBeUndefined();
    expect(relMissing.candidates).toEqual(['./missing.skill']);
  });

  it('skips repo candidates when repoDir is not an accessible directory', () => {
    // repoDir points at a regular file, not a directory.
    const notDir = join(tmpDir, 'repo-file');
    writeFileSync(notDir, 'x');
    writeFileSync(join(cwd, 'my-skill.skill'), 'cwd');

    const result = resolveSkillFile('my-skill', { cwd, repoDir: notDir });
    expect(result.file).toBe(join(cwd, 'my-skill.skill'));
    expect(result.candidates).toEqual([join(cwd, 'my-skill'), join(cwd, 'my-skill.skill')]);

    // Nonexistent repoDir behaves the same.
    const result2 = resolveSkillFile('my-skill', { cwd, repoDir: join(tmpDir, 'nope') });
    expect(result2.file).toBe(join(cwd, 'my-skill.skill'));
    expect(result2.candidates).toEqual([join(cwd, 'my-skill'), join(cwd, 'my-skill.skill')]);
  });

  it('returns file undefined with all candidates when nothing matches', () => {
    const result = resolveSkillFile('ghost', { cwd, repoDir });
    expect(result.file).toBeUndefined();
    expect(result.candidates).toEqual([
      join(cwd, 'ghost'),
      join(cwd, 'ghost.skill'),
      join(repoDir, 'ghost'),
      join(repoDir, 'ghost.skill'),
    ]);
  });
});
