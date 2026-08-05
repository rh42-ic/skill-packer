// Types
export type { ParsedSource, Skill, DiscoverSkillsOptions, ValidationResult, PackOptions, PackResult, ListOptions, AddOptions, AddResult } from './types.ts';
export type { ValidateOptions } from './validate.ts';

// Source parsing
export { parseSource, getOwnerRepo } from './source-parser.ts';

// Skill discovery & metadata
export { discoverSkills, parseSkillMd, filterSkills } from './skills.ts';

// Sanitization
export { sanitizeMetadata } from './sanitize.ts';

// Packing
export { packSkill, shouldExclude } from './pack.ts';

// Unpacking (installing a .skill file)
export { unpackSkill, resolveSkillFile } from './unpack.ts';
export type { ResolveSkillFileOptions, ResolveSkillFileResult } from './unpack.ts';

// Validation
export { validateSkillMd, validateSkillPath } from './validate.ts';

// Listing
export { listSkills } from './list.ts';

// CLI handlers (preserve for backward compatibility)
export { runPack, runList, runCheck, runAdd, main } from './cli.ts';
