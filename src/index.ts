// Types
export type { ParsedSource, Skill, DiscoverSkillsOptions, ValidationResult, PackOptions, PackResult, ListOptions } from './types.ts';
export type { ValidateOptions } from './validate.ts';

// Source parsing
export { parseSource, getOwnerRepo } from './source-parser.ts';
export { isGitHubHost, getGitHubHost } from './github-host.ts';

// Git operations
export { cloneRepo, cleanupTempDir, GitCloneError } from './git.ts';

// Skill discovery & metadata
export { discoverSkills, parseSkillMd, isSubpathSafe, shouldInstallInternalSkills, getSkillDisplayName, filterSkills } from './skills.ts';
export { getPluginSkillPaths, getPluginGroupings } from './plugin-manifest.ts';

// Sanitization
export { sanitizeMetadata, stripTerminalEscapes } from './sanitize.ts';

// Packing
export { packSkill, shouldExclude, formatBytes } from './pack.ts';

// Validation
export { validateSkillMd, validateSkillPath } from './validate.ts';

// Listing
export { listSkills } from './list.ts';

// CLI handlers (preserve for backward compatibility)
export { runPack, runList, runCheck, main } from './cli.ts';
