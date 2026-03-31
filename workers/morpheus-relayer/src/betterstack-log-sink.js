const queue = [];
let flushTimer = null;
let inFlight = false;
let queueLocked = false;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveConfig() {
  const ingestingHost = trimString(process.env.MORPHEUS_BETTERSTACK_LOG_INGESTING_HOST);
  const sourceToken = trimString(process.env.MORPHEUS_BETTERSTACK_LOG_SOURCE_TOKEN);
  if (!ingestingHost || !sourceToken) return null;
  return {
    url: `https://${ingestingHost}`,
    sourceToken,
    batchSize: Math.max(Number(process.env.MORPHEUS_BETTERSTACK_LOG_BATCH_SIZE || 20), 1),
    flushIntervalMs: Math.max(
      Number(process.env.MORPHEUS_BETTERSTACK_LOG_FLUSH_INTERVAL_MS || 2000),
      250
    ),
    timeoutMs: Math.max(Number(process.env.MORPHEUS_BETTERSTACK_LOG_TIMEOUT_MS || 2000), 250),
    maxQueue: Math.max(Number(process.env.MORPHEUS_BETTERSTACK_LOG_MAX_QUEUE || 500), 10),
  };
}

async function flush() {
  const config = resolveConfig();
  if (!config || inFlight || queue.length === 0) return;
  inFlight = true;
  queueLocked = true;
  const batch = queue.splice(0, config.batchSize);
  queueLocked = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.sourceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batch),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch {
    // Best effort only. Drop failures instead of blocking relayer execution.
  } finally {
    clearTimeout(timer);
    inFlight = false;
    if (queue.length > 0) {
      scheduleFlush();
    }
  }
}

function scheduleFlush() {
  const config = resolveConfig();
  if (!config) return;
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flush();
  }, config.flushIntervalMs);
}

export function enqueueBetterStackLog(record) {
  const config = resolveConfig();
  if (!config) return;

  if (queueLocked) return; // Drop logs during flush batch extraction to prevent race condition

  queue.push({
    dt: new Date().toISOString(),
    ...record,
  });

  if (queue.length > config.maxQueue) {
    queue.splice(0, queue.length - config.maxQueue);
  }

  if (queue.length >= config.batchSize) {
    void flush();
    return;
  }

  scheduleFlush();
}
