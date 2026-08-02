export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const SIZE_SUFFIXES: Record<string, number> = {
  b: 1,
  k: 1024,
  kb: 1024,
  m: 1024 * 1024,
  mb: 1024 * 1024,
  g: 1024 * 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

/**
 * Parse a human-readable size string like "10mb", "1.5g", "500k", "1048576".
 * Case-insensitive. Returns bytes as a number.
 * @throws if the format is invalid or value is not positive.
 */
export function parseSize(input: string): number {
  const trimmed = input.trim().toLowerCase();
  const match = trimmed.match(/^([\d.]+)\s*(b|kb?|mb?|gb?)?$/);
  if (!match) {
    throw new Error(`Invalid size format: "${input}". Expected a number with optional suffix (b, k/kb, m/mb, g/gb).`);
  }

  const num = Number(match[1]!);
  if (isNaN(num) || num <= 0) {
    throw new Error(`Invalid size value: "${input}". Must be a positive number.`);
  }

  const suffix = match[2] || 'b';
  const multiplier = SIZE_SUFFIXES[suffix]!;
  return Math.round(num * multiplier);
}
