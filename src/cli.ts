#!/usr/bin/env node

import pc from 'picocolors';
import * as readline from 'readline';
import { success, error, warn, info, path, count, detail, highlight, indent, bullet, dimLabel } from './print.js';
import { readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parseSource } from './source-parser.ts';
import { listSkills } from './list.ts';
import { packSkill, formatBytes } from './pack.ts';
import { validateSkillPath } from './validate.ts';
import { discoverSkills } from './skills.ts';
import { cloneRepo, cleanupTempDir } from './git.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = getVersion();

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[38;5;102m';
const TEXT = '\x1b[38;5;145m';

const LOGO_LINES = [                               
  '▄█████ ██ ▄█▀ ██ ██     ██                 ',
  '▀▀▀▄▄▄ ████   ██ ██     ██                 ',
  '█████▀ ██ ▀█▄ ██ ██████ ██████             ',
  '                                           ',
  '█████▄ ▄████▄ ▄█████ ██ ▄█▀ ██████ █████▄  ',
  '██▄▄█▀ ██▄▄██ ██     ████   ██▄▄   ██▄▄██▄ ',
  '██     ██  ██ ▀█████ ██ ▀█▄ ██▄▄▄▄ ██   ██ ',
];

const GRAYS = [
  '\x1b[38;5;250m',
  '\x1b[38;5;248m',
  '\x1b[38;5;245m',
  '\x1b[38;5;243m',
  '\x1b[38;5;240m',
  '\x1b[38;5;238m',
];

function showLogo(): void {
  console.log();
  LOGO_LINES.forEach((line, i) => {
    console.log(`${GRAYS[i]}${line}${RESET}`);
  });
}

function showBanner(): void {
  showLogo();
  console.log();
  console.log(`${DIM}Pack skills into .skill files${RESET}`);
  console.log();
  console.log(`  ${DIM}$${RESET} ${TEXT}npx skill-packer pack ${DIM}<path>${RESET}      ${DIM}Pack a skill to .skill file${RESET}`);
  console.log(`  ${DIM}$${RESET} ${TEXT}npx skill-packer pack ${DIM}<url> --skill <name>${RESET}  ${DIM}Pack from remote${RESET}`);
  console.log(`  ${DIM}$${RESET} ${TEXT}npx skill-packer list ${DIM}<url>${RESET}       ${DIM}List skills from remote${RESET}`);
  console.log();
  console.log(`${DIM}Options:${RESET}`);
  console.log(`  ${TEXT}-o, --output <dir>${RESET}    ${DIM}Output directory${RESET}`);
  console.log(`  ${TEXT}-s, --skill <name>${RESET}    ${DIM}Skill name to pack (for URLs)${RESET}`);
  console.log(`  ${TEXT}-f, --force${RESET}          ${DIM}Overwrite existing file${RESET}`);
  console.log(`  ${TEXT}--no-validate${RESET}       ${DIM}Skip validation${RESET}`);
  console.log(`  ${TEXT}--strict${RESET}            ${DIM}Treat unknown frontmatter keys as errors${RESET}`);
  console.log(`  ${TEXT}-v, --verbose${RESET}       ${DIM}Show detailed output${RESET}`);
  console.log(`  ${TEXT}-j, --json${RESET}           ${DIM}Output as JSON${RESET}`);
  console.log(`  ${TEXT}--full-depth${RESET}         ${DIM}Search all subdirectories${RESET}`);
  console.log(`  ${TEXT}-a, --all${RESET}                ${DIM}Pack all discovered skills${RESET}`);
  console.log();
}

function showHelp(): void {
  console.log(`
${BOLD}Usage:${RESET} skill-packer <command> [options]

${BOLD}Commands:${RESET}
  pack <source>          Pack a skill directory to .skill file
  list [source]          List skills in a repository or directory
  check <path>           Validate a skill directory

${BOLD}Pack Options:${RESET}
  -o, --output <dir>     Output directory (default: current directory)
  -s, --skill <name>     Skill name to pack (required for remote URLs)
  -f, --force            Overwrite existing .skill file
  --no-validate         Skip validation before packing
  --strict               Treat unknown frontmatter keys as errors
  -a, --all               Pack all discovered skills in the repository
  -v, --verbose          Show detailed output

${BOLD}Check Options:${RESET}
  --strict               Treat unknown frontmatter keys as errors

${BOLD}List Options:${RESET}
  -j, --json             Output as JSON
  -v, --verbose          Show detailed information
  --full-depth           Search all subdirectories even with root SKILL.md

${BOLD}Source Formats:${RESET}
  Local path:            ./path/to/skill or /absolute/path
  GitHub shorthand:      owner/repo or owner/repo/path/to/skill
  GitHub URL:            https://github.com/owner/repo
  GitLab URL:            https://gitlab.com/owner/repo
  Git URL:               https://any-git-host.com/repo.git

${BOLD}Examples:${RESET}
  ${DIM}# Pack a local skill${RESET}
  ${TEXT}npx skill-packer pack ./my-skill${RESET}
  
  ${DIM}# Pack a skill from GitHub${RESET}
  ${TEXT}npx skill-packer pack https://github.com/anthropics/skills --skill skill-creator${RESET}
  
  ${DIM}# Pack and specify output directory${RESET}
  ${TEXT}npx skill-packer pack ./my-skill -o ./dist${RESET}
  
  ${DIM}# List skills in a GitHub repository${RESET}
  ${TEXT}npx skill-packer list vercel-labs/agent-skills${RESET}
  
  ${DIM}# List skills from GitHub URL${RESET}
  ${TEXT}npx skill-packer list https://github.com/anthropics/skills${RESET}
  
  ${DIM}# List skills locally${RESET}
  ${TEXT}npx skill-packer list ./skills${RESET}
  
  ${DIM}# Check skill validity${RESET}
  ${TEXT}npx skill-packer check ./my-skill${RESET}
`);
}

export async function runPack(args: string[]): Promise<void> {
  if (args.length === 0 || args[0]?.startsWith('-')) {
    error('Missing source');
    console.log('Usage: skill-packer pack <source> [options]');
    console.log('       skill-packer pack <url> --skill <name> [options]');
    process.exit(1);
  }

  const source = args[0]!;
  const restArgs = args.slice(1);

  let outputDir: string | undefined;
  let skillFilter: string | undefined;
  let force = false;
  let validate = true;
  let verbose = false;
  let strict = false;
  let all = false;

  for (let i = 0; i < restArgs.length; i++) {
    const arg = restArgs[i];
    if (arg === '-o' || arg === '--output') {
      const val = restArgs[++i];
      if (!val || val.startsWith('-')) {
        error('--output requires a directory path');
        process.exit(1);
      }
      outputDir = val;
    } else if (arg === '-s' || arg === '--skill') {
      const val = restArgs[++i];
      if (!val || val.startsWith('-')) {
        error('--skill requires a skill name');
        process.exit(1);
      }
      skillFilter = val;
    } else if (arg === '-f' || arg === '--force') {
      force = true;
    } else if (arg === '--no-validate') {
      validate = false;
    } else if (arg === '-v' || arg === '--verbose') {
      verbose = true;
    } else if (arg === '--strict') {
      strict = true;
    } else if (arg === '--all' || arg === '-a') {
      all = true;
    }
  }

  let tempDir: string | null = null;
  let skillPath: string;

  try {
    const parsed = parseSource(source);

    if (parsed.type === 'local') {
      skillPath = parsed.localPath!;
    } else {
      info(`Cloning ${parsed.url}...`);
      tempDir = await cloneRepo(parsed.url, parsed.ref);
      skillPath = tempDir;

      if (parsed.subpath) {
        skillPath = join(skillPath, parsed.subpath);
      }
    }

    if (!skillFilter && parsed.skillFilter) {
      skillFilter = parsed.skillFilter;
    }

    if (skillFilter) {
      if (verbose) {
        info(`Finding skill: ${highlight(skillFilter)}`);
      }
      const skills = await discoverSkills(skillPath);
      
      if (skills.length === 0) {
        error('No skills found in repository');
        process.exit(1);
      }

      const match = skills.find(s => s.name === skillFilter);
      if (!match) {
        error(`Skill "${skillFilter}" not found`);
        console.log(pc.dim(`Available skills: ${skills.map(s => s.name).join(', ')}`));
        process.exit(1);
      }

      skillPath = match.path;

      if (verbose) {
        success(`Found: ${path(skillPath)}\n`);
      }
    }

    if (all && !skillFilter) {
      if (verbose) {
        info('Packing all skills...');
      }
      const skills = await discoverSkills(skillPath, undefined, { fullDepth: true });

      if (skills.length === 0) {
        error('No skills found');
        process.exit(1);
      }

      if (verbose) {
        info(`Found ${count(skills.length)} skill${skills.length !== 1 ? 's' : ''}\n`);
      }

      let succeeded = 0;
      const failures: Array<{ name: string; message: string }> = [];

      for (const skill of skills) {
        try {
          const result = await packSkill({
            skillPath: skill.path,
            outputPath: outputDir,
            force,
            validate,
            verbose,
            strict,
          });

          succeeded++;
          if (!verbose) {
            success(`Packed: ${path(result.outputPath)} (${formatBytes(result.size)})`);
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          failures.push({ name: skill.name, message });
          error(`Failed: ${skill.name} (${message})`);
        }
      }

      const failureCount = failures.length;
      const summary = failureCount > 0
        ? `${count(succeeded)} succeeded, ${pc.red(`${failureCount} failed`)}`
        : `${count(succeeded)} succeeded, ${count(failureCount)} failed`;
      console.log(summary);

      if (failureCount > 0) {
        process.exit(1);
      }

      return; // Skip the single-pack path below
    }

    // No --skill and no --all for a remote source: discover and let user pick interactively
    if (!skillFilter && parsed.type !== 'local') {
      const skills = await discoverSkills(skillPath, undefined, { fullDepth: true });

      if (skills.length === 0) {
        error('No skills found');
        process.exit(1);
      }

      if (skills.length === 1) {
        const result = await packSkill({
          skillPath: skills[0]!.path,
          outputPath: outputDir,
          force,
          validate,
          verbose,
          strict,
        });

        if (!verbose) {
          success(`Packed: ${path(result.outputPath)} (${formatBytes(result.size)})`);
        }
        return;
      }

      // Multiple skills: interactive prompt (or error in non-TTY environments)
      if (!process.stdin.isTTY) {
        error('Multiple skills found. Use --skill or --all to select.');
        console.log(pc.dim(`Available: ${skills.map(s => s.name).join(', ')}`));
        process.exit(1);
      }

      // Interactive: list skills and confirm pack all
      console.log(`\n${pc.bold('Skills found')}:`);
      for (const skill of skills) {
        console.log(`  ${pc.green('•')} ${pc.bold(skill.name)} ${pc.dim(`(${skill.pluginName || 'standalone'})`)}`);
      }

      const confirmed = await new Promise<boolean>((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`\n${pc.bold(`Pack all ${skills.length} skills?`)} ${pc.dim('[y/N]')} `, (answer) => {
          rl.close();
          resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
        });
      });

      if (!confirmed) {
        console.log(pc.dim('Cancelled'));
        process.exit(0);
      }

      for (const skill of skills) {
        const result = await packSkill({
          skillPath: skill.path,
          outputPath: outputDir,
          force,
          validate,
          verbose,
          strict,
        });

        if (!verbose) {
          success(`Packed: ${path(result.outputPath)} (${formatBytes(result.size)})`);
        }
      }

      return;
    }

    // --skill path: pack the resolved single skill
    const result = await packSkill({
      skillPath,
      outputPath: outputDir,
      force,
      validate,
      verbose,
      strict,
    });

    if (!verbose) {
      success(`Packed: ${path(result.outputPath)} (${formatBytes(result.size)})`);
    }

  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    error(message);
    process.exit(1);
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
}

export async function runList(args: string[]): Promise<void> {
  const restArgs = args;
  
  let source: string | undefined;
  let json = false;
  let verbose = false;
  let fullDepth = false;

  for (let i = 0; i < restArgs.length; i++) {
    const arg = restArgs[i];
    if (arg?.startsWith('-')) {
      if (arg === '-j' || arg === '--json') {
        json = true;
      } else if (arg === '-v' || arg === '--verbose') {
        verbose = true;
      } else if (arg === '--full-depth') {
        fullDepth = true;
      } else if (arg === '--all' || arg === '-a') {
        // supported for consistency, same as --full-depth
        fullDepth = true;
      }
    } else {
      source = arg;
    }
  }

  try {
    await listSkills({ source, json, verbose, fullDepth });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    error(message);
    process.exit(1);
  }
}

export async function runCheck(args: string[]): Promise<void> {
  let strict = false;
  let skillPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--strict') {
      strict = true;
    } else if (!arg!.startsWith('-')) {
      skillPath = arg;
    }
  }

  if (!skillPath) {
    error('Missing skill path');
    console.log('Usage: skill-packer check <path> [--strict]');
    process.exit(1);
  }

  info(`Validating skill: ${path(skillPath)}${strict ? ' ' + detail('(strict mode)') : ''}\n`);

  try {
    const result = await validateSkillPath(skillPath, { strict });
    
    if (result.valid) {
      if (result.warnings.length > 0) {
        warn('Skill is valid with warnings:\n');
        for (const warning of result.warnings) {
          console.warn(bullet(warning));
        }
        console.log();
      }
      success('Skill is valid!\n');
      process.exit(0);
    } else {
      error('Validation failed:\n');
      for (const error of result.errors) {
        console.error(bullet(error));
      }
      if (result.warnings.length > 0) {
        warn('\nWarnings:');
        for (const warning of result.warnings) {
          console.warn(bullet(warning));
        }
      }
      console.log();
      process.exit(1);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    error(message);
    process.exit(1);
  }
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isPackAlias = process.env.__SKILL_PACKER_DEFAULT === 'pack';

  if (args.length === 0) {
    if (isPackAlias) {
      console.log(`${BOLD}pack-skill${RESET} ${DIM}— pack skills into .skill files${RESET}\n`);
      console.log(`Usage: ${TEXT}pack-skill <source> [options]${RESET}`);
      console.log(`Run ${BOLD}pack-skill --help${RESET} for details.`);
    } else {
      showBanner();
    }
    return;
  }

  const command = isPackAlias ? 'pack' : args[0];
  const restArgs = isPackAlias ? args : args.slice(1);

  // Handle --help/--version for pack-skill alias
  if (isPackAlias) {
    if (args[0] === '--help' || args[0] === '-h') {
      showHelp();
      return;
    }
    if (args[0] === '--version' || args[0] === '-v') {
      console.log(VERSION);
      return;
    }
  }

  switch (command) {
    case 'pack':
      if (!isPackAlias) {
        showLogo();
        console.log();
      }
      await runPack(restArgs);
      break;
    case 'list':
    case 'ls':
      showLogo();
      console.log();
      await runList(restArgs);
      break;
    case 'check':
    case 'validate':
      showLogo();
      console.log();
      await runCheck(restArgs);
      break;
    case '--help':
    case '-h':
      showHelp();
      break;
    case '--version':
    case '-v':
      console.log(VERSION);
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log(`Run ${BOLD}skill-packer --help${RESET} for usage.`);
      process.exit(1);
  }
}

// main() is called explicitly by bin entry points (bin/cli.mjs, bin/pack-skill.mjs)
// This avoids relying on process.argv[1] which varies by package manager
// (e.g. npm symlinks vs pnpm wrappers vs bun shims)