import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { env, measureSerializedSizeBytes, resolveMaxBytes, trimString } from "./core.js";

function normalizeError(error) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

const childPath = fileURLToPath(new URL("./script-child.cjs", import.meta.url));

function resolveMaxResultBytes() {
  return resolveMaxBytes(env("SCRIPT_WORKER_MAX_RESULT_BYTES"), 64 * 1024, 1024);
}

function buildPermissionExecArgv(scriptPath) {
  const enabled = trimString(env("SCRIPT_CHILD_ENABLE_PERMISSION_MODEL") || "true").toLowerCase();
  if (["0", "false", "no"].includes(enabled)) return [];

  const allowFsRead = new Set(
    trimString(env("SCRIPT_CHILD_ALLOW_FS_READ") || `${path.dirname(scriptPath)},/app,/usr,/lib,/lib64,/tmp,/dev/null`)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const args = ["--permission"];
  for (const entry of allowFsRead) {
    args.push(`--allow-fs-read=${entry}`);
  }
  if (trimString(env("SCRIPT_CHILD_ALLOW_FS_WRITE"))) {
    for (const entry of trimString(env("SCRIPT_CHILD_ALLOW_FS_WRITE")).split(",").map((item) => item.trim()).filter(Boolean)) {
      args.push(`--allow-fs-write=${entry}`);
    }
  }
  if (trimString(env("SCRIPT_CHILD_ALLOW_NET"))) {
    args.push(`--allow-net=${trimString(env("SCRIPT_CHILD_ALLOW_NET"))}`);
  }
  if (["1", "true", "yes"].includes(trimString(env("SCRIPT_CHILD_ALLOW_WORKER")).toLowerCase())) {
    args.push("--allow-worker");
  }
  if (["1", "true", "yes"].includes(trimString(env("SCRIPT_CHILD_ALLOW_CHILD_PROCESS")).toLowerCase())) {
    args.push("--allow-child-process");
  }
  return args;
}

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
        "--disable-proto=throw",
        "--frozen-intrinsics",
        `--max-old-space-size=${maxOldGenerationSizeMb}`,
        `--max-semi-space-size=${maxYoungGenerationSizeMb}`,
        `--stack-size=${stackSizeKb}`,
        ...buildPermissionExecArgv(childPath),
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
        const maxResultBytes = resolveMaxResultBytes();
        const size = measureSerializedSizeBytes(message.result);
        if (size > maxResultBytes) {
          reject(new Error(`script result exceeds max size of ${maxResultBytes} bytes`));
          return;
        }
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
