import { readdir, mkdir } from 'fs/promises';
import { join, basename, resolve } from 'path';
import { createWriteStream, existsSync } from 'fs';
import archiver from 'archiver';
import pc from 'picocolors';
import type { PackOptions, PackResult } from './types.ts';
import { validateSkillPath } from './validate.ts';


const EXCLUDE_DIRS = new Set(['node_modules', '__pycache__', '.git', 'dist', 'build', 'evals']);
const EXCLUDE_FILES = new Set(['.DS_Store', 'Thumbs.db']);
const EXCLUDE_GLOBS = ['*.pyc', '*.pyo', '.env', '.env.local'];

function shouldExclude(relPath: string): boolean {
  const parts = relPath.split(/[/\\]/);
  
  for (const part of parts) {
    if (EXCLUDE_DIRS.has(part)) {
      return true;
    }
  }
  
  const fileName = parts[parts.length - 1]!;
  if (EXCLUDE_FILES.has(fileName)) {
    return true;
  }
  
  if (parts.length > 1 && parts[1] === 'evals') {
    return true;
  }
  
  for (const pattern of EXCLUDE_GLOBS) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    if (regex.test(fileName)) {
      return true;
    }
  }
  
  return false;
}

export async function packSkill(options: PackOptions): Promise<PackResult> {
  const { skillPath, outputPath, verbose = true, force = false, validate = true } = options;
  
  const resolvedSkillPath = resolve(skillPath);
  const skillName = basename(resolvedSkillPath);
  
  if (validate) {
    if (verbose) {
      console.log(`${pc.cyan('🔍')} Validating skill...`);
    }
    
    const validation = await validateSkillPath(resolvedSkillPath);
    
    if (!validation.valid) {
      console.log(pc.red(`❌ Validation failed:`));
      for (const error of validation.errors) {
        console.log(pc.red(`   ${error}`));
      }
      throw new Error('Validation failed');
    }
    
    if (verbose) {
      console.log(`${pc.green('✓')} Skill is valid!\n`);
    }
  }
  
  const outputDir = outputPath ? resolve(outputPath) : process.cwd();
  
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }
  
  const outputFilePath = join(outputDir, `${skillName}.skill`);
  
  if (existsSync(outputFilePath) && !force) {
    throw new Error(`File already exists: ${outputFilePath}. Use --force to overwrite.`);
  }
  
  if (verbose) {
    console.log(`${pc.cyan('📦')} Packaging skill: ${pc.yellow(skillName)}`);
    console.log(`   Source: ${pc.dim(resolvedSkillPath)}`);
    console.log(`   Output: ${pc.dim(outputFilePath)}\n`);
  }
  
  const filesIncluded: string[] = [];
  const filesExcluded: string[] = [];
  
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    output.on('close', () => {
      const size = archive.pointer();
      
      if (verbose) {
        console.log(`${pc.green('✓')} Successfully packaged skill!`);
        console.log(`   Output: ${pc.cyan(outputFilePath)}`);
        console.log(`   Size: ${formatBytes(size)}`);
        console.log(`   Files included: ${filesIncluded.length}`);
        
        if (filesExcluded.length > 0) {
          console.log(`   Files excluded: ${filesExcluded.length}`);
          for (const f of filesExcluded.slice(0, 5)) {
            console.log(`     ${pc.dim(f)}`);
          }
          if (filesExcluded.length > 5) {
            console.log(`     ${pc.dim(`... and ${filesExcluded.length - 5} more`)}`);
          }
        }
      }
      
      resolve({
        outputPath: outputFilePath,
        skillName,
        filesIncluded: filesIncluded.length,
        filesExcluded,
        size,
      });
    });
    
    archive.on('error', (err) => {
      reject(err);
    });
    
    archive.pipe(output);
    
    const addDirectory = async (dirPath: string, basePath: string = ''): Promise<void> => {
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullEntryPath = join(dirPath, entry.name);
        const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
        
        if (shouldExclude(relativePath)) {
          filesExcluded.push(relativePath);
          if (verbose) {
            console.log(`  ${pc.dim('Skipped:')}: ${relativePath}`);
          }
          continue;
        }
        
        if (entry.isDirectory()) {
          await addDirectory(fullEntryPath, relativePath);
        } else if (entry.isFile()) {
          archive.file(fullEntryPath, { name: `${skillName}/${relativePath}` });
          filesIncluded.push(relativePath);
          if (verbose) {
            console.log(`  ${pc.green('Added:')}: ${relativePath}`);
          }
        }
      }
    };
    
    addDirectory(resolvedSkillPath).then(() => {
      archive.finalize();
    }).catch(reject);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}