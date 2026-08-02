#!/usr/bin/env node

import { c as pc, setQuiet, isQuiet } from './print.js';
import * as readline from 'readline';
import { success, error, warn, info, path, count, detail, highlight, indent, bullet, dimLabel } from './print.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parseSource, getOwnerRepo } from './source-parser.ts';
import { listSkills } from './list.ts';
import { packSkill, formatBytes } from './pack.ts';
import { validateSkillPath } from './validate.ts';
import { discoverSkills, filterSkills } from './skills.ts';
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
  '', // blank separator line between logo halves
  '\x1b[38;5;243m',
  '\x1b[38;5;240m',
  '\x1b[38;5;238m',
];

function showLogo(): void {
  console.log();
  LOGO_LINES.forEach((line, i) => {
    console.log(`${GRAYS[i]}${line}`);
  });
}

function showBanner(): void {
  showLogo();
  console.log();
  console.log(pc.dim('Pack skills into .skill files'));
  console.log();
  console.log(`  ${pc.dim('$')} ${pc.dim('npx skill-packer pack <path>')}      ${pc.dim('Pack a skill to .skill file')}`);
  console.log(`  ${pc.dim('$')} ${pc.dim('npx skill-packer pack <url> --skill <name>')}  ${pc.dim('Pack from remote')}`);
  console.log(`  ${pc.dim('$')} ${pc.dim('npx skill-packer list <url>')}       ${pc.dim('List skills from remote')}`);
  console.log();
  console.log(pc.dim('Options:'));
  console.log(`  ${pc.dim('-o, --output <dir>')}    ${pc.dim('Output directory')}`);
  console.log(`  ${pc.dim('-s, --skill <name>')}    ${pc.dim('Skill name to pack (for URLs)')}`);
  console.log(`  ${pc.dim('-f, --force')}          ${pc.dim('Overwrite existing file')}`);
  console.log(`  ${pc.dim('--no-validate')}       ${pc.dim('Skip validation')}`);
  console.log(`  ${pc.dim('--strict')}            ${pc.dim('Treat unknown frontmatter keys as errors')}`);
  console.log(`  ${pc.dim('-v, --verbose')}       ${pc.dim('Show detailed output')}`);
  console.log(`  ${pc.dim('-j, --json')}           ${pc.dim('Output as JSON')}`);
  console.log(`  ${pc.dim('--full-depth')}         ${pc.dim('Search all subdirectories')}`);
  console.log(`  ${pc.dim('-a, --all')}                ${pc.dim('Pack all discovered skills')}`);
  console.log();
}

function showHelp(): void {
  console.log(`
${pc.bold('Usage:')} skill-packer <command> [options]

${pc.bold('Commands:')}
  pack <source>          Pack a skill directory to .skill file
  list [source]          List skills in a repository or directory
  check <path>           Validate a skill directory

${pc.bold('Pack Options:')}
  -o, --output <dir>     Output directory (default: current directory)
  -s, --skill <name>     Skill name to pack (required for remote URLs)
  -f, --force            Overwrite existing .skill file
  --no-validate         Skip validation before packing
  --strict               Treat unknown frontmatter keys as errors
  -a, --all               Pack all discovered skills in the repository
  -v, --verbose          Show detailed output

${pc.bold('Check Options:')}
  --strict               Treat unknown frontmatter keys as errors

${pc.bold('List Options:')}
  -j, --json             Output as JSON
  -v, --verbose          Show detailed information
  --full-depth           Search all subdirectories even with root SKILL.md

${pc.bold('Source Formats:')}
  Local path:            ./path/to/skill or /absolute/path
  GitHub shorthand:      owner/repo or owner/repo/path/to/skill
  GitHub URL:            https://github.com/owner/repo
  GitLab URL:            https://gitlab.com/owner/repo
  Git URL:               https://any-git-host.com/repo.git

${pc.bold('Examples:')}
  ${pc.dim('# Pack a local skill')}
  ${pc.dim('npx skill-packer pack ./my-skill')}
  
  ${pc.dim('# Pack a skill from GitHub')}
  ${pc.dim('npx skill-packer pack https://github.com/anthropics/skills --skill skill-creator')}
  
  ${pc.dim('# Pack and specify output directory')}
  ${pc.dim('npx skill-packer pack ./my-skill -o ./dist')}
  
  ${pc.dim('# List skills in a GitHub repository')}
  ${pc.dim('npx skill-packer list vercel-labs/agent-skills')}
  
  ${pc.dim('# List skills from GitHub URL')}
  ${pc.dim('npx skill-packer list https://github.com/anthropics/skills')}
  
  ${pc.dim('# List skills locally')}
  ${pc.dim('npx skill-packer list ./skills')}
  
  ${pc.dim('# Check skill validity')}
  ${pc.dim('npx skill-packer check ./my-skill')}
`);
}

export async function runPack(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return;
  }

  if (args.length === 0 || args[0]?.startsWith('-')) {
    error('Missing source');
    if (!isQuiet()) {
      console.log('Usage: skill-packer pack <source> [options]');
      console.log('       skill-packer pack <url> --skill <name> [options]');
    }
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
  let quiet = false;

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
    } else if (arg === '-q' || arg === '--quiet') {
      quiet = true;
    }
  }

  setQuiet(quiet);
  // In quiet mode, verbose detail output is disabled too so stdout stays
  // machine-readable (pack.ts already gates its listing on `if (verbose)`).
  if (quiet) {
    verbose = false;
  }

  let tempDir: string | null = null;
  let skillPath: string;

  try {
    const parsed = parseSource(source);

    if (parsed.type === 'local') {
      skillPath = parsed.localPath!;
    } else {
      const displayName = getOwnerRepo(parsed) || parsed.url;
      info(`Cloning ${displayName}...`);
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

      const matches = filterSkills(skills, [skillFilter]);
      let match = matches.length > 0 ? matches[0]! : undefined;
      if (matches.length > 1) {
        const exact = matches.find(s => s.name === skillFilter);
        if (exact) {
          match = exact;
        }
      }
      if (!match) {
        error(`Skill "${skillFilter}" not found`);
        if (!isQuiet()) {
          console.log(pc.dim(`Available skills: ${skills.map(s => s.name).join(', ')}`));
        }
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
            onConflict: 'skip',
          });

          if (result.skipped) {
            if (isQuiet()) {
              console.error('SKIPPED:', result.outputPath);
            } else {
              warn(`Skipped: ${skill.name} (${result.skipReason || 'File already exists'})`);
            }
            continue;
          }

          succeeded++;
          if (isQuiet()) {
            console.log(result.outputPath);
          } else if (!verbose) {
            success(`Packed: ${path(result.outputPath)} (${formatBytes(result.size)})`);
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          failures.push({ name: skill.name, message });
          error(`Failed: ${skill.name} (${message})`);
        }
      }

      const failureCount = failures.length;
      if (!isQuiet()) {
        const summary = failureCount > 0
          ? `${count(succeeded)} succeeded, ${pc.red(`${failureCount} failed`)}`
          : `${count(succeeded)} succeeded, 0 failed`;
        console.log(summary);
      }

      if (failureCount > 0) {
        process.exit(1);
      }

      return; // Skip the single-pack path below
    }

    // No --skill and no --all: discover skills and let user pick interactively.
    // Local directories with a root SKILL.md are packed directly (so validation
    // still applies); everything else (remote sources, or local dirs that only
    // contain nested skills) is discovered first.
    const shouldDiscover = parsed.type !== 'local' || !existsSync(join(skillPath, 'SKILL.md'));
    if (!skillFilter && shouldDiscover) {
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

        if (isQuiet()) {
          console.log(result.outputPath);
        } else if (!verbose) {
          success(`Packed: ${path(result.outputPath)} (${formatBytes(result.size)})`);
        }
        return;
      }

      // Multiple skills: -q implies --all, non-TTY requires explicit flags
      if (isQuiet()) {
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
              onConflict: 'skip',
            });
            if (result.skipped) {
              console.error('SKIPPED:', result.outputPath);
              continue;
            }
            succeeded++;
            console.log(result.outputPath);
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            failures.push({ name: skill.name, message });
            error(`Failed: ${skill.name} (${message})`);
          }
        }
        if (failures.length > 0) process.exit(1);
        return;
      }

      if (!process.stdin.isTTY) {
        error('Multiple skills found. Use --skill or --all to select.');
        if (!isQuiet()) {
          console.log(pc.dim(`Available: ${skills.map(s => s.name).join(', ')}`));
        }
        process.exit(1);
      }

      // Interactive: list skills and confirm pack all
      const effectiveOutputDir = outputDir || process.cwd();
      const existingOutputs = new Map<string, boolean>(
        skills.map(skill => [skill.name, existsSync(join(effectiveOutputDir, `${basename(skill.path)}.skill`))])
      );

      console.log(`\n${pc.bold('Skills found')}:`);
      for (const skill of skills) {
        const marker = existingOutputs.get(skill.name) ? pc.yellow(' ⚠') + pc.dim(' (exists)') : '';
        console.log(`  ${pc.green('•')} ${pc.bold(skill.name)} ${pc.dim(`(${skill.pluginName || 'standalone'})`)}${marker}`);
      }

      if (existingOutputs.size > 0 && [...existingOutputs.values()].some(v => v)) {
        console.log(pc.dim('\n⚠ = output file already exists, will be skipped (use --force to overwrite)'));
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
        try {
          const result = await packSkill({
            skillPath: skill.path,
            outputPath: outputDir,
            force,
            validate,
            verbose,
            strict,
            onConflict: 'skip',
          });

          if (result.skipped) {
            warn(`Skipped: ${skill.name} (${result.skipReason || 'File already exists'})`);
            continue;
          }

          if (!verbose) {
            success(`Packed: ${path(result.outputPath)} (${formatBytes(result.size)})`);
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          error(`Failed: ${skill.name} (${message})`);
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

    if (isQuiet()) {
      console.log(result.outputPath);
    } else if (!verbose) {
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
  let quiet = false;

  for (let i = 0; i < restArgs.length; i++) {
    const arg = restArgs[i];
    if (arg?.startsWith('-')) {
      if (arg === '-j' || arg === '--json') {
        json = true;
      } else if (arg === '-q' || arg === '--quiet') {
        quiet = true;
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

  if (quiet && json) {
    error('--quiet and --json are mutually exclusive');
    process.exit(1);
  }

  setQuiet(quiet);

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
    } else if (!arg?.startsWith('-')) {
      skillPath = arg;
    }
  }

  if (!skillPath) {
    error('Missing skill path');
    if (!isQuiet()) {
      console.log('Usage: skill-packer check <path> [--strict]');
    }
    process.exit(1);
  }

  info(`Validating skill: ${path(skillPath)}${strict ? ' ' + detail('(strict mode)') : ''}\n`);

  try {
    const result = await validateSkillPath(skillPath, { strict });
    
    if (result.valid) {
      if (result.warnings.length > 0) {
        warn('Skill is valid with warnings:\n');
        for (const warning of result.warnings) {
          warn(bullet(warning));
        }
        if (!isQuiet()) console.log();
      }
      success('Skill is valid!\n');
      process.exit(0);
    } else {
      error('Validation failed:\n');
      for (const err of result.errors) {
        error(bullet(err));
      }
      if (result.warnings.length > 0) {
        warn('\nWarnings:');
        for (const warning of result.warnings) {
          warn(bullet(warning));
        }
      }
      if (!isQuiet()) console.log();
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
      console.log(`${pc.bold('pack-skill')} ${pc.dim('— pack skills into .skill files')}\n`);
      console.log(`Usage: ${pc.dim('pack-skill <source> [options]')}`);
      console.log(`Run ${pc.bold('pack-skill --help')} for details.`);
    } else {
      showBanner();
    }
    return;
  }

  const command = isPackAlias ? 'pack' : args[0];
  const restArgs = isPackAlias ? args : args.slice(1);

  // Quiet mode: enable early so main() can skip decorative output (logo)
  if (restArgs.includes('-q') || restArgs.includes('--quiet')) {
    setQuiet(true);
  }

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
      if (!isPackAlias && !isQuiet()) {
        showLogo();
        console.log();
      }
      await runPack(restArgs);
      break;
    case 'list':
    case 'ls':
      if (!isQuiet()) {
        showLogo();
        console.log();
      }
      await runList(restArgs);
      break;
    case 'check':
    case 'validate':
      if (!isQuiet()) {
        showLogo();
        console.log();
      }
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
      error(`Unknown command: ${command}`);
      if (!isQuiet()) {
        console.log(`Run ${pc.bold('skill-packer --help')} for usage.`);
      }
      process.exit(1);
  }
}

// main() is called explicitly by bin entry points (bin/cli.mjs, bin/pack-skill.mjs)
// This avoids relying on process.argv[1] which varies by package manager
// (e.g. npm symlinks vs pnpm wrappers vs bun shims)