#!/usr/bin/env node
// Compile a Solidity contract under contracts-evm/ with solc 0.8.24.
// Usage: node deploy/evm/compile.mjs MorpheusOracleEVM
//   -> writes contracts-evm/build/<Name>.abi.json + <Name>.bin
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const name = process.argv[2];
if (!name) {
  console.error('usage: compile.mjs <ContractName>');
  process.exit(1);
}

const src = readFileSync(resolve(ROOT, `contracts-evm/${name}.sol`), 'utf8');
const solc = require('solc');

const input = {
  language: 'Solidity',
  sources: { [`${name}.sol`]: { content: src } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris', // Neo X EVM compatibility (no PUSH0 / cancun opcodes)
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter((e) => e.severity === 'error');
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const w of out.errors || []) console.warn(w.formattedMessage);

const c = out.contracts[`${name}.sol`][name];
mkdirSync(resolve(ROOT, 'contracts-evm/build'), { recursive: true });
writeFileSync(
  resolve(ROOT, `contracts-evm/build/${name}.abi.json`),
  JSON.stringify(c.abi, null, 2)
);
writeFileSync(resolve(ROOT, `contracts-evm/build/${name}.bin`), c.evm.bytecode.object);
console.log(
  `compiled ${name}: ${c.evm.bytecode.object.length / 2} bytes, ${c.abi.length} abi entries`
);
