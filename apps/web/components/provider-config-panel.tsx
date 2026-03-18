'use client';

import { useEffect, useMemo, useState } from 'react';

type ProviderDescriptor = {
  id: string;
  description?: string;
};

type ProviderConfigRecord = {
  provider_id: string;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

const DEFAULT_PROVIDER_CONFIGS: Record<string, string> = {
  twelvedata: JSON.stringify(
    { symbol: 'TWELVEDATA:NEO-USD', endpoint: 'price', interval: '1min' },
    null,
    2
  ),
  'binance-spot': JSON.stringify({ symbol: 'BINANCE-SPOT:NEO-USD' }, null, 2),
  'coinbase-spot': JSON.stringify({ symbol: 'COINBASE-SPOT:NEO-USD' }, null, 2),
};

async function callJSON(
  path: string,
  options: {
    method?: RequestInit['method'];
    body?: unknown;
    adminApiKey?: string;
  } = {}
) {
  const headers = new Headers();
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.adminApiKey) headers.set('x-admin-api-key', options.adminApiKey);

  const response = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: response.status };
  }
}

export function ProviderConfigPanel() {
  const [projectSlug, setProjectSlug] = useState('demo');
  const [providerId, setProviderId] = useState('twelvedata');
  const [configJson, setConfigJson] = useState(DEFAULT_PROVIDER_CONFIGS.twelvedata);
  const [configs, setConfigs] = useState<ProviderConfigRecord[]>([]);
  const [providers, setProviders] = useState<ProviderDescriptor[]>([]);
  const [adminApiKey, setAdminApiKey] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const exampleConfig = useMemo(
    () =>
      DEFAULT_PROVIDER_CONFIGS[providerId] ||
      JSON.stringify({ symbol: 'TWELVEDATA:NEO-USD' }, null, 2),
    [providerId]
  );

  async function refresh(currentProjectSlug = projectSlug, currentAdminApiKey = adminApiKey) {
    setLoading(true);
    try {
      const body = await callJSON(
        `/api/provider-configs?project_slug=${encodeURIComponent(currentProjectSlug)}`,
        {
          adminApiKey: currentAdminApiKey,
        }
      );
      setConfigs(Array.isArray(body.configs) ? body.configs : []);
      if (body.error) setMessage(JSON.stringify(body, null, 2));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedKey = window.sessionStorage.getItem('morpheus.providerConfigApiKey') || '';
    setAdminApiKey(savedKey);

    (async () => {
      const body = await callJSON('/api/providers');
      setProviders(Array.isArray(body.providers) ? body.providers : []);
      await refresh('demo', savedKey);
    })();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (adminApiKey) {
      window.sessionStorage.setItem('morpheus.providerConfigApiKey', adminApiKey);
    } else {
      window.sessionStorage.removeItem('morpheus.providerConfigApiKey');
    }
  }, [adminApiKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      refresh(projectSlug, adminApiKey);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [projectSlug, adminApiKey]);

  return (
    <div className="card">
      <h3 className="card-title">Provider Configs</h3>
      <p className="card-description">
        Persist project-level built-in provider settings in Supabase. Set{' '}
        <code>MORPHEUS_PROVIDER_CONFIG_API_KEY</code>
        or <code>ADMIN_CONSOLE_API_KEY</code> in production to manage configs. The key is kept only
        for the current browser session.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="grid grid-2">
          <div className="form-group">
            <label className="form-label">Project Slug</label>
            <input
              value={projectSlug}
              onChange={(event) => setProjectSlug(event.target.value)}
              placeholder="demo"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Admin API Key</label>
            <input
              type="password"
              value={adminApiKey}
              onChange={(event) => setAdminApiKey(event.target.value)}
              placeholder="••••••••••••••••"
            />
          </div>
        </div>

        <div className="grid grid-2">
          <div className="form-group">
            <label className="form-label">Provider ID</label>
            <input
              value={providerId}
              list="builtin-provider-ids"
              onChange={(event) => setProviderId(event.target.value)}
              placeholder="e.g. binance-spot"
            />
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end', display: 'flex' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setConfigJson(exampleConfig)}>
              Reset Example Config
            </button>
          </div>
        </div>

        <datalist id="builtin-provider-ids">
          {(providers.length
            ? providers
            : [{ id: 'twelvedata' }, { id: 'binance-spot' }, { id: 'coinbase-spot' }]
          ).map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.description || provider.id}
            </option>
          ))}
        </datalist>

        <div className="form-group">
          <label className="form-label">Configuration JSON</label>
          <textarea
            value={configJson}
            onChange={(event) => setConfigJson(event.target.value)}
            placeholder={exampleConfig}
          />
        </div>

        <div className="grid grid-3" style={{ marginTop: '0.5rem' }}>
          <button
            className="btn btn-primary"
            onClick={async () => {
              let parsedConfig: Record<string, unknown>;
              try {
                const parsed = JSON.parse(configJson);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                  throw new Error('config must be a JSON object');
                }
                parsedConfig = parsed as Record<string, unknown>;
              } catch (error) {
                setMessage(
                  JSON.stringify(
                    { error: error instanceof Error ? error.message : String(error) },
                    null,
                    2
                  )
                );
                return;
              }

              const body = await callJSON('/api/provider-configs', {
                method: 'POST',
                adminApiKey,
                body: {
                  project_slug: projectSlug,
                  provider_id: providerId,
                  enabled: true,
                  config: parsedConfig,
                },
              });
              setMessage(JSON.stringify(body, null, 2));
              await refresh();
            }}
          >
            Save Config
          </button>
          <button className="btn btn-outline" onClick={() => refresh()}>
            Refresh
          </button>
          <button
            className="btn btn-ghost"
            style={{ color: 'var(--error)' }}
            onClick={async () => {
              const body = await callJSON(
                `/api/provider-configs?project_slug=${encodeURIComponent(projectSlug)}&provider_id=${encodeURIComponent(providerId)}`,
                {
                  method: 'DELETE',
                  adminApiKey,
                }
              );
              setMessage(JSON.stringify(body, null, 2));
              await refresh();
            }}
          >
            Delete
          </button>
        </div>

        <div className="terminal-panel" style={{ marginTop: '1rem' }}>
          <div className="terminal-header">
            <div className="terminal-title">System Message</div>
          </div>
          <div className="terminal-body" style={{ maxHeight: '200px' }}>
            <pre className="terminal-pre">
              {message || (loading ? 'Loading configs...' : JSON.stringify(configs, null, 2))}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
