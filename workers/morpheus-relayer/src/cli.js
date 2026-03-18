import { createRelayerConfig } from './config.js';
import { createLogger } from './logger.js';
import { runRelayerLoop, runRelayerOnce } from './relayer.js';
import { loadRelayerState, snapshotMetrics } from './state.js';

const mode = process.argv[2] || 'once';
const config = createRelayerConfig();
const logger = createLogger(config);

if (mode === 'loop') {
  await runRelayerLoop({ config, logger });
} else if (mode === 'metrics') {
  const state = loadRelayerState(config.stateFile);
  console.log(
    JSON.stringify({ state_file: config.stateFile, metrics: snapshotMetrics(state) }, null, 2)
  );
} else {
  const result = await runRelayerOnce({ config, logger });
  console.log(JSON.stringify(result, null, 2));
}
