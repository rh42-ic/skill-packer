> [English](README.md) | [简体中文](README.zh.md)

# skill-packer

Package AI agent skills into `.skill` files. Supports local directories, GitHub repos, GitLab repos, and generic Git URLs.

## Quick Start

```bash
npx skill-packer <command> [options]
```

## Commands

### `pack <source>`

```bash
npx skill-packer pack ./my-skill                        # local
npx skill-packer pack anthropics/skills -s skill-creator # GitHub shorthand
npx skill-packer pack https://github.com/anthropics/skills -s skill-creator
npx skill-packer pack https://github.com/anthropics/skills --all  # pack all skills
npx skill-packer pack ./my-skill -o ./dist -f           # output dir + overwrite
```

| Option | Description |
|--------|-------------|
| `-s, --skill <name>` | Skill name (required for remote URLs unless `--all`) |
| `-o, --output <dir>` | Output directory (default: cwd) |
| `-f, --force` | Overwrite existing file |
| `--all` | Pack all discovered skills in the repository |
| `--no-validate` | Skip validation |
| `--strict` | Treat unknown frontmatter keys as errors |
| `-v, --verbose` | Verbose output |

Validation runs automatically before packing. In silent mode (default), each packed file prints `✓ Packed: {path} ({size})`. Use `-v` for detailed per-file output. Unknown frontmatter keys produce warnings by default — use `--strict` to fail on them.

### `list [source]`

```bash
npx skill-packer list                         # current dir
npx skill-packer list ./skills                # specific dir
npx skill-packer list vercel-labs/agent-skills # GitHub shorthand
npx skill-packer list https://github.com/anthropics/skills --json
npx skill-packer list ./my-repo --full-depth
```

| Option | Description |
|--------|-------------|
| `-j, --json` | JSON output |
| `-v, --verbose` | Detailed output |
| `--full-depth` | Search subdirectories even with root SKILL.md |

**Source formats:** local path, `owner/repo[/path]`, `https://github.com/...`, `https://gitlab.com/...`, or any Git URL.

### `check <path>`

```bash
npx skill-packer check ./my-skill
npx skill-packer check ./my-skill --strict
```

**Validation rules:**

| Field | Required | Constraints |
|-------|:--------:|-------------|
| `name` | yes | kebab-case (`a-z`, `0-9`, `-`), max 64 chars |
| `description` | yes | max 1024 chars, no `<>` |
| `license` | no | — |
| `compatibility` | no | max 500 chars |
| `metadata` | no | — |
| `allowed-tools` | no | — |

Unknown fields → warning (default) or error (`--strict`).

Validation rules follow the [skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md) specification.

## Development

```bash
npm install && npm run build   # setup + build
npm test                       # run tests
npm run type-check             # type checking
```

## License

MIT — incorporates code from [vercel-labs/skills](https://github.com/vercel-labs/skills).
