# Supabase Setup

Apply the migrations in order:

1. `0001_morpheus_schema.sql`
2. `0002_morpheus_policies_and_seeds.sql`
3. optionally apply `supabase/seed.sql`

## What gets created

- project registry
- encrypted secret storage
- async request records
- compute job records
- feed snapshots
- built-in compute function catalog
- RLS policies for project-owned data
