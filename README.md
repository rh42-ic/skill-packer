> [English](README.md) | [简体中文](README.zh.md)

# skill-packer

A CLI tool to download and package skills into `.skill` files.

## Installation

```bash
npx skill-packer <command> [options]
```

## Commands

### `pack <path>`

Pack a skill directory into a `.skill` file (zip archive).

```bash
# Pack a local skill
npx skill-packer pack ./my-skill

# Specify output directory
npx skill-packer pack ./my-skill -o ./dist

# Overwrite existing file
npx skill-packer pack ./my-skill --force

# Skip validation
npx skill-packer pack ./my-skill --no-validate
```

**Options:**
- `-o, --output <dir>` - Output directory (default: current directory)
- `-f, --force` - Overwrite existing file
- `--no-validate` - Skip validation before packing
- `-v, --verbose` - Show detailed output

### `list [source]`

List skills in a repository or directory.

```bash
# List skills in current directory
npx skill-packer list

# List skills in a specific directory
npx skill-packer list ./skills

# List skills from GitHub repository
npx skill-packer list vercel-labs/agent-skills

# List skills from GitHub repository with path
npx skill-packer list vercel-labs/agent-skills/skills

# Output as JSON
npx skill-packer list vercel-labs/agent-skills --json

# Search all subdirectories
npx skill-packer list ./my-repo --full-depth
```

**Source Formats:**
- Local path: `./path/to/skill` or `/absolute/path`
- GitHub shorthand: `owner/repo` or `owner/repo/path/to/skill`
- GitHub URL: `https://github.com/owner/repo`
- GitLab URL: `https://gitlab.com/owner/repo`
- Git URL: `https://any-git-host.com/repo.git`

**Options:**
- `-j, --json` - Output as JSON
- `-v, --verbose` - Show detailed information
- `--full-depth` - Search all subdirectories even with root SKILL.md

### `check <path>`

Validate a skill directory.

```bash
npx skill-packer check ./my-skill
```

## Skill Format

A skill is a directory containing a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: my-skill
description: A brief description of what this skill does
---

# Skill Title

Instructions for the agent to follow when this skill is activated.

## When to use

Describe when this skill should be used.

## Instructions

1. First step
2. Second step
```

### Validation Rules

- **name** (required): kebab-case, lowercase letters/digits/hyphens, max 64 characters
- **description** (required): max 1024 characters, no angle brackets
- **license**, **compatibility**, **metadata**, **allowed-tools** (optional)

### Excluded Files

When packing, the following are automatically excluded:
- `node_modules/`
- `__pycache__/`
- `.git/`
- `.DS_Store`
- `*.pyc`
- `.env`, `.env.local`
- `evals/` (only at skill root)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
node bin/cli.mjs --help

# Type check
npm run type-check

# Run tests
npm test
```

## Credits

This project incorporates code from [vercel-labs/skills](https://github.com/vercel-labs/skills) licensed under the MIT License.

## License

MIT
