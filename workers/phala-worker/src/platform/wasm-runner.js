import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { env, trimString } from "./core.js";

const childPath = fileURLToPath(new URL("./wasm-child.cjs", import.meta.url));

function normalizeError(error) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function buildPermissionExecArgv(scriptPath) {
  const raw = trimString(env("SCRIPT_CHILD_ENABLE_PERMISSION_MODEL") || "true").toLowerCase();
  if (["0", "false", "no"].includes(raw)) return [];

  const allowFsRead = new Set(
    trimString(env("SCRIPT_CHILD_ALLOW_FS_READ") || path.dirname(scriptPath))
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

  const args = ["--permission"];
  for (const entry of allowFsRead) {
    args.push(`--allow-fs-read=${entry}`);
  }

  const allowFsWrite = trimString(env("SCRIPT_CHILD_ALLOW_FS_WRITE"));
  for (const entry of allowFsWrite.split(",").map((item) => item.trim()).filter(Boolean)) {
    args.push(`--allow-fs-write=${entry}`);
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

export async function runWasmWithTimeout({ mode, moduleBase64, entryPoint = "run", input, timeoutMs }) {
  const maxOldGenerationSizeMb = Math.max(Number(env("WASM_CHILD_MAX_OLD_SPACE_MB") || 64), 16);
  const maxYoungGenerationSizeMb = Math.max(Number(env("WASM_CHILD_MAX_YOUNG_SPACE_MB") || 16), 4);
  const stackSizeMb = Math.max(Number(env("WASM_CHILD_STACK_SIZE_MB") || 4), 1);
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
      reject(new Error(`wasm execution timed out after ${timeoutMs}ms`));
    }, timeoutMs + 50);

    child.once("message", (message) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      if (message?.ok) {
        resolve(message.result);
      } else {
        reject(new Error(message?.error?.message || "wasm execution failed"));
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
        reject(new Error(`wasm worker exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`));
      }
    });

    child.send({ mode, moduleBase64, entryPoint, input, timeoutMs });
  });
}
