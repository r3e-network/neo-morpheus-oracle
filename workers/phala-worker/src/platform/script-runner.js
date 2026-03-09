import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

function normalizeError(error) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

const workerPath = fileURLToPath(new URL("./script-worker.cjs", import.meta.url));

export async function runScriptWithTimeout({ mode, script, entryPoint = "process", input, data, context, timeoutMs }) {
  return await new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { mode, script, entryPoint, input, data, context, timeoutMs },
    });

    let finished = false;
    const timer = setTimeout(async () => {
      if (finished) return;
      finished = true;
      await worker.terminate().catch(() => undefined);
      reject(new Error(`script execution timed out after ${timeoutMs}ms`));
    }, timeoutMs + 50);

    worker.once("message", async (message) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      await worker.terminate().catch(() => undefined);
      if (message?.ok) {
        resolve(message.result);
      } else {
        reject(new Error(message?.error?.message || "script execution failed"));
      }
    });

    worker.once("error", async (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      await worker.terminate().catch(() => undefined);
      reject(new Error(normalizeError(error).message));
    });

    worker.once("exit", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`script worker exited with code ${code}`));
      }
    });
  });
}
