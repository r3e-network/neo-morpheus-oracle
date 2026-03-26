# Supabase Setup

Apply the migrations in order:

1. `0001_morpheus_schema.sql`
2. `0002_morpheus_policies_and_seeds.sql`
3. `0003_provider_configs.sql`
4. `0004_relayer_ops.sql`
5. `0005_operation_logs.sql`
6. `0006_automation.sql`
7. `0007_system_backups.sql`
8. `0008_network_isolation.sql`
9. `0009_relayer_durable_queue_indexes.sql`
10. `0010_control_plane_jobs.sql`

Optional:

- `supabase/seed.sql`

## What gets created

- project registry
- encrypted secret storage
- async request records
- control-plane jobs
- compute job records
- feed snapshots
- relayer durable jobs
- automation jobs and automation runs
- built-in compute function catalog
- RLS policies for project-owned data
- network-scoped project registry and network-separated operational data for mainnet vs testnet
