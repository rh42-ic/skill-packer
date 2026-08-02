export const SKIP_DIRS = ['node_modules', '__pycache__', '.git', 'dist', 'build', 'evals'];

export const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

export const SKIP_GLOBS = ['*.pyc', '*.pyo', '.env', '.env.local'];

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$');
}

export const SKIP_GLOB_REGEXPS = SKIP_GLOBS.map(globToRegex);
