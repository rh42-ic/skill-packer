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
| `--max-skill-size <size>` | Maximum total uncompressed skill size (default: 50mb). Packing fails if exceeded. |
| `--max-repo-size <size>` | Maximum repository size before cloning (default: 100mb). Packing is aborted if the repo exceeds this. |
| `--allow-external-symlinks` | Allow symlinks pointing outside the skill directory (with size limits). Ignored for remote/clone sources. |
| `-v, --verbose` | Verbose output |
| `-q, --quiet` | Minimal output (paths only) |

When packing a remote repository without `--skill` or `--all` in an interactive terminal, skill-packer lists the discovered skills and asks for confirmation before packing all of them.

Validation runs automatically before packing. In silent mode (default), each packed file prints `✓ Packed: {path} ({size})`. Use `-v` for detailed per-file output. Unknown frontmatter keys produce warnings by default — use `--strict` to fail on them.

### `add <file.skill | name>`

Install a `.skill` file into an agent skills directory — the inverse of `pack`. Fully non-interactive, no TUI.

```bash
npx skill-packer add ./my-skill.skill              # project scope (default)
npx skill-packer add ./my-skill.skill --global     # install to ~/.agents/skills
npx skill-packer add my-skill                      # bare name: resolved from cwd, then $SKILL_PACKER_REPO_DIR
npx skill-packer install my-skill --global         # alias
npx skill-packer unpack my-skill                   # alias
```

| Option | Description |
|--------|-------------|
| `-p, --project` | Install to `<cwd>/.agents/skills` (default) |
| `-g, --global` | Install to `~/.agents/skills` |
| `--max-skill-size <size>` | Maximum uncompressed skill size (default: 50mb); also caps the input file size |
| `-v, --verbose` | Verbose output |
| `-q, --quiet` | Minimal output (install path only) |

- Aliases: `install`, `unpack`.
- A bare `<name>` is looked up as `<name>` / `<name>.skill` in the current directory, then in `$SKILL_PACKER_REPO_DIR` (if set and accessible) — convenient for installing from a local skill repository without full paths.
- Re-installing always overwrites the skill's own directory (stale files are removed); other skills already installed in the same skills directory are left untouched.
- Security: archives are validated against path traversal, must contain a root `SKILL.md`, and size limits are enforced on actual decompressed bytes during streaming extraction (zip-bomb protection), not just on declared sizes.

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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SKILL_PACKER_REPO_DIR` | Path to a directory of `.skill` files. When `add` is given a bare skill name that isn't found in the current directory, it is looked up here as `<name>` / `<name>.skill` (if the directory exists and is accessible). Set it to your local skill repository to install by name without full paths. |

## License

MIT — incorporates code from [vercel-labs/skills](https://github.com/vercel-labs/skills).
