import pc from 'picocolors';

const G = {
  ok: pc.green('✓'),
  err: pc.red('✗'),
  warn: pc.yellow('⚠'),
} as const;

// --- Output functions ---

export function success(msg: string): void {
  console.log(`${G.ok} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${G.err} ${msg}`);
}

export function warn(msg: string): void {
  console.warn(`${G.warn} ${msg}`);
}

export function info(msg: string): void {
  console.log(`${pc.cyan('ℹ')} ${msg}`);
}

// --- Styled value wrappers ---

export function path(s: string): string {
  return pc.cyan(s);
}

export function count(n: number): string {
  return pc.yellow(String(n));
}

export function detail(s: string): string {
  return pc.dim(s);
}

export function highlight(s: string): string {
  return pc.cyan(s);
}

// --- Formatting helpers ---

export function indent(n: number, text: string): string {
  return ' '.repeat(n) + text;
}

export function bullet(text: string): string {
  return `  ${pc.dim('•')} ${text}`;
}

export function dimLabel(label: string): string {
  return pc.dim(label);
}
