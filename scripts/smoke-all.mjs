import { spawn } from 'node:child_process';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function runNodeScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

const shouldRunN3 = Boolean(trimString(process.env.CONTRACT_MORPHEUS_ORACLE_HASH) && trimString(process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_HASH) && trimString(process.env.NEO_TESTNET_WIF));
const shouldRunNeoX = Boolean(trimString(process.env.CONTRACT_MORPHEUS_ORACLE_X_ADDRESS) && trimString(process.env.CONTRACT_ORACLE_CALLBACK_CONSUMER_X_ADDRESS) && trimString(process.env.NEOX_PRIVATE_KEY || process.env.PHALA_NEOX_PRIVATE_KEY));

const summary = {
  neo_n3: null,
  neo_x: null,
};

if (shouldRunN3) {
  summary.neo_n3 = await runNodeScript('scripts/smoke-oracle-n3.mjs');
}
if (shouldRunNeoX) {
  summary.neo_x = await runNodeScript('scripts/smoke-oracle-neox.mjs');
}

console.log(JSON.stringify(summary, null, 2));

if ((summary.neo_n3 && summary.neo_n3.code !== 0) || (summary.neo_x && summary.neo_x.code !== 0)) {
  process.exitCode = 1;
}
