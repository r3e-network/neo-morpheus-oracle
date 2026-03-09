"use client";

import { useEffect, useState } from "react";

type RelayerRun = {
  id: string;
  network: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  metrics?: Record<string, unknown> | null;
  checkpoints?: Record<string, unknown> | null;
  runtime?: Record<string, unknown> | null;
  created_at?: string | null;
};

type RelayerJob = {
  id: string;
  event_key: string;
  chain: string;
  request_id: string;
  request_type: string;
  status: string;
  attempts: number;
  last_error?: string | null;
  updated_at?: string | null;
  next_retry_at?: string | null;
};

async function callJSON(path: string, adminApiKey: string, method = "GET", body?: unknown) {
  const headers = new Headers();
  if (adminApiKey) headers.set("x-admin-api-key", adminApiKey);
  if (body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: response.status };
  }
}

export function RelayerOpsPanel() {
  const [adminApiKey, setAdminApiKey] = useState("");
  const [latestRun, setLatestRun] = useState<RelayerRun | null>(null);
  const [recentJobs, setRecentJobs] = useState<RelayerJob[]>([]);
  const [deadLetters, setDeadLetters] = useState<RelayerJob[]>([]);
  const [selectedEventKey, setSelectedEventKey] = useState("");
  const [message, setMessage] = useState("");

  async function refresh(currentKey = adminApiKey) {
    const [metricsBody, jobsBody, deadLettersBody] = await Promise.all([
      callJSON("/api/relayer/metrics?limit=5", currentKey),
      callJSON("/api/relayer/jobs?limit=10", currentKey),
      callJSON("/api/relayer/dead-letters?limit=10", currentKey),
    ]);

    setLatestRun(metricsBody.latest || null);
    setRecentJobs(Array.isArray(jobsBody.jobs) ? jobsBody.jobs : []);
    setDeadLetters(Array.isArray(deadLettersBody.dead_letters) ? deadLettersBody.dead_letters : []);

    const error = metricsBody.error || jobsBody.error || deadLettersBody.error;
    setMessage(error ? JSON.stringify({ error }, null, 2) : "");
  }

  async function runAction(path: string, eventKey: string) {
    const body = await callJSON(path, adminApiKey, "POST", { event_key: eventKey });
    setMessage(JSON.stringify(body, null, 2));
    if (!body.error) {
      setSelectedEventKey(eventKey);
      await refresh();
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedKey = window.localStorage.getItem("morpheus.relayerAdminApiKey") || "";
    setAdminApiKey(savedKey);
    refresh(savedKey).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("morpheus.relayerAdminApiKey", adminApiKey);
  }, [adminApiKey]);

  return (
    <section className="card">
      <h3>Relayer Ops</h3>
      <small>Relayer metrics, recent jobs, dead letters, and manual retry/replay controls.</small>
      <div className="grid grid-2">
        <input
          type="password"
          value={adminApiKey}
          onChange={(event) => setAdminApiKey(event.target.value)}
          placeholder="admin api key (optional in local dev)"
        />
        <button onClick={() => refresh().catch((error) => setMessage(JSON.stringify({ error: String(error) }, null, 2)))}>Refresh Relayer Ops</button>
      </div>

      <div className="grid grid-3">
        <div>
          <h4>Latest Run</h4>
          <pre>{latestRun ? JSON.stringify(latestRun, null, 2) : "No run snapshot yet."}</pre>
        </div>
        <div>
          <h4>Recent Jobs</h4>
          <div className="grid" style={{ gap: 8 }}>
            {recentJobs.map((job) => (
              <div key={job.id} className="card" style={{ padding: 12 }}>
                <small>{job.chain} · {job.request_type} · {job.status}</small>
                <div><code>{job.event_key}</code></div>
                <small>attempts={job.attempts}</small>
                <div className="grid grid-2">
                  <button onClick={() => runAction("/api/relayer/jobs/retry", job.event_key)}>Retry Job</button>
                  <button onClick={() => { setSelectedEventKey(job.event_key); setMessage(JSON.stringify(job, null, 2)); }}>Inspect</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4>Dead Letters</h4>
          <div className="grid" style={{ gap: 8 }}>
            {deadLetters.map((job) => (
              <div key={job.id} className="card" style={{ padding: 12 }}>
                <small>{job.chain} · {job.request_type} · {job.status}</small>
                <div><code>{job.event_key}</code></div>
                <small>{job.last_error || "no error"}</small>
                <div className="grid grid-2">
                  <button onClick={() => runAction("/api/relayer/jobs/replay", job.event_key)}>Replay Dead Letter</button>
                  <button onClick={() => { setSelectedEventKey(job.event_key); setMessage(JSON.stringify(job, null, 2)); }}>Inspect</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-3">
        <input
          value={selectedEventKey}
          onChange={(event) => setSelectedEventKey(event.target.value)}
          placeholder="event_key"
        />
        <button onClick={() => runAction("/api/relayer/jobs/retry", selectedEventKey)}>Retry Selected</button>
        <button onClick={() => runAction("/api/relayer/jobs/replay", selectedEventKey)}>Replay Selected</button>
      </div>

      {message ? <pre>{message}</pre> : null}
    </section>
  );
}
