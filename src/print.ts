import pc from 'picocolors';

let quiet = false;

export function setQuiet(q: boolean): void {
  quiet = q;
}

export function isQuiet(): boolean {
  return quiet;
}

// Color wrapper that returns plain strings in quiet mode so output stays
// machine-readable (no ANSI escape codes).
export const c = {
  dim: (s: string) => quiet ? s : pc.dim(s),
  red: (s: string) => quiet ? s : pc.red(s),
  bold: (s: string) => quiet ? s : pc.bold(s),
  green: (s: string) => quiet ? s : pc.green(s),
  yellow: (s: string) => quiet ? s : pc.yellow(s),
  cyan: (s: string) => quiet ? s : pc.cyan(s),
};

const G = {
  ok: pc.green('✓'),
  err: pc.red('✗'),
  warn: pc.yellow('⚠'),
} as const;

// --- Output functions ---

export function success(msg: string): void {
  if (quiet) {
    console.log(msg);
  } else {
    console.log(`${G.ok} ${msg}`);
  }
}

export function error(msg: string): void {
  if (quiet) {
    console.error(msg);
  } else {
    console.error(`${G.err} ${msg}`);
  }
}

export function warn(msg: string): void {
  if (quiet) {
    console.warn(msg);
  } else {
    console.warn(`${G.warn} ${msg}`);
  }
}

export function info(msg: string): void {
  if (quiet) return;
  console.log(`${pc.cyan('❕')} ${msg}`);
}

// --- Styled value wrappers ---

export function path(s: string): string {
  return quiet ? s : pc.cyan(s);
}

export function count(n: number): string {
  return quiet ? String(n) : pc.yellow(String(n));
}

export function detail(s: string): string {
  return quiet ? s : pc.dim(s);
}

export function highlight(s: string): string {
  return quiet ? s : pc.cyan(s);
}

// --- Formatting helpers ---

export function indent(n: number, text: string): string {
  return ' '.repeat(n) + text;
}

export function bullet(text: string): string {
  return quiet ? text : `  ${pc.dim('•')} ${text}`;
}

export function dimLabel(label: string): string {
  return quiet ? label : pc.dim(label);
}
