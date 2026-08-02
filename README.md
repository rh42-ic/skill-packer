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
npx skill-packer pack anthropics/skills                    # interactive: list + confirm all
```

| Option | Description |
|--------|-------------|
| `-s, --skill <name>` | Skill name to pack (interactive prompt if omitted in TTY) |
| `-o, --output <dir>` | Output directory (default: cwd) |
| `-f, --force` | Overwrite existing file |
| `-a, --all` | Pack all discovered skills in the repository |
| `--no-validate` | Skip validation |
| `--strict` | Strict validation: all format rules are errors (see below) |
| `--drop-symlinks` | Drop all symlinks instead of resolving internal ones |
| `--max-size <size>` | Maximum total uncompressed skill size (default: 50mb). Packing fails if exceeded. |
| `--allow-external-symlinks` | Allow symlinks pointing outside the skill directory (with size limits). Ignored for remote/clone sources. |
| `-v, --verbose` | Verbose output |
| `-q, --quiet` | Minimal output (paths only) |

When packing a remote repository without `--skill` or `--all` in an interactive terminal, skill-packer lists the discovered skills and asks for confirmation before packing all of them.

Validation runs automatically before packing. In silent mode (default), each packed file prints `✓ Packed: {path} ({size})`. Use `-v` for detailed per-file output. Unknown frontmatter keys produce warnings by default — use `--strict` to fail on them.

### `list [source]`

```bash
npx skill-packer list                         # current dir
npx skill-packer list ./skills                # specific dir
npx skill-packer list vercel-labs/agent-skills # GitHub shorthand
npx skill-packer list https://github.com/anthropics/skills
npx skill-packer list ./my-repo -q
```

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Detailed output |
| `--full-depth` | Search subdirectories even with root SKILL.md |
| `-a, --all` | Alias for --full-depth |
| `-q, --quiet` | Minimal output (names only) |

**Source formats:** local path, `owner/repo[/path]`, `https://github.com/...`, `https://gitlab.com/...`, or any Git URL.

### `check <path>`

```bash
npx skill-packer check ./my-skill
npx skill-packer check ./my-skill --strict
```

**Validation rules:**

| Field | Required | Constraints |
|-------|:--------:|-------------|
| `name` | yes | kebab-case (`a-z`, `0-9`, `-`), max 64 chars, no leading/trailing/consecutive hyphens |
| `description` | yes | max 1024 chars, no `<>` |
| `license` | no | — |
| `compatibility` | no | max 500 chars |
| `metadata` | no | — |
| `allowed-tools` | no | — |

**Non-strict mode (default):** `name` max 64, kebab-case, hyphen rules, `description` max 1024, and `compatibility` max 500 are **warnings** (validity unaffected). Hard ceilings still apply: `name` >256, `description` >4096, `compatibility` >4096 are errors.

**Strict mode (`--strict`):** all format rules are errors at their lower thresholds. Unknown frontmatter keys are also errors (vs warnings by default).

## Development

```bash
npm install && npm run build   # setup + build
npm test                       # run tests
npm run type-check             # type checking
```

## License

MIT — incorporates code from [vercel-labs/skills](https://github.com/vercel-labs/skills).
