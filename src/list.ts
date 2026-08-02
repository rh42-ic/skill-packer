import { join } from 'path';
import type { ListOptions, Skill } from './types.ts';
import { parseSource, getOwnerRepo } from './source-parser.ts';
import { discoverSkills, getSkillDisplayName } from './skills.ts';
import { cloneRepo, cleanupTempDir, GitCloneError, getRepoSizeBytes } from './git.ts';
import { isGitHubHost } from './github-host.ts';
import { parseSize, formatBytes } from './size-utils.js';
import { error, warn, info, path, count, detail, isQuiet } from './print.js';

export async function listSkills(options: ListOptions): Promise<Skill[]> {
  const { source, verbose, fullDepth, all } = options;
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
      const displayName = getOwnerRepo(parsed) || parsed.url;
      if (!isQuiet()) {
        info(`Fetching from ${displayName}...`);
      }

      // Pre-check repo size for GitHub repos before cloning
      const ownerRepo = getOwnerRepo(parsed);
      let isGitHub = false;
      try {
        isGitHub = isGitHubHost(new URL(parsed.url).hostname);
      } catch {
        isGitHub = false;
      }
      if (ownerRepo && isGitHub) {
        const maxRepoSize = parseSize('100mb');
        const repoBytes = await getRepoSizeBytes(ownerRepo);
        if (repoBytes > 0 && repoBytes > maxRepoSize) {
          throw new Error(
            `Repository is too large: ${formatBytes(repoBytes)} (max: ${formatBytes(maxRepoSize)})`
          );
        }
      } else {
        // Non-GitHub remote source — warn that size can't be pre-checked
        warn(`Cannot pre-check repository size for ${parsed.url}. Proceeding with clone.`);
      }

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
  
  if (!isQuiet()) {
    info('Discovering skills...');
  }
  
  try {
    const skills = await discoverSkills(searchPath, undefined, { fullDepth: effectiveFullDepth });
    
    if (skills.length === 0) {
      warn('No skills found.');
      if (!isQuiet()) {
        console.log(detail('Skills require a SKILL.md with name and description.'));
      }
      return [];
    }
    
    if (isQuiet()) {
      for (const skill of skills) {
        console.log(skill.name);
      }
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