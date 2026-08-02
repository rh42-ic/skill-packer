/**
 * Unit tests for the frontmatter parser (`src/frontmatter.ts`).
 *
 * `parseFrontmatter` is a minimal YAML frontmatter parser. It only supports
 * the `---` delimiter (no `---js` / `---javascript` engines). It returns
 * `{ data, content }` and does NOT perform schema validation, coercion, or
 * field omission — it defers type fidelity to the `yaml` library.
 *
 * Tests here document the actual contract:
 *   - valid frontmatter is parsed into `data` and the body into `content`
 *   - input without recognizable frontmatter is passed through untouched
 *   - malformed YAML makes the parser throw
 *   - non-string values are preserved verbatim (no rejection/coercion)
 *   - unknown keys and scalar/array/null metadata are preserved (no filtering)
 */

import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../frontmatter.ts';

describe('parseFrontmatter', () => {
  describe('return shape', () => {
    it('returns an object with data and content', () => {
      const result = parseFrontmatter('---\nname: foo\n---\nBody');
      expect(result).toBeTypeOf('object');
      expect(result.data).toBeTypeOf('object');
      expect(result.content).toBeTypeOf('string');
    });
  });

  describe('happy path', () => {
    it('parses name, description, license, and metadata from valid YAML frontmatter', () => {
      const raw = [
        '---',
        'name: My Skill',
        'description: Does a thing',
        'license: MIT',
        'metadata:',
        '  category: utility',
        '  authors:',
        '    - alice',
        '    - bob',
        '---',
        '# My Skill',
        'Body text here.',
        '',
      ].join('\n');

      const result = parseFrontmatter(raw);
      expect(result.data).toEqual({
        name: 'My Skill',
        description: 'Does a thing',
        license: 'MIT',
        metadata: { category: 'utility', authors: ['alice', 'bob'] },
      });
      expect(result.content).toBe('# My Skill\nBody text here.\n');
    });

    it('extracts content after the closing delimiter', () => {
      const result = parseFrontmatter('---\nname: foo\n---\n\npara one\n\npara two\n');
      expect(result.content).toBe('\npara one\n\npara two\n');
    });

    it('supports CRLF line endings', () => {
      const result = parseFrontmatter('---\r\nname: foo\r\ndescription: bar\r\n---\r\nBody\r\n');
      expect(result.data).toEqual({ name: 'foo', description: 'bar' });
      expect(result.content).toBe('Body\r\n');
    });

    it('matches the first closing delimiter and keeps later --- in content', () => {
      const result = parseFrontmatter('---\nname: foo\n---\npart1\n---\npart2');
      expect(result.data).toEqual({ name: 'foo' });
      expect(result.content).toBe('part1\n---\npart2');
    });

    it('parses a YAML document without a trailing newline on the closing delimiter', () => {
      const result = parseFrontmatter('---\nname: foo\n---');
      expect(result.data).toEqual({ name: 'foo' });
      expect(result.content).toBe('');
    });

    it('captures content on the same line as the closing delimiter', () => {
      const result = parseFrontmatter('---\nname: foo\n--- body\nmore');
      expect(result.data).toEqual({ name: 'foo' });
      expect(result.content).toBe(' body\nmore');
    });
  });

  describe('empty / minimal', () => {
    it('returns empty data and passes content through when there is no frontmatter', () => {
      const raw = '# Just a markdown file\nwith no frontmatter.\n';
      const result = parseFrontmatter(raw);
      expect(result.data).toEqual({});
      expect(result.content).toBe(raw);
    });

    it('returns empty data and content for an empty input string', () => {
      const result = parseFrontmatter('');
      expect(result.data).toEqual({});
      expect(result.content).toBe('');
    });

    it('treats `---\\n---` as not frontmatter (closing delimiter needs a preceding newline)', () => {
      // The regex requires `\r?\n---` for the closing delimiter, so a bare
      // `---\n---` with an empty body does not match and passes through.
      const raw = '---\n---';
      const result = parseFrontmatter(raw);
      expect(result.data).toEqual({});
      expect(result.content).toBe(raw);
    });

    it('parses an empty frontmatter body when a blank line is present', () => {
      const result = parseFrontmatter('---\n\n---\nBody');
      expect(result.data).toEqual({});
      expect(result.content).toBe('Body');
    });

    it('parses minimal frontmatter containing only a name', () => {
      const result = parseFrontmatter('---\nname: foo\n---\nBody');
      expect(result.data).toEqual({ name: 'foo' });
      expect(result.content).toBe('Body');
    });

    it('does not recognize frontmatter that does not start at position 0', () => {
      const raw = 'text\n---\nname: foo\n---\n';
      const result = parseFrontmatter(raw);
      expect(result.data).toEqual({});
      expect(result.content).toBe(raw);
    });

    it('passes through an opening delimiter with no closing delimiter', () => {
      const raw = '---\nname: foo';
      const result = parseFrontmatter(raw);
      expect(result.data).toEqual({});
      expect(result.content).toBe(raw);
    });

    it('does not recognize a closing delimiter on the same line as the body', () => {
      const raw = '---\nname: foo---\nrest';
      const result = parseFrontmatter(raw);
      expect(result.data).toEqual({});
      expect(result.content).toBe(raw);
    });
  });

  describe('missing fields', () => {
    it('returns data without a name when name is missing (no validation error)', () => {
      const result = parseFrontmatter('---\ndescription: only a description\n---\n');
      expect(result.data).not.toHaveProperty('name');
      expect(result.data).toEqual({ description: 'only a description' });
    });

    it('returns data without a description when description is missing (no validation error)', () => {
      const result = parseFrontmatter('---\nname: only a name\n---\n');
      expect(result.data).not.toHaveProperty('description');
      expect(result.data).toEqual({ name: 'only a name' });
    });

    it('returns empty data for a body-less `---\\n---` input (treated as passthrough)', () => {
      const raw = '---\n---\nBody';
      const result = parseFrontmatter(raw);
      expect(result.data).toEqual({});
      expect(result.content).toBe(raw);
    });
  });

  describe('type checking (no coercion / no rejection)', () => {
    it('preserves a numeric name', () => {
      const result = parseFrontmatter('---\nname: 123\n---\n');
      expect(result.data.name).toBe(123);
      expect(typeof result.data.name).toBe('number');
    });

    it('preserves a float description', () => {
      const result = parseFrontmatter('---\ndescription: 4.5\n---\n');
      expect(result.data.description).toBe(4.5);
    });

    it('preserves a boolean name', () => {
      const result = parseFrontmatter('---\nname: true\n---\n');
      expect(result.data.name).toBe(true);
    });

    it('preserves an array name', () => {
      const result = parseFrontmatter('---\nname:\n  - alpha\n  - beta\n---\n');
      expect(result.data.name).toEqual(['alpha', 'beta']);
    });

    it('does not throw or coerce when name is a non-string', () => {
      expect(() => parseFrontmatter('---\nname: 42\n---\n')).not.toThrow();
    });
  });

  describe('YAML edge cases', () => {
    it('throws on malformed YAML (unterminated flow sequence)', () => {
      expect(() => parseFrontmatter('---\nname: [unclosed\n---\n')).toThrow();
    });

    it('throws on an unquoted value containing colon-space (compact mapping)', () => {
      // `foo: bar` inside a plain scalar is interpreted as a nested mapping.
      expect(() => parseFrontmatter('---\ndescription: foo: bar\n---\n')).toThrow();
    });

    it('parses a quoted value containing colon-space', () => {
      const result = parseFrontmatter('---\ndescription: "foo: bar"\n---\n');
      expect(result.data.description).toBe('foo: bar');
    });

    it('parses a single-quoted value containing colon-space', () => {
      const result = parseFrontmatter("---\ndescription: 'foo: bar'\n---\n");
      expect(result.data.description).toBe('foo: bar');
    });

    it('parses URLs with colons that are not followed by a space', () => {
      const result = parseFrontmatter('---\ndescription: https://example.com/a:b\n---\n');
      expect(result.data.description).toBe('https://example.com/a:b');
    });

    it('preserves newlines in a literal block scalar', () => {
      const result = parseFrontmatter('---\ndescription: |\n  line one\n  line two\n---\n');
      expect(result.data.description).toBe('line one\nline two\n');
    });

    it('folds a multi-line description written with >', () => {
      const result = parseFrontmatter('---\ndescription: >\n  line one\n  line two\n---\n');
      expect(result.data.description).toBe('line one line two\n');
    });

    it('strips an unquoted comment starting with #', () => {
      const result = parseFrontmatter('---\nname: foo # bar\n---\n');
      expect(result.data.name).toBe('foo');
    });

    it('keeps # in a quoted value', () => {
      const result = parseFrontmatter('---\nname: "foo # bar"\n---\n');
      expect(result.data.name).toBe('foo # bar');
    });

    it('parses unicode values', () => {
      const result = parseFrontmatter('---\nname: 日本語テスト\ndescription: "héllo wörld"\n---\n');
      expect(result.data.name).toBe('日本語テスト');
      expect(result.data.description).toBe('héllo wörld');
    });

    it('parses emoji values', () => {
      const result = parseFrontmatter('---\nname: 🚀 Skill\n---\n');
      expect(result.data.name).toBe('🚀 Skill');
    });

    it('throws on tabs used as indentation', () => {
      expect(() => parseFrontmatter('---\nmetadata:\n\tkey: value\n---\n')).toThrow();
    });

    it('resolves escaped sequences in double-quoted scalars', () => {
      const result = parseFrontmatter('---\ndescription: "a\\tb"\n---\n');
      expect(result.data.description).toBe('a\tb');
    });
  });

  describe('metadata', () => {
    it('preserves an object metadata value', () => {
      const result = parseFrontmatter('---\nmetadata:\n  foo: bar\n  nested:\n    deep: 1\n---\n');
      expect(result.data.metadata).toEqual({ foo: 'bar', nested: { deep: 1 } });
    });

    it('preserves an empty metadata object', () => {
      const result = parseFrontmatter('---\nmetadata: {}\n---\n');
      expect(result.data.metadata).toEqual({});
    });

    it('preserves a scalar metadata value (parser does not omit non-objects)', () => {
      // The minimal parser makes no assumptions about `metadata`'s schema,
      // so scalar values pass through verbatim instead of being dropped.
      const result = parseFrontmatter('---\nmetadata: hello\n---\n');
      expect(result.data.metadata).toBe('hello');
    });

    it('preserves a numeric scalar metadata value', () => {
      const result = parseFrontmatter('---\nmetadata: 7\n---\n');
      expect(result.data.metadata).toBe(7);
    });

    it('preserves an array metadata value (parser does not omit arrays)', () => {
      const result = parseFrontmatter('---\nmetadata:\n  - a\n  - b\n---\n');
      expect(result.data.metadata).toEqual(['a', 'b']);
    });

    it('preserves a null metadata value', () => {
      const result = parseFrontmatter('---\nmetadata:\n---\n');
      expect(result.data.metadata).toBeNull();
    });

    it('preserves an explicit null metadata value', () => {
      const result = parseFrontmatter('---\nmetadata: null\n---\n');
      expect(result.data.metadata).toBeNull();
    });
  });

  describe('boundary values', () => {
    it('preserves a very long name', () => {
      const longName = 'x'.repeat(10_000);
      const result = parseFrontmatter(`---\nname: ${longName}\n---\n`);
      expect(result.data.name).toBe(longName);
    });

    it('preserves a very long description', () => {
      const longDescription = 'word '.repeat(2_000).trim();
      const result = parseFrontmatter(`---\ndescription: ${longDescription}\n---\n`);
      expect(result.data.description).toBe(longDescription);
    });

    it('preserves an empty quoted string field', () => {
      const result = parseFrontmatter('---\nname: ""\ndescription: ""\n---\n');
      expect(result.data.name).toBe('');
      expect(result.data.description).toBe('');
    });

    it('parses an empty (null) value as null', () => {
      const result = parseFrontmatter('---\nname:\n---\n');
      expect(result.data.name).toBeNull();
    });

    it('trims surrounding whitespace from unquoted values', () => {
      const result = parseFrontmatter('---\nname:   foo   \n---\n');
      expect(result.data.name).toBe('foo');
    });

    it('preserves surrounding whitespace in quoted values', () => {
      const result = parseFrontmatter('---\nname: "  foo  "\n---\n');
      expect(result.data.name).toBe('  foo  ');
    });

    it('preserves a whitespace-only quoted value', () => {
      const result = parseFrontmatter('---\nname: "   "\n---\n');
      expect(result.data.name).toBe('   ');
    });
  });

  describe('unknown keys', () => {
    it('keeps extra keys not in any schema (no rejection)', () => {
      const result = parseFrontmatter('---\nname: foo\nextra: 1\nanother: value\n---\n');
      expect(result.data).toEqual({ name: 'foo', extra: 1, another: 'value' });
    });

    it('keeps nested unknown keys', () => {
      const result = parseFrontmatter('---\ncustom:\n  nested:\n    - x\n    - y\n---\n');
      expect(result.data.custom).toEqual({ nested: ['x', 'y'] });
    });

    it('does not throw when unknown keys are present', () => {
      expect(() =>
        parseFrontmatter('---\nname: foo\nanything: true\ntags: [a, b]\n---\n')
      ).not.toThrow();
    });
  });

  describe('non-object frontmatter bodies (YAML quirks)', () => {
    it('returns a YAML sequence as data when the whole body is a sequence', () => {
      const result = parseFrontmatter('---\n- a\n- b\n---\ncontent');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toEqual(['a', 'b']);
      expect(result.content).toBe('content');
    });

    it('returns a YAML scalar as data when the whole body is a scalar', () => {
      const result = parseFrontmatter('---\n42\n---');
      expect(result.data).toBe(42);
      expect(result.content).toBe('');
    });
  });
});
