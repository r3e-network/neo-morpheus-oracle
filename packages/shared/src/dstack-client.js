import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

function toHex(data) {
  if (typeof data === 'string') return Buffer.from(data).toString('hex');
  if (data instanceof Uint8Array) return Buffer.from(data).toString('hex');
  return Buffer.from(data).toString('hex');
}

function parseJson(text, fallbackMessage = 'failed to parse response') {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(fallbackMessage);
  }
}

function sendRpcRequest(endpoint, route, payload, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('request timed out'));
      }
    }, timeoutMs);

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn(value);
    };

    const isHttp = endpoint.startsWith('http://') || endpoint.startsWith('https://');
    if (isHttp) {
      const url = new URL(route, endpoint);
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'neo-morpheus-oracle/dstack-client',
        },
      };
      const req = (url.protocol === 'https:' ? https : http).request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            finish(resolve, parseJson(data));
          } catch (error) {
            finish(reject, error);
          }
        });
      });
      req.on('error', (error) => finish(reject, error));
      req.write(payload);
      req.end();
      return;
    }

    const client = net.createConnection({ path: endpoint }, () => {
      client.write(`POST ${route} HTTP/1.1\r\n`);
      client.write('Host: localhost\r\n');
      client.write('Content-Type: application/json\r\n');
      client.write(`Content-Length: ${Buffer.byteLength(payload)}\r\n`);
      client.write('\r\n');
      client.write(payload);
    });

    let data = '';
    let headersParsed = false;
    let contentLength = 0;
    let body = '';

    client.on('data', (chunk) => {
      const text = chunk.toString();
      if (!headersParsed) {
        data += text;
        const headerEnd = data.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        headersParsed = true;
        const headers = data.slice(0, headerEnd).split('\r\n');
        for (const line of headers) {
          const [key, value] = line.split(': ');
          if (key?.toLowerCase() === 'content-length') {
            contentLength = Number(value || '0');
          }
        }
        body = data.slice(headerEnd + 4);
      } else {
        body += text;
      }

      if (headersParsed && body.length >= contentLength) {
        client.end();
      }
    });

    client.on('end', () => {
      try {
        finish(resolve, parseJson(body.slice(0, contentLength)));
      } catch (error) {
        finish(reject, error);
      }
    });
    client.on('error', (error) => finish(reject, error));
  });
}

function replayRtmr(history) {
  const init = Buffer.alloc(48, 0);
  if (!history.length) return init.toString('hex');
  let current = init;
  for (const digestHex of history) {
    let digest = Buffer.from(digestHex, 'hex');
    if (digest.length < 48) {
      digest = Buffer.concat([digest, Buffer.alloc(48 - digest.length, 0)]);
    }
    current = createHash('sha384').update(Buffer.concat([current, digest])).digest();
  }
  return current.toString('hex');
}

function replayRtmrs(eventLogRaw) {
  const eventLog = JSON.parse(eventLogRaw);
  const rtmrs = [];
  for (let index = 0; index < 4; index += 1) {
    const history = eventLog.filter((event) => event.imr === index).map((event) => event.digest);
    rtmrs[index] = replayRtmr(history);
  }
  return rtmrs;
}

export class DstackClient {
  constructor(endpoint = undefined) {
    if (endpoint === undefined) {
      endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT || '/var/run/dstack.sock';
    }
    if (endpoint.startsWith('/') && !fs.existsSync(endpoint)) {
      throw new Error(`Unix socket file ${endpoint} does not exist`);
    }
    this.endpoint = endpoint;
  }

  async getKey(path, purpose = '') {
    const result = await sendRpcRequest(
      this.endpoint,
      '/GetKey',
      JSON.stringify({ path, purpose })
    );
    return Object.freeze({
      key: Uint8Array.from(Buffer.from(result.key, 'hex')),
      signature_chain: (result.signature_chain || []).map((entry) =>
        Uint8Array.from(Buffer.from(entry, 'hex'))
      ),
      __name__: 'GetKeyResponse',
    });
  }

  async getQuote(reportData) {
    const hex = toHex(reportData);
    if (hex.length > 128) {
      throw new Error('Report data is too large, it should be less than 64 bytes.');
    }
    const result = await sendRpcRequest(
      this.endpoint,
      '/GetQuote',
      JSON.stringify({ report_data: hex })
    );
    if ('error' in result) throw new Error(result.error);
    Object.defineProperty(result, 'replayRtmrs', {
      get: () => () => replayRtmrs(result.event_log),
      enumerable: true,
      configurable: false,
    });
    return Object.freeze(result);
  }

  async info() {
    const result = await sendRpcRequest(this.endpoint, '/Info', '{}');
    return Object.freeze({
      ...result,
      tcb_info: typeof result.tcb_info === 'string' ? JSON.parse(result.tcb_info) : result.tcb_info,
    });
  }

  async isReachable() {
    try {
      await sendRpcRequest(this.endpoint, '/Info', '{}', 500);
      return true;
    } catch {
      return false;
    }
  }
}

export class TappdClient extends DstackClient {
  constructor(endpoint = undefined) {
    super(endpoint ?? process.env.TAPPD_SIMULATOR_ENDPOINT ?? '/var/run/tappd.sock');
    console.warn('TappdClient is deprecated, please use DstackClient instead');
  }
}
