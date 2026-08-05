import { existsSync, statSync } from 'fs';
import { readFile, rm, mkdir, writeFile, chmod, stat } from 'fs/promises';
import { join, dirname, relative, isAbsolute } from 'path';
import { Unzip, UnzipInflate } from 'fflate';
import { parseSize } from './size-utils.js';
import { c as pc, info, indent } from './print.js';
import type { AddOptions, AddResult } from './types.ts';

const MAX_ENTRIES = 1000;

// ZIP signatures (little-endian)
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_END_MIN_SIZE = 22;
const ZIP_MAX_COMMENT_SIZE = 0xffff;
const ZIP_UTF8_FLAG = 0x800;

interface ZipEntryInfo {
  /** Raw entry name as stored in the central directory. */
  name: string;
  /**
   * External file attributes. For Unix archives (os = 3, as written by
   * pack.ts) this holds `(mode & 0o777) << 16`.
   */
  attrs: number;
  /** Declared uncompressed size in bytes. */
  originalSize: number;
  /** True for pure directory entries (names ending with `/`). */
  isDirectory: boolean;
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
 * Decode an entry name exactly like fflate does (UTF-8 when the UTF-8 flag is
 * set, latin-1 otherwise) so names here always match the keys produced by
 * `unzipSync`.
 */
function decodeZipName(bytes: Uint8Array, isUtf8: boolean): string {
  if (isUtf8) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  let name = '';
  for (let i = 0; i < bytes.length; i++) {
    name += String.fromCharCode(bytes[i]!);
  }
  return name;
}

function findEndOfCentralDirectory(data: Uint8Array): number {
  const minOffset = Math.max(0, data.length - ZIP_MAX_COMMENT_SIZE - ZIP_END_MIN_SIZE);
  for (let offset = data.length - ZIP_END_MIN_SIZE; offset >= minOffset; offset--) {
    if (b4(data, offset) !== ZIP_END_OF_CENTRAL_DIRECTORY) continue;
    const commentLength = b2(data, offset + 20);
    if (offset + ZIP_END_MIN_SIZE + commentLength === data.length) {
      return offset;
    }
  }
  return -1;
}

/**
 * Walk the ZIP central directory to recover each entry's name, declared
 * uncompressed size, and unix attributes (mode). fflate does not expose
 * `attrs` when extracting, so we read it from the central directory directly.
 * @throws on malformed archives or when the entry count exceeds MAX_ENTRIES
 */
function readCentralDirectory(data: Uint8Array): ZipEntryInfo[] {
  const endOffset = findEndOfCentralDirectory(data);
  if (endOffset < 0) {
    throw new Error('Invalid zip archive: missing end of central directory');
  }

  const entries: ZipEntryInfo[] = [];
  let offset = b4(data, endOffset + 16);

  while (offset + 46 <= endOffset && b4(data, offset) === ZIP_CENTRAL_DIRECTORY_HEADER) {
    const flags = b2(data, offset + 8);
    const uncompressedSize = b4(data, offset + 24);
    const fileNameLength = b2(data, offset + 28);
    const extraLength = b2(data, offset + 30);
    const commentLength = b2(data, offset + 32);
    const externalAttrs = b4(data, offset + 38);
    const name = decodeZipName(
      data.subarray(offset + 46, offset + 46 + fileNameLength),
      Boolean(flags & ZIP_UTF8_FLAG)
    );

    entries.push({
      name,
      attrs: externalAttrs,
      originalSize: uncompressedSize,
      isDirectory: name.endsWith('/'),
    });

    if (entries.length > MAX_ENTRIES) {
      throw new Error(
        `Archive contains too many files (${entries.length}). Maximum is ${MAX_ENTRIES}.`
      );
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  if (offset !== endOffset) {
    throw new Error('Invalid zip archive: malformed central directory');
  }

  // Cross-check against the declared entry count (non-zip64 archives).
  const declaredCount = b2(data, endOffset + 8);
  if (declaredCount !== 0xffff && declaredCount !== entries.length) {
    throw new Error('Invalid zip archive: central directory entry count mismatch');
  }

  return entries;
}

/**
 * Check if `child` is within `parent` directory (no path traversal).
 */
function isPathWithin(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Strip the `${skillName}/` prefix to get the entry's path relative to the
 * skill folder.
 */
function stripSkillPrefix(name: string, skillName: string): string {
  const prefix = `${skillName}/`;
  if (!name.startsWith(prefix)) {
    throw new Error(`Invalid archive: unexpected entry name: ${name}`);
  }
  return name.slice(prefix.length);
}

export interface ResolveSkillFileOptions {
  /** Directory to search for a bare skill name; defaults to process.cwd() */
  cwd?: string;
  /** Optional fallback directory of .skill files (from SKILL_PACKER_REPO_DIR) */
  repoDir?: string | undefined;
}

export interface ResolveSkillFileResult {
  /** Resolved file path, or undefined when no candidate exists */
  file: string | undefined;
  /** All paths tried, in order (for error messages) */
  candidates: string[];
}

/**
 * Resolve the `add` positional argument to an actual `.skill` file path.
 *
 * Path-looking inputs (`./x`, `/abs/x`, `sub/x`, `..`) are used as-is and only
 * checked for existence. A bare name is resolved in this order:
 *
 * 1. `<cwd>/<name>`
 * 2. `<cwd>/<name>.skill`
 * 3. `<repoDir>/<name>` then `<repoDir>/<name>.skill` — only when `repoDir` is
 *    set and points to an accessible directory (skipped silently otherwise).
 *
 * Resolution only checks existence — it does not inspect ZIP contents.
 */
export function resolveSkillFile(
  input: string,
  opts?: ResolveSkillFileOptions
): ResolveSkillFileResult {
  const cwd = opts?.cwd ?? process.cwd();

  // Path-looking input: use as-is.
  if (
    isAbsolute(input) ||
    input.includes('/') ||
    input.includes('\\') ||
    input.startsWith('.')
  ) {
    if (existsSync(input) && statSync(input).isFile()) {
      return { file: input, candidates: [input] };
    }
    return { file: undefined, candidates: [input] };
  }

  // Bare skill name: build the candidate list (repo entries only when the
  // repo directory is set and accessible).
  const candidates = [join(cwd, input), join(cwd, `${input}.skill`)];
  if (opts?.repoDir && existsSync(opts.repoDir) && statSync(opts.repoDir).isDirectory()) {
    candidates.push(join(opts.repoDir, input), join(opts.repoDir, `${input}.skill`));
  }

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return { file: candidate, candidates };
    }
  }

  return { file: undefined, candidates };
}

/** Concatenate decompressed chunks into a single byte array. */
function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Unpack a `.skill` ZIP archive into a skills directory.
 *
 * The inverse of `packSkill`: entries are named `${skillName}/${relativePath}`
 * with unix mode bits stored in the entry attributes
 * (`attrs = (mode & 0o777) << 16`). The skill folder is created inside
 * `targetDir` (e.g. `<cwd>/.agents/skills`).
 *
 * The skill's folder inside `targetDir` is always overwritten: it is removed
 * and recreated before any file is written (stale files are purged, same
 * semantics as the skills repo's `cleanAndCreateDirectory`). Other skills
 * already installed in `targetDir` are left untouched.
 *
 * Zip-bomb defense:
 * - The input file is capped before reading; the input size limit and the
 *   extraction size limit both derive from `maxSkillSize` (default 50mb).
 * - Entries are extracted with the streaming `Unzip` class and ACTUAL
 *   decompressed bytes are counted as they are produced, aborting as soon as
 *   the real total exceeds the cap. Declared sizes in the central directory
 *   are attacker-controlled and never trusted for this.
 */
export async function unpackSkill(options: AddOptions): Promise<AddResult> {
  const { skillFile, targetDir, verbose = false } = options;
  const maxSkillSize = options.maxSkillSize ?? parseSize('50mb');

  if (verbose) {
    info(`Unpacking: ${skillFile}`);
  }

  // Cap the input size before reading the whole file into memory. A file packed
  // by packSkill is always <= its uncompressed size, so this fast pre-read
  // guard can never reject legit artifacts; it protects against huge inputs.
  const inputStat = await stat(skillFile);
  if (inputStat.size > maxSkillSize) {
    throw new Error(
      `Skill file is too large: ${inputStat.size} bytes (max: ${maxSkillSize} bytes)`
    );
  }

  const data = await readFile(skillFile);

  // Verify ZIP magic bytes ("PK").
  if (data.length < 2 || data[0] !== 0x50 || data[1] !== 0x4b) {
    throw new Error('Not a valid .skill file: missing ZIP magic bytes');
  }

  const entries = readCentralDirectory(data);

  // --- Safety validation (zip-slip defense) ---
  let skillName: string | undefined;
  let totalSize = 0;
  const fileEntries: ZipEntryInfo[] = [];
  const topLevelSegments = new Set<string>();

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    // Reject traversal, absolute paths, backslashes, and Windows drive prefixes.
    if (
      entry.name.includes('\\') ||
      entry.name.startsWith('/') ||
      /^[A-Za-z]:/.test(entry.name)
    ) {
      throw new Error(`Unsafe path in archive: ${entry.name}`);
    }
    const parts = entry.name.split('/');
    if (parts.some((part) => part === '..')) {
      throw new Error(`Unsafe path in archive: ${entry.name}`);
    }

    const first = parts[0];
    if (!first || first === '.') {
      throw new Error(
        `Invalid archive: entry has no top-level skill directory: ${entry.name}`
      );
    }
    topLevelSegments.add(first);
    if (topLevelSegments.size > 1) {
      throw new Error(
        `Invalid archive: entries must share a single top-level skill directory (found "${[...topLevelSegments].join('", "')}")`
      );
    }

    skillName = first;
    totalSize += entry.originalSize;
    fileEntries.push(entry);
  }

  if (fileEntries.length === 0 || !skillName) {
    throw new Error('Archive is not a valid skill: missing SKILL.md');
  }

  // Zip-bomb protection: enforce the total uncompressed size limit.
  if (totalSize > maxSkillSize) {
    throw new Error(
      `Archive uncompressed size exceeds limit: ${totalSize} bytes ` +
      `(max: ${maxSkillSize} bytes)`
    );
  }

  // Require SKILL.md at the archive root.
  const hasSkillMd = fileEntries.some(
    (entry) => stripSkillPrefix(entry.name, skillName!) === 'SKILL.md'
  );
  if (!hasSkillMd) {
    throw new Error('Archive is not a valid skill: missing SKILL.md');
  }

  // Strip the `${skillName}/` prefix and verify the joined destination stays
  // inside the skill folder within the target directory.
  const skillRootDir = join(targetDir, skillName!);
  const resolvedFiles = fileEntries.map((entry) => {
    const relPath = stripSkillPrefix(entry.name, skillName!);
    const destPath = join(skillRootDir, relPath);
    if (!isPathWithin(destPath, skillRootDir)) {
      throw new Error(`Unsafe path in archive: ${entry.name}`);
    }
    return { entry, relPath, destPath };
  });

  // Extract only the validated file entries using the streaming Unzip class so
  // ACTUAL decompressed bytes are counted as they are produced. Declared sizes
  // in the central directory are attacker-controlled, and fflate grows its
  // inflate output dynamically, so a crafted archive that lies about sizes
  // could otherwise decompress gigabytes into memory. We abort the moment the
  // real total exceeds the cap.
  const extractNames = new Set(resolvedFiles.map(({ entry }) => entry.name));
  const extracted = new Map<string, Uint8Array>();
  let actualTotalBytes = 0;
  let extractionError: Error | null = null;

  const unzip = new Unzip();
  unzip.register(UnzipInflate); // deflate (method 8) is not registered by default
  unzip.onfile = (file) => {
    if (!extractNames.has(file.name)) {
      return; // skip entries we did not validate (acts as the extraction filter)
    }
    const chunks: Uint8Array[] = [];
    file.ondata = (err, chunk, final) => {
      if (err) {
        // fflate re-delivers ondata throws here; always propagate.
        const e = err instanceof Error ? err : new Error(String(err));
        extractionError = e;
        throw e;
      }
      if (chunk.length > 0) {
        actualTotalBytes += chunk.length;
        if (actualTotalBytes > maxSkillSize) {
          const e = new Error(
            `Archive exceeds maximum uncompressed size: ${actualTotalBytes} bytes ` +
            `(max: ${maxSkillSize} bytes)`
          );
          extractionError = e;
          throw e;
        }
        chunks.push(chunk);
      }
      if (final) {
        extracted.set(file.name, concatBytes(chunks));
      }
    };
    file.start();
  };
  try {
    unzip.push(data, true);
  } catch (e) {
    // fflate's UnzipInflate catches ondata throws and re-delivers them; our
    // ondata throws again so this is the normal path. Fall back to the
    // recorded error just in case a throw was swallowed somewhere.
    throw extractionError ?? (e instanceof Error ? e : new Error(String(e)));
  }
  if (extractionError) {
    throw extractionError;
  }

  // Cross-check actual decompressed sizes against the central directory's
  // declared sizes. 0xffffffff is the zip64 marker; our hand-rolled central
  // directory parser does not decode zip64 extra fields, so skip those.
  for (const { entry } of resolvedFiles) {
    const actual = extracted.get(entry.name);
    if (
      actual !== undefined &&
      entry.originalSize !== 0xffffffff &&
      actual.length !== entry.originalSize
    ) {
      throw new Error(`Invalid zip archive: declared size mismatch for ${entry.name}`);
    }
  }

  // Always overwrite: clean only this skill's own directory before writing,
  // so other skills already installed in targetDir are preserved (same
  // semantics as the skills repo's cleanAndCreateDirectory(agentDir)).
  await rm(skillRootDir, { recursive: true, force: true });
  await mkdir(skillRootDir, { recursive: true });

  for (const { entry, relPath, destPath } of resolvedFiles) {
    const content = extracted.get(entry.name);
    if (!content) {
      throw new Error(`Archive entry missing after extraction: ${entry.name}`);
    }
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, Buffer.from(content));
    const mode = (entry.attrs >>> 16) & 0o777;
    await chmod(destPath, mode !== 0 ? mode : 0o644);
    if (verbose) {
      console.log(indent(3, `${pc.green('Added')} ${relPath}`));
    }
  }

  return {
    skillName: skillName!,
    installPath: targetDir,
    filesIncluded: resolvedFiles.length,
    size: totalSize,
  };
}
