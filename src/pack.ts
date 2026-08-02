import { readdir, mkdir, readFile, stat, lstat, readlink } from 'fs/promises';
import { join, basename, resolve, dirname, relative, isAbsolute } from 'path';
import { createWriteStream, existsSync } from 'fs';
import type { Stats } from 'fs';
import { Zip, ZipDeflate } from 'fflate';
import { formatBytes, parseSize } from './size-utils.js';
import { c as pc } from './print.js';
import type { PackOptions, PackResult } from './types.ts';
import { validateSkillPath } from './validate.ts';
import { success, error, warn, info, path, count, detail, indent, bullet, dimLabel } from './print.js';
import { SKIP_DIRS, SKIP_FILES, SKIP_GLOB_REGEXPS } from './excludes.ts';

const SKIP_DIR_SET = new Set(SKIP_DIRS);

export function shouldExclude(relPath: string): boolean {
  const parts = relPath.split(/[/\\]/);
  
  for (const part of parts) {
    if (SKIP_DIR_SET.has(part)) {
      return true;
    }
  }
  
  const fileName = parts[parts.length - 1]!;
  if (SKIP_FILES.has(fileName)) {
    return true;
  }
  
  for (const regex of SKIP_GLOB_REGEXPS) {
    if (regex.test(fileName)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if `child` is within `parent` directory (no path traversal).
 */
function isPathWithin(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Resolve a symlink chain to its final target, with loop detection and
 * external-link boundary checks.
 *
 * @throws {Error} on symlink loops, broken links, or external links when not allowed
 */
async function resolveSymlinkTarget(
  symlinkPath: string,
  rootDir: string,
  allowExternal: boolean,
): Promise<{ targetPath: string; isExternal: boolean; targetStat: Stats }> {
  const visitedInodes = new Set<string>();
  let current = symlinkPath;

  while (true) {
    const linkStat = await lstat(current);
    const inodeKey = `${linkStat.dev}:${linkStat.ino}`;

    if (visitedInodes.has(inodeKey)) {
      throw new Error(
        `Symlink loop detected: ${symlinkPath} ` +
        `(revisited inode ${inodeKey} at ${current})`
      );
    }

    if (!linkStat.isSymbolicLink()) {
      break;
    }

    visitedInodes.add(inodeKey);
    const target = await readlink(current);
    current = resolve(dirname(current), target);
  }

  const isExternal = !isPathWithin(current, rootDir);

  if (isExternal && !allowExternal) {
    throw new Error(
      `Symlink points outside skill directory: ${symlinkPath} -> ${current}\n` +
      `Use --allow-external-symlinks to include external symlinks (with size limits).`
    );
  }

  const targetStat = await stat(current) as Stats;

  if (!targetStat.isFile() && !targetStat.isDirectory()) {
    throw new Error(
      `Symlink target is not a regular file or directory: ${symlinkPath} -> ${current}`
    );
  }

  return { targetPath: current, isExternal, targetStat };
}

export async function packSkill(options: PackOptions): Promise<PackResult> {
  const { skillPath, outputPath, verbose = false, force = false, validate = true, strict = false, onConflict = 'error' } = options;
  
  const resolvedSkillPath = resolve(skillPath);
  const skillName = basename(resolvedSkillPath);
  
  if (validate) {
    if (verbose) {
      info('Validating skill...');
    }
    
    const validation = await validateSkillPath(resolvedSkillPath, { strict });
    
    if (!validation.valid) {
      error('Validation failed:');
      for (const err of validation.errors) {
        error(bullet(err));
      }
      throw new Error('Validation failed');
    }

    if (validation.warnings.length > 0) {
      warn('Warnings:');
      for (const warning of validation.warnings) {
        warn(bullet(warning));
      }
    }
    
    if (verbose) {
      success('Skill is valid!');
      console.log();
    }
  }
  
  const outputDir = outputPath ? resolve(outputPath) : process.cwd();
  
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }
  
  const outputFilePath = join(outputDir, `${skillName}.skill`);
  
  if (existsSync(outputFilePath) && !force) {
    if (onConflict === 'skip') {
      return {
        outputPath: outputFilePath,
        skillName,
        filesIncluded: 0,
        filesExcluded: [],
        size: 0,
        skipped: true,
        skipReason: `File already exists: ${outputFilePath}`,
      };
    }
    throw new Error(`File already exists: ${outputFilePath}. Use --force to overwrite.`);
  }
  
  if (verbose) {
    info(`Packaging: ${path(skillName)}`);
    console.log(indent(3, 'Source: ' + detail(resolvedSkillPath)));
    console.log(indent(3, 'Output: ' + detail(outputFilePath)));
    console.log();
  }
  
  const filesIncluded: string[] = [];
  const filesExcluded: string[] = [];
  
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputFilePath);
    const zip = new Zip();

    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      output.destroy();
      reject(err);
    };

    let bytesWritten = 0;
    let totalUncompressedSize = 0;

    zip.ondata = (err, chunk, final) => {
      if (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      output.write(Buffer.from(chunk));
      bytesWritten += chunk.length;
      if (final) output.end();
    };
    
    output.on('close', () => {
      if (settled) return;
      
      if (verbose) {
        success('Successfully packaged skill!');
        console.log(indent(3, 'Output: ' + path(outputFilePath)));
        console.log(indent(3, 'Size: ' + formatBytes(bytesWritten)));
        console.log(indent(3, 'Files included: ' + count(filesIncluded.length)));
        
        if (filesExcluded.length > 0) {
          console.log(indent(3, 'Files excluded: ' + count(filesExcluded.length)));
          for (const f of filesExcluded.slice(0, 5)) {
            console.log(indent(5, detail(f)));
          }
          if (filesExcluded.length > 5) {
            console.log(indent(5, detail(`... and ${filesExcluded.length - 5} more`)));
          }
        }
      }
      
      resolve({
        outputPath: outputFilePath,
        skillName,
        filesIncluded: filesIncluded.length,
        filesExcluded,
        size: bytesWritten,
      });
    });
    
    output.on('error', fail);
    
    const MAX_DEPTH = 20;

    const addDirectory = async (dirPath: string, basePath: string = '', depth: number = 0): Promise<void> => {
      if (depth > MAX_DEPTH) return;

      const entries = await readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullEntryPath = join(dirPath, entry.name);
        const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
        
        if (shouldExclude(relativePath)) {
          filesExcluded.push(relativePath);
          if (verbose) {
            console.log(`  ${pc.dim('Skipped')} ${relativePath}`);
          }
          continue;
        }
        
        if (entry.isSymbolicLink()) {
          const symlinks = options.symlinks ?? 'drop';

          if (symlinks === 'drop') {
            filesExcluded.push(relativePath);
            if (verbose) {
              console.log(`  ${pc.dim('Skipped symlink')} ${relativePath}`);
            }
            continue;
          }

          const allowExternal = symlinks === 'all';
          const effectiveRoot = options.resolveRoot ?? resolvedSkillPath;
          const resolved = await resolveSymlinkTarget(
            fullEntryPath, effectiveRoot, allowExternal
          );

          if (resolved.isExternal) {
            warn(
              `  Including external symlink: ${relativePath} -> ${resolved.targetPath} ` +
              `(${formatBytes(resolved.targetStat.size)})`
            );
          }

          if (resolved.targetStat.isDirectory()) {
            await addDirectory(resolved.targetPath, relativePath, depth + 1);
          } else {
            const content = await readFile(resolved.targetPath);
            totalUncompressedSize += content.length;
            if (options.maxSkillSize && totalUncompressedSize > options.maxSkillSize) {
              throw new Error(
                `Skill exceeds maximum skill size: ${formatBytes(totalUncompressedSize)} ` +
                `(limit: ${formatBytes(options.maxSkillSize)})`
              );
            }
            const zipEntryName = `${skillName}/${relativePath}`;

            const zipEntry = new ZipDeflate(zipEntryName, { level: 9 });
            zipEntry.mtime = resolved.targetStat.mtime;
            zipEntry.os = 3;
            zipEntry.attrs = (resolved.targetStat.mode & 0o777) << 16;
            zip.add(zipEntry);
            zipEntry.push(new Uint8Array(content), true);

            filesIncluded.push(relativePath);
            if (verbose) {
              console.log(`  ${pc.green('Added symlink')} ${relativePath}`);
            }
          }
          continue;
        }
        
        if (entry.isDirectory()) {
          await addDirectory(fullEntryPath, relativePath, depth + 1);
        } else if (entry.isFile()) {
          const fileStat = await stat(fullEntryPath);
          const content = await readFile(fullEntryPath);
          totalUncompressedSize += content.length;
          if (options.maxSkillSize && totalUncompressedSize > options.maxSkillSize) {
            throw new Error(
              `Skill exceeds maximum skill size: ${formatBytes(totalUncompressedSize)} ` +
              `(limit: ${formatBytes(options.maxSkillSize)})`
            );
          }
          const zipEntryName = `${skillName}/${relativePath}`;
          
          const zipEntry = new ZipDeflate(zipEntryName, { level: 9 });
          zipEntry.mtime = fileStat.mtime;
          zipEntry.os = 3; // Unix
          zipEntry.attrs = (fileStat.mode & 0o777) << 16;
          zip.add(zipEntry);
          zipEntry.push(new Uint8Array(content), true);
          
          filesIncluded.push(relativePath);
          if (verbose) {
            console.log(`  ${pc.green('Added')} ${relativePath}`);
          }
        }
      }
    };
    
    addDirectory(resolvedSkillPath).then(() => {
      zip.end();
    }).catch(fail);
  });
}

export { formatBytes, parseSize } from './size-utils.js';
