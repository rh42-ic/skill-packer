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
```

| 选项 | 说明 |
|------|------|
| `-s, --skill <name>` | skill 名称（远程 URL 时必需，`--all` 除外） |
| `-o, --output <dir>` | 输出目录（默认：当前目录） |
| `-f, --force` | 覆盖已有文件 |
| `--all` | 打包仓库中发现的所有 skill |
| `--no-validate` | 跳过验证 |
| `--strict` | 未知 frontmatter 字段视为错误 |
| `-v, --verbose` | 详细输出 |

打包前自动验证。静默模式（默认）下每个文件打印 `✓ Packed: {路径} ({大小})`。加 `-v` 查看详细的逐文件输出。未知 frontmatter 字段默认仅警告，加 `--strict` 则视为错误。

### `list [source]`

```bash
npx skill-packer list                          # 当前目录
npx skill-packer list ./skills                 # 指定目录
npx skill-packer list vercel-labs/agent-skills  # GitHub 简写
npx skill-packer list https://github.com/anthropics/skills --json
npx skill-packer list ./my-repo --full-depth
```

| 选项 | 说明 |
|------|------|
| `-j, --json` | JSON 格式输出 |
| `-v, --verbose` | 详细信息 |
| `--full-depth` | 搜索所有子目录（即使根目录存在 SKILL.md） |

**源格式：** 本地路径、`owner/repo[/path]`、`https://github.com/...`、`https://gitlab.com/...` 或任意 Git URL。

### `check <path>`

```bash
npx skill-packer check ./my-skill
npx skill-packer check ./my-skill --strict
```

**验证规则：**

| 字段 | 必需 | 约束 |
|------|:----:|------|
| `name` | 是 | kebab-case（`a-z`、`0-9`、`-`），最长 64 字符 |
| `description` | 是 | 最长 1024 字符，不含 `<>` |
| `license` | 否 | — |
| `compatibility` | 否 | 最长 500 字符 |
| `metadata` | 否 | — |
| `allowed-tools` | 否 | — |

未知字段 → 警告（默认）或错误（`--strict`）。

验证规则来自 [skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md) 规范。

## 开发

```bash
npm install && npm run build   # 安装 + 构建
npm test                       # 运行测试
npm run type-check             # 类型检查
```

## 许可证

MIT — 包含来自 [vercel-labs/skills](https://github.com/vercel-labs/skills) 的代码。
