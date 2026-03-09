import fs from "fs";

export function loadRelayerState(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return { neo_n3: { last_block: null }, neo_x: { last_block: null } };
  }
}

export function saveRelayerState(filePath, state) {
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
