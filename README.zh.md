> [English](README.md) | [简体中文](README.zh.md)

# skill-packer

将 AI agent skill 打包为 `.skill` 文件。支持本地目录、GitHub、GitLab 及通用 Git URL。

## 快速开始

```bash
npx skill-packer <command> [options]
```

## 命令

### `pack <source>`

```bash
npx skill-packer pack ./my-skill                        # 本地
npx skill-packer pack anthropics/skills -s skill-creator # GitHub 简写
npx skill-packer pack https://github.com/anthropics/skills -s skill-creator
npx skill-packer pack https://github.com/anthropics/skills --all  # 打包全部 skill
npx skill-packer pack ./my-skill -o ./dist -f           # 输出目录 + 覆盖
npx skill-packer pack anthropics/skills                    # 交互模式：列出后确认全部打包
```

| 选项 | 说明 |
|------|------|
| `-s, --skill <name>` | skill 名称（TTY 下省略则交互确认） |
| `-o, --output <dir>` | 输出目录（默认：当前目录） |
| `-f, --force` | 覆盖已有文件 |
| `-a, --all` | 打包仓库中发现的所有 skill |
| `--no-validate` | 跳过验证 |
| `--strict` | 严格验证：所有格式规则均视为错误（见下文） |
| `--drop-symlinks` | 丢弃所有符号链接（而非解析内部链接） |
| `--max-skill-size <size>` | 单个技能未压缩总大小上限（默认 50mb），超出则打包失败。 |
| `--max-repo-size <size>` | 克隆前仓库大小上限（默认 100mb），超过则中止打包。 |
| `--allow-external-symlinks` | 允许指向 skill 目录外部的符号链接（有大小限制）。远程/clone 来源忽略此选项。 |
| `-v, --verbose` | 详细输出 |
| `-q, --quiet` | 最小输出（仅路径） |

在交互式终端中打包远程仓库时，如未指定 `--skill` 或 `--all`，skill-packer 会列出发现的 skill 并确认后再全部打包。

打包前自动验证。静默模式（默认）下每个文件打印 `✓ Packed: {路径} ({大小})`。加 `-v` 查看详细的逐文件输出。未知 frontmatter 字段默认仅警告，加 `--strict` 则视为错误。

### `add <file.skill | name>`

将 `.skill` 文件安装到 agent skills 目录 —— `pack` 的逆操作。完全非交互，无 TUI。

```bash
npx skill-packer add ./my-skill.skill              # 项目级（默认）
npx skill-packer add ./my-skill.skill --global     # 安装到 ~/.agents/skills
npx skill-packer add my-skill                      # 裸名称：依次从当前目录、$SKILL_PACKER_REPO_DIR 查找
npx skill-packer install my-skill --global         # 别名
npx skill-packer unpack my-skill                   # 别名
```

| 选项 | 说明 |
|------|------|
| `-p, --project` | 安装到 `<cwd>/.agents/skills`（默认） |
| `-g, --global` | 安装到 `~/.agents/skills` |
| `--max-skill-size <size>` | 单个技能未压缩大小上限（默认 50mb）；同时限制输入文件大小 |
| `-v, --verbose` | 详细输出 |
| `-q, --quiet` | 最小输出（仅安装路径） |

- 别名：`install`、`unpack`。
- 裸 `<name>` 会依次以 `<name>` / `<name>.skill` 在当前目录查找，再到 `$SKILL_PACKER_REPO_DIR`（若已设置且可访问）——适合从本地 skill 仓库按名字安装，无需输入完整路径。
- 重新安装总是覆盖该 skill 自己的目录（清除过期文件）；同一 skills 目录下其他已安装的 skill 不受影响。
- 安全：归档经过路径穿越校验、必须包含根 `SKILL.md`，大小限制基于流式解压过程中的**实际**解压字节数（zip 炸弹防护），而非仅依赖声明大小。

### `list [source]`

```bash
npx skill-packer list                          # 当前目录
npx skill-packer list ./skills                 # 指定目录
npx skill-packer list vercel-labs/agent-skills  # GitHub 简写
npx skill-packer list https://github.com/anthropics/skills
npx skill-packer list ./my-repo -q
```

| 选项 | 说明 |
|------|------|
| `-v, --verbose` | 详细信息 |
| `--full-depth` | 搜索所有子目录（即使根目录存在 SKILL.md） |
| `-a, --all` | --full-depth 的别名 |
| `-q, --quiet` | 最小输出（仅名称） |

**源格式：** 本地路径、`owner/repo[/path]`、`https://github.com/...`、`https://gitlab.com/...` 或任意 Git URL。

### `check <path>`

```bash
npx skill-packer check ./my-skill
npx skill-packer check ./my-skill --strict
```

**验证规则：**

| 字段 | 必需 | 约束 |
|------|:----:|------|
| `name` | 是 | kebab-case（`a-z`、`0-9`、`-`），最长 64 字符，不可前导/尾随/连续连字符 |
| `description` | 是 | 最长 1024 字符，不含 `<>` |
| `license` | 否 | — |
| `compatibility` | 否 | 最长 500 字符 |
| `metadata` | 否 | — |
| `allowed-tools` | 否 | — |

**非严格模式（默认）：** `name` 最长 64、kebab-case、连字符规则、`description` 最长 1024、`compatibility` 最长 500 为 **警告**（不影响有效性）。仍有硬上限：`name` >256、`description` >4096、`compatibility` >4096 为错误。

**严格模式（`--strict`）：** 所有格式规则均按较低阈值视为错误。未知 frontmatter 字段同样视为错误（默认仅警告）。

## 环境变量

| 变量 | 说明 |
|------|------|
| `SKILL_PACKER_REPO_DIR` | 存放 `.skill` 文件的仓库目录路径。`add` 收到裸 skill 名称且当前目录中找不到时，会在此目录按 `<name>` / `<name>.skill` 查找（目录存在且可访问时）。设置为本地 skill 仓库后即可按名字安装，无需完整路径。 |

## 许可证

MIT — 包含来自 [vercel-labs/skills](https://github.com/vercel-labs/skills) 的代码。
