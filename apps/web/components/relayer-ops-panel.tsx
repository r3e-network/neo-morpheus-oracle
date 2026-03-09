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

async function callJSON(path: string, adminApiKey: string) {
  const headers = new Headers();
  if (adminApiKey) headers.set("x-admin-api-key", adminApiKey);
  const response = await fetch(path, { method: "GET", headers });
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
      <small>Relayer metrics, recent jobs, and dead letters persisted in Supabase.</small>
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
          <pre>{JSON.stringify(recentJobs, null, 2)}</pre>
        </div>
        <div>
          <h4>Dead Letters</h4>
          <pre>{JSON.stringify(deadLetters, null, 2)}</pre>
        </div>
      </div>

      {message ? <pre>{message}</pre> : null}
    </section>
  );
}
