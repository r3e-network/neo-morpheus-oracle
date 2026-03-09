const vm = require('node:vm');
const { parentPort, workerData } = require('node:worker_threads');

async function run() {
  const { mode, script, entryPoint, input, data, context, timeoutMs } = workerData;
  const helpers = {
    getCurrentTimestamp: () => Math.floor(Date.now() / 1000),
    base64Decode: (value) => Buffer.from(String(value || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  };

  if (mode === 'oracle') {
    const sandbox = { data, context, helpers, __result: undefined };
    vm.createContext(sandbox);
    const compiled = new vm.Script(
      `${script}\nif (typeof process !== 'function') throw new Error('script must define process(data, context, helpers)');\n__result = process(data, context, helpers);`,
    );
    compiled.runInContext(sandbox, { timeout: timeoutMs });
    return await Promise.resolve(sandbox.__result);
  }

  const sandbox = { input, helpers, __result: undefined };
  vm.createContext(sandbox);
  const compiled = new vm.Script(
    `${script}\nconst __target = typeof ${entryPoint} === 'function' ? ${entryPoint} : (typeof process === 'function' ? process : null);\nif (!__target) throw new Error('entry point not found');\n__result = __target(input, helpers);`,
  );
  compiled.runInContext(sandbox, { timeout: timeoutMs });
  return await Promise.resolve(sandbox.__result);
}

Promise.resolve()
  .then(run)
  .then((result) => parentPort.postMessage({ ok: true, result }))
  .catch((error) => parentPort.postMessage({ ok: false, error: { message: error?.message || String(error), stack: error?.stack || null } }));
