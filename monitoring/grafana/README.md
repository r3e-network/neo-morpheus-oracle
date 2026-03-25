# Grafana Alloy / Relayer Metrics

The relayer can now expose a local Prometheus endpoint:

- metrics: `http://127.0.0.1:9464/metrics`
- health: `http://127.0.0.1:9464/healthz`

Start it manually:

```bash
npm run start:relayer:metrics
```

Or via systemd:

- [morpheus-relayer-metrics.service](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/systemd/morpheus-relayer-metrics.service)
- [grafana-alloy.service](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/systemd/grafana-alloy.service)

Alloy template:

- [alloy.relayer.example.alloy](/Users/jinghuiliao/git/neo-morpheus-oracle/monitoring/grafana/alloy.relayer.example.alloy)

Required environment for remote write:

- `GRAFANA_CLOUD_PROMETHEUS_USERNAME`
- `GRAFANA_CLOUD_PROMETHEUS_API_KEY`

Optional:

- `GRAFANA_CLOUD_PROMETHEUS_PUSH_URL`
  - if you want to templatize the remote write endpoint instead of editing the file directly
