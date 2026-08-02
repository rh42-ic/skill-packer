export interface ParsedSource {
  type: 'local' | 'github' | 'gitlab' | 'git' | 'well-known' | 'download';
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
  warnings: string[];
}

export interface PackOptions {
  skillPath: string;
  outputPath?: string;
  verbose?: boolean;
  force?: boolean;
  validate?: boolean;
  strict?: boolean;
  all?: boolean;
  onConflict?: 'error' | 'skip';
  /** How to handle symbolic links:
   * - 'drop' (default): skip all symlinks
   * - 'internal': resolve symlinks whose target is inside resolveRoot (or skillPath), reject external ones
   * - 'all': resolve all symlinks, warn for external ones, enforce size limit
   */
  symlinks?: 'drop' | 'internal' | 'all';
  /** Root directory for determining whether a symlink target is "internal".
   * Defaults to skillPath. Set to the cloned repo root when packing from git sources. */
  resolveRoot?: string;
  /** Maximum total uncompressed size in bytes for the skill (all files including resolved symlinks).
   * Exceeding this limit causes packing to fail. */
  maxSize?: number;
}

export interface PackResult {
  outputPath: string;
  skillName: string;
  filesIncluded: number;
  filesExcluded: string[];
  size: number;
  skipped?: boolean;
  skipReason?: string;
}

export interface ListOptions {
  source?: string;
  verbose?: boolean;
  fullDepth?: boolean;
  all?: boolean;
}