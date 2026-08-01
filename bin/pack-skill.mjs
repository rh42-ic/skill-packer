#!/usr/bin/env node

import module from 'node:module';

if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Ignore errors
  }
}

process.env.__SKILL_PACKER_DEFAULT = 'pack';
await import('../dist/cli.mjs');
