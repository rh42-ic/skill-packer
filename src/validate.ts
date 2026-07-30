import matter from 'gray-matter';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import type { ValidationResult } from './types.ts';

const ALLOWED_PROPERTIES = new Set([
  'name',
  'description',
  'license',
  'allowed-tools',
  'metadata',
  'compatibility',
]);

export interface ValidateOptions {
  /** When true, unexpected frontmatter keys are errors instead of warnings. Default: false. */
  strict?: boolean;
}

export function validateSkillMd(content: string, opts?: ValidateOptions): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const strict = opts?.strict === true;

  if (!content.trimStart().startsWith('---')) {
    return { valid: false, errors: ['No YAML frontmatter found'], warnings };
  }

  let frontmatter: Record<string, unknown>;
  try {
    const parsed = matter(content);
    frontmatter = parsed.data as Record<string, unknown>;
    
    if (typeof frontmatter !== 'object' || frontmatter === null) {
      return { valid: false, errors: ['Frontmatter must be a YAML dictionary'], warnings };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { valid: false, errors: [`Invalid YAML in frontmatter: ${message}`], warnings };
  }

  const unexpectedKeys = Object.keys(frontmatter).filter((k) => !ALLOWED_PROPERTIES.has(k));
  if (unexpectedKeys.length > 0) {
    const msg = `Unexpected key(s) in frontmatter: ${unexpectedKeys.join(', ')}. Allowed: name, description, license, compatibility, metadata, allowed-tools`;
    if (strict) {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }

  if (!('name' in frontmatter)) {
    errors.push("Missing 'name' in frontmatter");
  }

  if (!('description' in frontmatter)) {
    errors.push("Missing 'description' in frontmatter");
  }

  const name = frontmatter.name;
  if (typeof name === 'string') {
    const trimmedName = name.trim();
    if (trimmedName) {
      if (trimmedName.length > 64) {
        errors.push(`Name is too long (${trimmedName.length} characters). Maximum is 64 characters.`);
      }
      if (!/^[a-z0-9-]+$/.test(trimmedName)) {
        errors.push(`Name '${trimmedName}' should be kebab-case (lowercase letters, digits, and hyphens only)`);
      }
      if (trimmedName.startsWith('-') || trimmedName.endsWith('-') || trimmedName.includes('--')) {
        errors.push(`Name '${trimmedName}' cannot start/end with hyphen or contain consecutive hyphens`);
      }
    }
  } else if (name !== undefined) {
    errors.push(`Name must be a string, got ${typeof name}`);
  }

  const description = frontmatter.description;
  if (typeof description === 'string') {
    const trimmedDesc = description.trim();
    if (trimmedDesc) {
      if (trimmedDesc.includes('<') || trimmedDesc.includes('>')) {
        errors.push('Description cannot contain angle brackets (< or >)');
      }
      if (trimmedDesc.length > 1024) {
        errors.push(`Description is too long (${trimmedDesc.length} characters). Maximum is 1024 characters.`);
      }
    }
  } else if (description !== undefined) {
    errors.push(`Description must be a string, got ${typeof description}`);
  }

  const compatibility = frontmatter.compatibility;
  if (compatibility !== undefined && compatibility !== null) {
    if (typeof compatibility !== 'string') {
      errors.push(`Compatibility must be a string, got ${typeof compatibility}`);
    } else if (compatibility.length > 500) {
      errors.push(`Compatibility is too long (${compatibility.length} characters). Maximum is 500 characters.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export async function validateSkillPath(skillPath: string, opts?: ValidateOptions): Promise<ValidationResult> {
  const warnings: string[] = [];

  try {
    const stats = await stat(skillPath);
    if (!stats.isDirectory()) {
      return { valid: false, errors: [`Path is not a directory: ${skillPath}`], warnings };
    }
  } catch {
    return { valid: false, errors: [`Skill folder not found: ${skillPath}`], warnings };
  }

  const skillMdPath = join(skillPath, 'SKILL.md');
  try {
    const content = await readFile(skillMdPath, 'utf-8');
    return validateSkillMd(content, opts);
  } catch {
    return { valid: false, errors: [`SKILL.md not found in ${skillPath}`], warnings };
  }
}