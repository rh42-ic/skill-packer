import { readdir, mkdir, readFile, stat } from 'fs/promises';
import { join, basename, resolve } from 'path';
import { createWriteStream, existsSync } from 'fs';
import { Zip, ZipDeflate } from 'fflate';
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
          // TODO: Symlink security review needed.
          // Symlinks pointing inside the repo boundary could potentially be
          // resolved and included. Symlinks pointing outside the repo are a
          // security risk (e.g., /etc/passwd, ~/.ssh) and must be rejected.
          // For now, all symlinks are dropped.
          filesExcluded.push(relativePath);
          if (verbose) {
            console.log(`  ${pc.dim('Skipped symlink')} ${relativePath}`);
          }
          continue;
        }
        
        if (entry.isDirectory()) {
          await addDirectory(fullEntryPath, relativePath, depth + 1);
        } else if (entry.isFile()) {
          const fileStat = await stat(fullEntryPath);
          const content = await readFile(fullEntryPath);
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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
