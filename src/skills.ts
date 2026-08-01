import { readdir, readFile, stat } from 'fs/promises';
import { join, dirname, resolve, normalize, sep, basename } from 'path';
import matter from 'gray-matter';
import { sanitizeMetadata } from './sanitize.ts';
import type { Skill, DiscoverSkillsOptions } from './types.ts';

const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '__pycache__'];

const AGENT_PROJECT_SKILL_DIRS = [
  '.agents/skills',
  '.claude/skills',
  '.cline/skills',
  '.codebuddy/skills',
  '.codex/skills',
  '.commandcode/skills',
  '.continue/skills',
  '.github/skills',
  '.goose/skills',
  '.grok/skills',
  '.iflow/skills',
  '.junie/skills',
  '.kilocode/skills',
  '.kimchi/skills',
  '.kiro/skills',
  '.minimax/skills',
  '.mux/skills',
  '.neovate/skills',
  '.opencode/skills',
  '.openhands/skills',
  '.pi/skills',
  '.qoder/skills',
  '.roo/skills',
  '.trae/skills',
  '.windsurf/skills',
  '.zcode/skills',
  '.zencoder/skills',
];

export function shouldInstallInternalSkills(): boolean {
  const envValue = process.env.INSTALL_INTERNAL_SKILLS;
  return envValue === '1' || envValue === 'true';
}

async function hasSkillMd(dir: string): Promise<boolean> {
  try {
    const skillPath = join(dir, 'SKILL.md');
    const stats = await stat(skillPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

function warnSkippedSkill(skillMdPath: string, reason: string): void {
  console.warn(`Skipped ${skillMdPath} — ${reason}`);
}

export async function parseSkillMd(
  skillMdPath: string,
  options?: { includeInternal?: boolean }
): Promise<Skill | null> {
  try {
    const content = await readFile(skillMdPath, 'utf-8');
    const { data } = matter(content);

    if (!data.name || !data.description) {
      warnSkippedSkill(skillMdPath, 'missing name or description');
      return null;
    }

    if (typeof data.name !== 'string' || typeof data.description !== 'string') {
      warnSkippedSkill(skillMdPath, 'name or description is not a string');
      return null;
    }

    const isInternal = data.metadata?.internal === true;
    if (isInternal && !shouldInstallInternalSkills() && !options?.includeInternal) {
      warnSkippedSkill(skillMdPath, 'internal skill not enabled');
      return null;
    }

    return {
      name: sanitizeMetadata(data.name),
      description: sanitizeMetadata(data.description),
      path: dirname(skillMdPath),
      rawContent: content,
      metadata: data.metadata,
    };
  } catch (err) {
    warnSkippedSkill(skillMdPath, `failed to read file: ${(err as Error).message}`);
    return null;
  }
}

async function findSkillDirs(dir: string, depth = 0, maxDepth = 5): Promise<string[]> {
  if (depth > maxDepth) return [];

  try {
    const [hasSkill, entries] = await Promise.all([
      hasSkillMd(dir),
      readdir(dir, { withFileTypes: true }).catch(() => []),
    ]);

    const currentDir = hasSkill ? [dir] : [];

    const subDirResults = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && !SKIP_DIRS.includes(entry.name))
        .map((entry) => findSkillDirs(join(dir, entry.name), depth + 1, maxDepth))
    );

    return [...currentDir, ...subDirResults.flat()];
  } catch {
    return [];
  }
}

export function isSubpathSafe(basePath: string, subpath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(join(basePath, subpath)));

  return normalizedTarget.startsWith(normalizedBase + sep) || normalizedTarget === normalizedBase;
}

export async function discoverSkills(
  basePath: string,
  subpath?: string,
  options?: DiscoverSkillsOptions
): Promise<Skill[]> {
  const skills: Skill[] = [];
  const seenNames = new Set<string>();
  const parsedSkillPaths = new Set<string>();

  const parseSkillAt = async (skillDir: string): Promise<Skill | null> => {
    const skillMdPath = resolve(skillDir, 'SKILL.md');
    if (parsedSkillPaths.has(skillMdPath)) return null;
    parsedSkillPaths.add(skillMdPath);
    return parseSkillMd(skillMdPath, options);
  };

  if (subpath && !isSubpathSafe(basePath, subpath)) {
    throw new Error(
      `Invalid subpath: "${subpath}" resolves outside the repository directory.`
    );
  }

  const searchPath = subpath ? join(basePath, subpath) : basePath;

  if (await hasSkillMd(searchPath)) {
    let skill = await parseSkillMd(join(searchPath, 'SKILL.md'), options);
    if (skill) {
      skills.push(skill);
      seenNames.add(skill.name);
      if (!options?.fullDepth) {
        return skills;
      }
    }
  }

  const prioritySearchDirs = [
    searchPath,
    join(searchPath, 'skills'),
    join(searchPath, 'skills/.curated'),
    join(searchPath, 'skills/.experimental'),
    join(searchPath, 'skills/.system'),
    ...AGENT_PROJECT_SKILL_DIRS.map((dir) => join(searchPath, dir)),
  ];

  // Known skill container dirs are walked one extra level deep so layouts
  // like skills/<category>/<skill>/SKILL.md are discovered without
  // requiring --full-depth.
  const deepContainerDirs = new Set(prioritySearchDirs.slice(1));

  const tryAddSkillAt = async (skillDir: string): Promise<boolean> => {
    if (!(await hasSkillMd(skillDir))) return false;
    let skill = await parseSkillAt(skillDir);
    if (!skill || seenNames.has(skill.name)) return true;
    skills.push(skill);
    seenNames.add(skill.name);
    return true;
  };

  for (const dir of prioritySearchDirs) {
    const walkDeep = deepContainerDirs.has(dir);

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const childDir = join(dir, entry.name);
        const foundAtChild = await tryAddSkillAt(childDir);

        if (foundAtChild || !walkDeep) continue;
        if (SKIP_DIRS.includes(entry.name)) continue;

        // Walk one extra level for catalog layouts
        try {
          const grandEntries = await readdir(childDir, { withFileTypes: true });
          for (const grand of grandEntries) {
            if (!grand.isDirectory() || SKIP_DIRS.includes(grand.name)) continue;
            await tryAddSkillAt(join(childDir, grand.name));
          }
        } catch {
          // Child dir unreadable; skip silently
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  if (skills.length === 0 || options?.fullDepth) {
    const allSkillDirs = await findSkillDirs(searchPath);

    for (const skillDir of allSkillDirs) {
      let skill = await parseSkillAt(skillDir);
      if (skill && !seenNames.has(skill.name)) {
        skills.push(skill);
        seenNames.add(skill.name);
      }
    }
  }

  return skills;
}

export function getSkillDisplayName(skill: Skill): string {
  return skill.name || basename(skill.path);
}

export function filterSkills(skills: Skill[], inputNames: string[]): Skill[] {
  const normalizedInputs = inputNames.map((n) => n.toLowerCase());

  return skills.filter((skill) => {
    const name = skill.name.toLowerCase();
    const displayName = getSkillDisplayName(skill).toLowerCase();

    return normalizedInputs.some((input) => input === name || input === displayName);
  });
}