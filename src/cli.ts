#!/usr/bin/env node

import pc from 'picocolors';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseSource } from './source-parser.ts';
import { listSkills } from './list.ts';
import { packSkill } from './pack.ts';
import { validateSkillPath } from './validate.ts';

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
  '███████╗██╗  ██╗██╗██╗     ██╗     ███████╗',
  '██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝',
  '███████╗█████╔╝ ██║██║     ██║     ███████╗',
  '╚════██║██╔═██╗ ██║██║     ██║     ╚════██║',
  '███████║██║  ██╗██║███████╗███████╗███████║',
  '╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝',
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
  console.log(`  ${DIM}$${RESET} ${TEXT}npx skill-packer list ${DIM}[source]${RESET}     ${DIM}List skills in source${RESET}`);
  console.log();
  console.log(`${DIM}Options:${RESET}`);
  console.log(`  ${TEXT}-o, --output <dir>${RESET}    ${DIM}Output directory${RESET}`);
  console.log(`  ${TEXT}-f, --force${RESET}          ${DIM}Overwrite existing file${RESET}`);
  console.log(`  ${TEXT}--no-validate${RESET}       ${DIM}Skip validation${RESET}`);
  console.log(`  ${TEXT}-v, --verbose${RESET}       ${DIM}Show detailed output${RESET}`);
  console.log(`  ${TEXT}-j, --json${RESET}           ${DIM}Output as JSON${RESET}`);
  console.log(`  ${TEXT}--full-depth${RESET}         ${DIM}Search all subdirectories${RESET}`);
  console.log();
}

function showHelp(): void {
  console.log(`
${BOLD}Usage:${RESET} skill-packer <command> [options]

${BOLD}Commands:${RESET}
  pack <path>           Pack a skill directory to .skill file
  list [source]         List skills in a repository or directory
  check <path>          Validate a skill directory

${BOLD}Pack Options:${RESET}
  -o, --output <dir>     Output directory (default: current directory)
  -f, --force            Overwrite existing .skill file
  --no-validate         Skip validation before packing
  -v, --verbose          Show detailed output

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
  
  ${DIM}# Pack and specify output directory${RESET}
  ${TEXT}npx skill-packer pack ./my-skill -o ./dist${RESET}
  
  ${DIM}# List skills in a repository${RESET}
  ${TEXT}npx skill-packer list vercel-labs/agent-skills${RESET}
  
  ${DIM}# List skills locally${RESET}
  ${TEXT}npx skill-packer list ./skills${RESET}
  
  ${DIM}# Check skill validity${RESET}
  ${TEXT}npx skill-packer check ./my-skill${RESET}
`);
}

async function runPack(args: string[]): Promise<void> {
  if (args.length === 0 || args[0]?.startsWith('-')) {
    console.log(pc.red('Error: Missing skill path'));
    console.log('Usage: skill-packer pack <path> [options]');
    process.exit(1);
  }

  const skillPath = args[0]!;
  const restArgs = args.slice(1);

  let outputDir: string | undefined;
  let force = false;
  let validate = true;
  let verbose = true;

  for (let i = 0; i < restArgs.length; i++) {
    const arg = restArgs[i];
    if (arg === '-o' || arg === '--output') {
      outputDir = restArgs[++i];
    } else if (arg === '-f' || arg === '--force') {
      force = true;
    } else if (arg === '--no-validate') {
      validate = false;
    } else if (arg === '-v' || arg === '--verbose') {
      verbose = true;
    }
  }

  try {
    const result = await packSkill({
      skillPath,
      outputPath: outputDir,
      force,
      validate,
      verbose,
    });
    process.exit(0);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    if (message.includes('File already exists')) {
      console.log(pc.red(`Error: ${message}`));
    } else {
      console.log(pc.red(`Error: ${message}`));
    }
    process.exit(1);
  }
}

async function runList(args: string[]): Promise<void> {
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
      }
    } else {
      source = arg;
    }
  }

  try {
    await listSkills({ source, json, verbose, fullDepth });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.log(pc.red(`Error: ${message}`));
    process.exit(1);
  }
}

async function runCheck(args: string[]): Promise<void> {
  if (args.length === 0 || args[0]?.startsWith('-')) {
    console.log(pc.red('Error: Missing skill path'));
    console.log('Usage: skill-packer check <path>');
    process.exit(1);
  }

  const skillPath = args[0]!;

  console.log(`${pc.cyan('🔍')} Validating skill: ${pc.yellow(skillPath)}\n`);

  try {
    const result = await validateSkillPath(skillPath);
    
    if (result.valid) {
      console.log(`${pc.green('✓')} Skill is valid!\n`);
      process.exit(0);
    } else {
      console.log(`${pc.red('✗')} Validation failed:\n`);
      for (const error of result.errors) {
        console.log(`  ${pc.red('•')} ${error}`);
      }
      process.exit(1);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.log(pc.red(`Error: ${message}`));
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showBanner();
    return;
  }

  const command = args[0];
  const restArgs = args.slice(1);

  switch (command) {
    case 'pack':
      showLogo();
      console.log();
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

main();