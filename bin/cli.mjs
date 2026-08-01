#!/usr/bin/env node

import module from 'node:module';

if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Ignore errors
  }
}

const { main } = await import('../dist/cli.mjs');
main().catch((err) => {
  const message = err instanceof Error ? err.message : 'Unknown error';
  console.error(`Fatal: ${message}`);
  process.exit(1);
});