export interface ParsedSource {
  type: 'local' | 'github' | 'gitlab' | 'git' | 'well-known';
  url: string;
  localPath?: string;
  ref?: string;
  subpath?: string;
  skillFilter?: string;
}

export interface Skill {
  name: string;
  description: string;
  path: string;
  rawContent?: string;
  metadata?: Record<string, unknown>;
  pluginName?: string;
}

export interface DiscoverSkillsOptions {
  includeInternal?: boolean;
  fullDepth?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PackOptions {
  skillPath: string;
  outputPath?: string;
  verbose?: boolean;
  force?: boolean;
  validate?: boolean;
}

export interface PackResult {
  outputPath: string;
  skillName: string;
  filesIncluded: number;
  filesExcluded: string[];
  size: number;
}

export interface ListOptions {
  source?: string;
  json?: boolean;
  verbose?: boolean;
  fullDepth?: boolean;
}