import { join } from 'path';
import type { ListOptions, Skill } from './types.ts';
import { parseSource } from './source-parser.ts';
import { discoverSkills, getSkillDisplayName } from './skills.ts';
import { cloneRepo, cleanupTempDir, GitCloneError } from './git.ts';
import { error, warn, info, path, count, detail } from './print.js';

export async function listSkills(options: ListOptions): Promise<Skill[]> {
  const { source, json, verbose, fullDepth, all } = options;
  const effectiveFullDepth = fullDepth || all;
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
      info(`Fetching from ${parsed.url}...`);
      
      try {
        tempDir = await cloneRepo(parsed.url, parsed.ref);
        searchPath = tempDir;
        
        if (parsed.subpath) {
          searchPath = join(searchPath, parsed.subpath);
        }
      } catch (e) {
        if (e instanceof GitCloneError) {
          error(`Failed to clone repository: ${e.message}`);
          process.exit(1);
        }
        throw e;
      }
    }
  }
  
  if (!json) {
    info('Discovering skills...');
  }
  
  try {
    const skills = await discoverSkills(searchPath, undefined, { fullDepth: effectiveFullDepth });
    
    if (skills.length === 0) {
      if (json) {
        console.log('[]');
      } else {
        warn('No skills found.');
        console.log(detail('Skills require a SKILL.md with name and description.'));
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
      info(`Found ${count(skills.length)} skill${skills.length !== 1 ? 's' : ''}:\n`);
      
      for (const skill of skills) {
        const displayName = getSkillDisplayName(skill);
        console.log(`  ${path(displayName)}`);
        console.log(`    ${detail(skill.description.slice(0, 80))}${skill.description.length > 80 ? '...' : ''}`);
        
        if (verbose) {
          console.log(`    ${detail(`Path: ${skill.path}`)}`);
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