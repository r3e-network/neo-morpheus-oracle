import http from "http";
import handler from "./worker.js";

const port = Number(process.env.PORT || process.env.PHALA_WORKER_PORT || process.env.NITROCORE_PORT || 8080);
const maxBodyBytes = Math.max(Number(process.env.WORKER_MAX_BODY_BYTES || 262144), 1024);

async function toRequest(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new Error(`request body too large (max ${maxBodyBytes} bytes)`);
    }
    chunks.push(chunk);
  }
  const bodyBuffer = Buffer.concat(chunks);
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || `0.0.0.0:${port}`;
  const url = `${protocol}://${host}${req.url || "/"}`;

  return new Request(url, {
    method: req.method,
    headers: new Headers(Object.entries(req.headers).flatMap(([key, value]) => {
      if (Array.isArray(value)) return value.map((item) => [key, item]);
      return value ? [[key, value]] : [];
    })),
    body: req.method === "GET" || req.method === "HEAD" ? undefined : bodyBuffer,
  });
}

async function writeResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const arrayBuffer = await response.arrayBuffer();
  res.end(Buffer.from(arrayBuffer));
}

const server = http.createServer(async (req, res) => {
  try {
    const request = await toRequest(req);
    const response = await handler(request);
    await writeResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: message }));
  }
});

server.listen(port, () => {
  console.log(JSON.stringify({ level: "info", msg: "phala-worker server listening", port }));
});
