"use client";

import { ProviderConfigPanel } from "../provider-config-panel";
import { RelayerOpsPanel } from "../relayer-ops-panel";

export function OperationsTab() {
  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <section className="card" style={{ borderLeft: "4px solid var(--warning)" }}>
        <h3 className="card-title text-2xl">Network Management</h3>
        <p className="card-description">
          Configure external data providers, manage relayer keys, and monitor health across the Neo N3 runtime.
        </p>
      </section>
      
      <ProviderConfigPanel />
      <RelayerOpsPanel />
    </div>
  );
}
