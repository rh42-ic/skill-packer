> [English](README.md) | [简体中文](README.zh.md)

# skill-packer

一个用于下载和打包 skills 为 `.skill` 文件的命令行工具。

## 安装

```bash
npx skill-packer <command> [options]
```

## 命令

### `pack <source>`

将 skill 目录打包为 `.skill` 文件（zip 格式压缩包）。

```bash
# 打包本地 skill
npx skill-packer pack ./my-skill

# 从远程仓库打包
npx skill-packer pack https://github.com/anthropics/skills --skill skill-creator

# 使用 GitHub 简写并指定 skill
npx skill-packer pack anthropics/skills --skill skill-creator

# 指定输出目录
npx skill-packer pack ./my-skill -o ./dist

# 覆盖已存在的文件
npx skill-packer pack ./my-skill --force

# 跳过验证
npx skill-packer pack ./my-skill --no-validate
```

**选项：**
- `-s, --skill <name>` - 要打包的 skill 名称（远程 URL 时必需）
- `-o, --output <dir>` - 输出目录（默认：当前目录）
- `-f, --force` - 覆盖已存在的文件
- `--no-validate` - 打包前跳过验证
- `-v, --verbose` - 显示详细输出

### `list [source]`

列出仓库或目录中的 skills。

```bash
# 列出当前目录的 skills
npx skill-packer list

# 列出指定目录的 skills
npx skill-packer list ./skills

# 列出 GitHub 简写仓库的 skills
npx skill-packer list vercel-labs/agent-skills

# 列出 GitHub URL 仓库的 skills
npx skill-packer list https://github.com/anthropics/skills

# 列出 GitHub 仓库指定路径的 skills
npx skill-packer list vercel-labs/agent-skills/skills

# JSON 格式输出
npx skill-packer list vercel-labs/agent-skills --json

# 搜索所有子目录
npx skill-packer list ./my-repo --full-depth
```

**支持的源格式：**
- 本地路径：`./path/to/skill` 或 `/absolute/path`
- GitHub 简写：`owner/repo` 或 `owner/repo/path/to/skill`
- GitHub URL：`https://github.com/owner/repo`
- GitLab URL：`https://gitlab.com/owner/repo`
- Git URL：`https://any-git-host.com/repo.git`

**选项：**
- `-j, --json` - 以 JSON 格式输出
- `-v, --verbose` - 显示详细信息
- `--full-depth` - 搜索所有子目录（即使根目录存在 SKILL.md）

### `check <path>`

验证 skill 目录格式。

```bash
npx skill-packer check ./my-skill
```

### 验证规则

- **name**（必需）：kebab-case 格式，小写字母/数字/连字符，最长 64 个字符
- **description**（必需）：最长 1024 个字符，不能包含尖括号
- **license**, **compatibility**, **metadata**, **allowed-tools**（可选）

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 本地运行
node bin/cli.mjs --help

# 类型检查
npm run type-check

# 运行测试
npm test
```

## 致敬

This project incorporates code from [vercel-labs/skills](https://github.com/vercel-labs/skills) licensed under the MIT License.

## 许可证

MIT
