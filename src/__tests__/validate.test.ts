import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateSkillMd } from '../validate.ts';

describe('validateSkillMd', () => {
  // --- no frontmatter ---
  it('rejects content without YAML frontmatter', () => {
    const result = validateSkillMd('no frontmatter here');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('No YAML frontmatter found');
  });

  it('rejects content that starts with whitespace but no frontmatter', () => {
    const result = validateSkillMd('\n\nno frontmatter');
    expect(result.valid).toBe(false);
  });

  // --- invalid YAML ---
  it('rejects invalid YAML in frontmatter', () => {
    const content = `---
  - broken: [
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith('Invalid YAML in frontmatter'))).toBe(true);
  });

  // --- missing required fields ---
  it('rejects frontmatter without name', () => {
    const content = `---
description: A skill without a name
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing 'name' in frontmatter");
  });

  it('rejects frontmatter without description', () => {
    const content = `---
name: my-skill
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing 'description' in frontmatter");
  });

  // --- valid minimal ---
  it('accepts minimal valid frontmatter', () => {
    const content = `---
name: my-skill
description: Does something useful
---
# My Skill

Content here.`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // --- name validation ---
  it('rejects name that is not a string', () => {
    const content = `---
name: 123
description: A skill
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Name must be a string'))).toBe(true);
  });

  it('rejects name longer than 64 characters', () => {
    const content = `---
name: ${'a'.repeat(65)}
description: A skill
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('too long'))).toBe(true);
  });

  it('rejects name with uppercase letters', () => {
    const content = `---
name: My-Skill
description: A skill
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('kebab-case'))).toBe(true);
  });

  it('rejects name with special characters', () => {
    const content = `---
name: my_skill!
description: A skill
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('kebab-case'))).toBe(true);
  });

  it('rejects name starting with hyphen', () => {
    const content = `---
name: "-my-skill"
description: A skill
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('start/end with hyphen'))).toBe(true);
  });

  it('rejects name ending with hyphen', () => {
    const content = `---
name: my-skill-
description: A skill
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('start/end with hyphen'))).toBe(true);
  });

  it('rejects name with consecutive hyphens', () => {
    const content = `---
name: my--skill
description: A skill
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('consecutive hyphens'))).toBe(true);
  });

  it('accepts name with digits and hyphens', () => {
    const content = `---
name: my-skill-2
description: A skill
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(true);
  });

  // --- description validation ---
  it('rejects description with angle brackets', () => {
    const content = `---
name: my-skill
description: Contains <angle> brackets
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('angle brackets'))).toBe(true);
  });

  it('rejects description longer than 1024 characters', () => {
    const content = `---
name: my-skill
description: ${'x'.repeat(1025)}
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('too long'))).toBe(true);
  });

  it('rejects description that is not a string', () => {
    const content = `---
name: my-skill
description: 42
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Description must be a string'))).toBe(true);
  });

  // --- compatibility validation ---
  it('rejects compatibility that is not a string', () => {
    const content = `---
name: my-skill
description: A skill
compatibility: 123
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Compatibility must be a string'))).toBe(true);
  });

  it('rejects compatibility longer than 500 characters', () => {
    const content = `---
name: my-skill
description: A skill
compatibility: ${'x'.repeat(501)}
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Compatibility is too long'))).toBe(true);
  });

  // --- unexpected keys ---
  it('warns about unexpected frontmatter keys (does not affect validity)', () => {
    const content = `---
name: my-skill
description: A skill
foo: bar
baz: qux
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('Unexpected key'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('foo') && w.includes('baz'))).toBe(true);
  });

  it('rejects unexpected frontmatter keys in strict mode', () => {
    const content = `---
name: my-skill
description: A skill
foo: bar
---
body`;
    const result = validateSkillMd(content, { strict: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unexpected key'))).toBe(true);
    expect(result.errors.some((e) => e.includes('foo'))).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // --- allowed keys ---
  it('accepts all allowed frontmatter keys', () => {
    const content = `---
name: my-skill
description: A skill
license: MIT
compatibility: ">=1.0"
metadata:
  version: "1.0"
allowed-tools:
  - read_file
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(true);
  });

  // --- frontmatter not an object ---
  it('rejects scalar frontmatter (not a dictionary)', () => {
    const content = `---
just a string
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('dictionary'))).toBe(true);
  });

  // --- name whitespace handling ---
  it('trims whitespace from name before validation', () => {
    const content = `---
name: "  my-skill  "
description: A skill
---
body`;
    const result = validateSkillMd(content);
    // YAML preserves the spaces in quotes; trim() normalizes to "my-skill"
    expect(result.valid).toBe(true);
  });

  it('accepts valid kebab-case name exactly 64 chars', () => {
    const content = `---
name: ${'a'.repeat(64)}
description: A skill
---
body`;
    const result = validateSkillMd(content);
    expect(result.valid).toBe(true);
  });
});
