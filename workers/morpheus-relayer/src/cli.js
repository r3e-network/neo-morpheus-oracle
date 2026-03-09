import { runRelayerLoop, runRelayerOnce } from "./relayer.js";

const mode = process.argv[2] || "once";

if (mode === "loop") {
  await runRelayerLoop(console);
} else {
  const result = await runRelayerOnce(console);
  console.log(JSON.stringify(result, null, 2));
}
