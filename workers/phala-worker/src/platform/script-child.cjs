const vm = require("node:vm");

function normalizeError(error) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

async function run(workerData) {
  const { mode, script, entryPoint, input, data, context, timeoutMs } = workerData;
  const helpers = {
    getCurrentTimestamp: () => Math.floor(Date.now() / 1000),
    base64Decode: (value) => Buffer.from(String(value || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
  };

  if (mode === "oracle") {
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

process.on("message", async (workerData) => {
  try {
    const result = await run(workerData);
    if (typeof process.send === "function") {
      process.send({ ok: true, result });
    }
  } catch (error) {
    if (typeof process.send === "function") {
      process.send({ ok: false, error: normalizeError(error) });
    }
  } finally {
    process.exit(0);
  }
});
