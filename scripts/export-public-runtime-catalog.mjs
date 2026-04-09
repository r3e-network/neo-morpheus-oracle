#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { loadPublicRuntimeCatalog } from './lib-public-runtime-catalog.mjs';

function parseArgs(argv) {
  let outputFile = '';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') {
      outputFile = argv[index + 1] || '';
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { outputFile };
}

function main() {
  const { outputFile } = parseArgs(process.argv.slice(2));
  const catalog = loadPublicRuntimeCatalog();
  const serialized = JSON.stringify(catalog, null, 2) + '\n';

  if (outputFile) {
    fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true });
    fs.writeFileSync(path.resolve(outputFile), serialized, 'utf8');
  }

  process.stdout.write(serialized);
}

main();
