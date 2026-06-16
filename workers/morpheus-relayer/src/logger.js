import { enqueueBetterStackLog } from './betterstack-log-sink.js';

const LEVEL_PRIORITY = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Scrub URLs (and any credentials embedded in authenticated RPC/DB URLs) from text that
// egresses to the external log sink (BetterStack). The on-chain error path is already
// scrubbed by fulfillment.js trimOnchainErrorMessage; the structured-log lane had no
// equivalent, so a credentialed RPC/Supabase URL inside an error could leak in cleartext.
function redactSecrets(text) {
  return typeof text === 'string'
    ? text.replace(/https?:\/\/[^\s\]]+/gi, '[redacted-url]')
    : text;
}

function serializeError(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecrets(value.message),
      stack: redactSecrets(value.stack),
    };
  }
  return redactSecrets(value);
}

function shouldLog(configuredLevel, currentLevel) {
  return LEVEL_PRIORITY[currentLevel] >= LEVEL_PRIORITY[configuredLevel];
}

function writeLog(format, level, message, payload) {
  const time = new Date().toISOString();
  const structured = {
    time,
    level,
    msg: message,
    ...payload,
  };
  if (format === 'text') {
    const suffix = payload && Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : '';
    // eslint-disable-next-line no-console -- logger writes to stdout
    console.log(`[${time}] ${level.toUpperCase()} ${message}${suffix}`);
    enqueueBetterStackLog({
      service: 'morpheus-relayer',
      logger_format: 'text',
      ...structured,
    });
    return;
  }

  // eslint-disable-next-line no-console -- logger writes to stdout
  console.log(JSON.stringify(structured));
  enqueueBetterStackLog({
    service: 'morpheus-relayer',
    logger_format: 'json',
    ...structured,
  });
}

export function createLogger(config = {}) {
  const format =
    trimString(
      config.logFormat ||
        process.env.MORPHEUS_RELAYER_LOG_FORMAT ||
        process.env.LOG_FORMAT ||
        'json'
    ) || 'json';
  const level =
    trimString(
      config.logLevel || process.env.MORPHEUS_RELAYER_LOG_LEVEL || process.env.LOG_LEVEL || 'info'
    ).toLowerCase() || 'info';

  function log(currentLevel, payload, message) {
    if (!shouldLog(level, currentLevel)) return;
    const normalizedPayload =
      payload && typeof payload === 'object'
        ? Object.fromEntries(
            Object.entries(payload).map(([key, value]) => [key, serializeError(value)])
          )
        : undefined;
    writeLog(format, currentLevel, message, normalizedPayload);
  }

  return {
    debug(payload, message = 'debug') {
      log('debug', payload, message);
    },
    info(payload, message = 'info') {
      log('info', payload, message);
    },
    warn(payload, message = 'warn') {
      log('warn', payload, message);
    },
    error(payload, message = 'error') {
      log('error', payload, message);
    },
  };
}
