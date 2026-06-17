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

// Keys whose values are secret-shaped (credentials, raw key material, sealed
// payloads) are redacted in full regardless of value shape — an object or array
// under one of these keys could still smuggle a secret past the URL scrub.
const SECRET_KEY_PATTERN =
  /(wif|private_?key|secret|token|api_?key|authorization|envelope|plaintext|seed)/i;

function isSecretKey(key) {
  return typeof key === 'string' && SECRET_KEY_PATTERN.test(key);
}

// Bound the cost of deep-walking arbitrarily nested/large payloads so a single
// log call cannot blow the stack or stall on a pathological structure.
const MAX_REDACT_DEPTH = 8;
const MAX_REDACT_NODES = 1000;

// Deep-walk plain objects/arrays applying redactSecrets() to every string leaf,
// and redact the value of any secret-shaped key outright. Non-plain values
// (functions, Buffers, class instances, etc.) are passed through serializeError
// so existing Error handling still applies. The shared counter caps the total
// number of visited nodes; beyond the cap the remaining structure is dropped to
// a placeholder rather than walked.
function redactDeep(value, depth, counter) {
  if (counter.count >= MAX_REDACT_NODES || depth > MAX_REDACT_DEPTH) {
    return '[redacted-truncated]';
  }
  counter.count += 1;

  if (typeof value === 'string') {
    return redactSecrets(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, depth + 1, counter));
  }

  // Only deep-walk plain objects; defer everything else (Error, Buffer, class
  // instances, primitives) to serializeError to preserve existing behavior.
  if (
    value !== null &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
      if (isSecretKey(key)) {
        result[key] = '[redacted]';
      } else {
        result[key] = redactDeep(nested, depth + 1, counter);
      }
    }
    return result;
  }

  return serializeError(value);
}

function serializeError(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecrets(value.message),
      stack: redactSecrets(value.stack),
    };
  }
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
    return redactDeep(value, 0, { count: 0 });
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
