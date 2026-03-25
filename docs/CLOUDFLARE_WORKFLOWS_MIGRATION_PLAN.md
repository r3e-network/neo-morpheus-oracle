# Cloudflare Workflows Migration Plan

This document captures the recommended next SaaS replacement step for reducing
custom control-plane orchestration logic.

## Why Workflows

The current control-plane worker already implements:

- durable-ish job state in Supabase
- queue dispatch
- explicit retry_count / run_after handling
- stale processing recovery
- operator-driven `/jobs/recover`

Cloudflare Workflows can replace a meaningful subset of this operational
complexity with:

- durable step execution
- persisted execution state
- built-in retry semantics
- instance-level observability

Official docs:

- https://developers.cloudflare.com/workflows/
- https://developers.cloudflare.com/workflows/build/workers-api/
- https://developers.cloudflare.com/workflows/build/trigger-workflows/
- https://developers.cloudflare.com/workflows/build/rules-of-workflows/

## First migration targets

### 1. callback_broadcast

Why first:

- clear terminal success/failure
- easy to retry safely
- naturally modeled as a single durable step

### 2. automation_execute

Why second:

- orchestration-heavy
- already has scheduling / retry semantics
- reduces custom `run_after` state handling

## Not first

### oracle_request

Do not migrate first.

Reasons:

- it is the core product path
- touches confidential execution plane
- highest blast radius

### feed_tick

Do not migrate first.

Reasons:

- already stable enough
- periodic task is lower value to migrate than callback / automation orchestration

## Current scaffold

First-stage code scaffold:

- [deploy/cloudflare/morpheus-workflows/worker.ts](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-workflows/worker.ts)
- [deploy/cloudflare/morpheus-workflows/wrangler.example.toml](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-workflows/wrangler.example.toml)
- [deploy/cloudflare/morpheus-workflows/README.md](/Users/jinghuiliao/git/neo-morpheus-oracle/deploy/cloudflare/morpheus-workflows/README.md)

## Practical next step

Add a feature flag in the existing control-plane worker:

- if disabled: keep current queue path
- if enabled for selected routes:
  - create Workflow instance using stable `job_id`
  - write workflow instance id into existing Supabase job metadata
  - let Workflow handle retries and step execution

This lets you migrate incrementally without a hard cutover.
