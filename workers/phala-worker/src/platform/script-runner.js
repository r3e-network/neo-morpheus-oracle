import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { env } from "./core.js";

function normalizeError(error) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

const childPath = fileURLToPath(new URL("./script-child.cjs", import.meta.url));

export async function runScriptWithTimeout({ mode, script, entryPoint = "process", input, data, context, timeoutMs }) {
  const maxOldGenerationSizeMb = Math.max(Number(env("SCRIPT_WORKER_MAX_OLD_SPACE_MB") || 64), 16);
  const maxYoungGenerationSizeMb = Math.max(Number(env("SCRIPT_WORKER_MAX_YOUNG_SPACE_MB") || 16), 4);
  const stackSizeMb = Math.max(Number(env("SCRIPT_WORKER_STACK_SIZE_MB") || 4), 1);
  const stackSizeKb = Math.max(stackSizeMb * 1024, 1024);

  return await new Promise((resolve, reject) => {
    const child = fork(childPath, {
      silent: true,
      env: {
        PATH: process.env.PATH || "",
        TZ: process.env.TZ || "UTC",
      },
      execArgv: [
        `--max-old-space-size=${maxOldGenerationSizeMb}`,
        `--max-semi-space-size=${maxYoungGenerationSizeMb}`,
        `--stack-size=${stackSizeKb}`,
      ],
    });

    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGKILL");
      reject(new Error(`script execution timed out after ${timeoutMs}ms`));
    }, timeoutMs + 50);

    child.once("message", (message) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      if (message?.ok) {
        resolve(message.result);
      } else {
        reject(new Error(message?.error?.message || "script execution failed"));
      }
    });

    child.once("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(new Error(normalizeError(error).message));
    });

    child.once("exit", (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`script worker exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`));
      }
    });

    child.send({ mode, script, entryPoint, input, data, context, timeoutMs });
  });
}
