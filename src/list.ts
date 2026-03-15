import pc from 'picocolors';
import { join } from 'path';
import type { ListOptions, Skill } from './types.ts';
import { parseSource } from './source-parser.ts';
import { discoverSkills, getSkillDisplayName } from './skills.ts';
import { cloneRepo, cleanupTempDir, GitCloneError } from './git.ts';

export async function listSkills(options: ListOptions): Promise<Skill[]> {
  const { source, json, verbose, fullDepth } = options;
  const cwd = process.cwd();
  
  let searchPath: string;
  let tempDir: string | null = null;
  
  if (!source || source === '.' || source === './') {
    searchPath = cwd;
  } else {
    const parsed = parseSource(source);
    
    if (parsed.type === 'local') {
      searchPath = parsed.localPath!;
    } else {
      console.log(`${pc.cyan('🔍')} Fetching from ${parsed.url}...`);
      
      try {
        tempDir = await cloneRepo(parsed.url, parsed.ref);
        searchPath = tempDir;
        
        if (parsed.subpath) {
          searchPath = join(searchPath, parsed.subpath);
        }
      } catch (e) {
        if (e instanceof GitCloneError) {
          console.log(pc.red(`Failed to clone repository: ${e.message}`));
          process.exit(1);
        }
        throw e;
      }
    }
  }
  
  if (!json) {
    console.log(`${pc.cyan('🔍')} Discovering skills...`);
  }
  
  try {
    const skills = await discoverSkills(searchPath, undefined, { fullDepth });
    
    if (skills.length === 0) {
      if (json) {
        console.log('[]');
      } else {
        console.log(pc.yellow('No skills found.'));
        console.log(pc.dim('Skills require a SKILL.md with name and description.'));
      }
      return [];
    }
    
    if (json) {
      const output = skills.map((s) => ({
        name: s.name,
        description: s.description,
        path: s.path,
        pluginName: s.pluginName,
      }));
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(`${pc.green('Found')} ${pc.yellow(skills.length.toString())} skill${skills.length !== 1 ? 's' : ''}:\n`);
      
      for (const skill of skills) {
        const displayName = getSkillDisplayName(skill);
        console.log(`  ${pc.cyan(displayName)}`);
        console.log(`    ${pc.dim(skill.description.slice(0, 80))}${skill.description.length > 80 ? '...' : ''}`);
        
        if (verbose) {
          console.log(`    ${pc.dim(`Path: ${skill.path}`)}`);
        }
        console.log();
      }
    }
    
    return skills;
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
}