const LEVEL_PRIORITY = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function serializeError(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
}

function shouldLog(configuredLevel, currentLevel) {
  return LEVEL_PRIORITY[currentLevel] >= LEVEL_PRIORITY[configuredLevel];
}

function writeLog(format, level, message, payload) {
  const time = new Date().toISOString();
  if (format === "text") {
    const suffix = payload && Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : "";
    console.log(`[${time}] ${level.toUpperCase()} ${message}${suffix}`);
    return;
  }

  console.log(JSON.stringify({
    time,
    level,
    msg: message,
    ...payload,
  }));
}

export function createLogger(config = {}) {
  const format = trimString(config.logFormat || process.env.MORPHEUS_RELAYER_LOG_FORMAT || process.env.LOG_FORMAT || "json") || "json";
  const level = trimString(config.logLevel || process.env.MORPHEUS_RELAYER_LOG_LEVEL || process.env.LOG_LEVEL || "info").toLowerCase() || "info";

  function log(currentLevel, payload, message) {
    if (!shouldLog(level, currentLevel)) return;
    const normalizedPayload = payload && typeof payload === "object"
      ? Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, serializeError(value)]))
      : undefined;
    writeLog(format, currentLevel, message, normalizedPayload);
  }

  return {
    debug(payload, message = "debug") { log("debug", payload, message); },
    info(payload, message = "info") { log("info", payload, message); },
    warn(payload, message = "warn") { log("warn", payload, message); },
    error(payload, message = "error") { log("error", payload, message); },
  };
}
