"use client";

import { Fingerprint, ArrowRight } from "lucide-react";
import Link from "next/link";
import { CodeBlock } from "@/components/ui/CodeBlock";

export default function DocsNeoDidPage() {
  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <Fingerprint size={14} color="var(--neo-green)" />
        <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono)" }}>
          NEODID PREVIEW
        </span>
      </div>
      <h1>NeoDID</h1>

      <p className="lead" style={{ fontSize: "1.1rem", color: "var(--text-primary)", marginBottom: "2.5rem", lineHeight: 1.6 }}>
        NeoDID is the fourth Morpheus service: a privacy-preserving identity and authorization layer for Neo N3.
        It is designed as an <strong>independent contract</strong> and <strong>independent SGX/CVM service</strong>, not an extension of the Oracle contract.
      </p>

      <div className="card-industrial" style={{ padding: "1.5rem", borderLeft: "4px solid var(--neo-green)", marginBottom: "2rem" }}>
        <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.7 }}>
          Current codebase status: NeoDID now has an independent N3 contract skeleton <code>NeoDIDRegistry</code>,
          SGX worker routes for <code>bind</code>, <code>action-ticket</code>, and <code>recovery-ticket</code>, plus relayer routing for
          <code> neodid_bind</code>, <code> neodid_action_ticket</code>, and <code> neodid_recovery_ticket</code> request types through the
          Morpheus Oracle callback pipeline.
        </p>
      </div>

      <h2>Core Model</h2>
      <ul>
        <li><strong>Master Nullifier:</strong> binds a private Web2 identity to a Neo vault account without exposing the raw Web2 account identifier on-chain.</li>
        <li><strong>Action Nullifier:</strong> derives a separate, task-specific nullifier so the same user can act through disposable wallets without linkability across tasks.</li>
        <li><strong>Independent Registry:</strong> the contract stores identity bindings and action-ticket usage separately from Oracle/DataFeed state.</li>
      </ul>

      <h2>Independent Contract</h2>
      <p>
        NeoDID is implemented as a standalone contract module:
      </p>
      <CodeBlock
        language="csharp"
        title="NeoDIDRegistry"
        code={`[DisplayName("NeoDIDRegistry")]
public class NeoDIDRegistry : SmartContract
{
    public static UInt160 Admin();
    public static ECPoint Verifier();
    public static void SetAdmin(UInt160 newAdmin);
    public static void SetVerifier(ECPoint publicKey);
    public static void RegisterBinding(UInt160 vaultAccount, string provider, string claimType, string claimValue, ByteString masterNullifier, ByteString metadataHash, ByteString verificationSignature);
    public static void RevokeBinding(UInt160 vaultAccount, string provider, string claimType);
    public static BindingRecord GetBinding(UInt160 vaultAccount, string provider, string claimType);
    public static bool IsMasterNullifierUsed(ByteString masterNullifier);
    public static bool IsActionNullifierUsed(ByteString actionNullifier);
    public static bool UseActionTicket(UInt160 disposableAccount, string actionId, ByteString actionNullifier, ByteString verificationSignature);
}`}
      />

      <h2>Worker Routes</h2>
      <p>
        The Phala worker now exposes these authenticated NeoDID routes:
      </p>
      <ul>
        <li><code>GET /api/neodid/providers</code></li>
        <li><code>GET /api/neodid/runtime</code></li>
        <li><code>POST /api/neodid/bind</code></li>
        <li><code>POST /api/neodid/action-ticket</code></li>
        <li><code>POST /api/neodid/recovery-ticket</code></li>
      </ul>

      <h2>Oracle Request Types</h2>
      <p>
        Preferred production usage is on-chain, not direct worker invocation. These request types can be sent through
        <code> MorpheusOracle.request(...)</code> and will be routed by the relayer into the correct NeoDID worker endpoint:
      </p>
      <ul>
        <li><code>neodid_bind</code></li>
        <li><code>neodid_action_ticket</code></li>
        <li><code>neodid_recovery_ticket</code></li>
      </ul>

      <h2>Supported Identity Sources</h2>
      <p>
        NeoDID is designed to support social accounts, exchange identities, and verified contact channels. The current service catalog includes:
      </p>
      <ul>
        <li><code>web3auth</code> with alias <code>w3a</code></li>
        <li><code>twitter</code></li>
        <li><code>github</code></li>
        <li><code>google</code></li>
        <li><code>discord</code></li>
        <li><code>telegram</code></li>
        <li><code>binance</code></li>
        <li><code>okx</code> with alias <code>okex</code></li>
        <li><code>email</code></li>
      </ul>

      <p>
        Each provider can map into different claim types, such as follower thresholds, verified-email status, exchange KYC levels, VIP tiers, or asset-holder attestations.
      </p>

      <div className="card-industrial" style={{ padding: "1.25rem 1.5rem", borderLeft: "4px solid var(--neo-green)", marginBottom: "2rem" }}>
        <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.7 }}>
          Recommended AA integration: treat <code>web3auth</code> as the DID root. Link Google / Apple / email / SMS / other social providers inside
          Web3Auth first, then pass the stable Web3Auth user identifier as <code>provider_uid</code> to NeoDID. AA and recovery verifiers only consume
          NeoDID tickets; they do not need to know which underlying social login was used.
        </p>
      </div>

      <h2>Bind Flow Example</h2>
      <CodeBlock
        language="json"
        title="POST /api/neodid/bind"
        code={`{
  "vault_account": "0x6d0656f6dd91469db1c90cc1e574380613f43738",
  "provider": "google",
  "provider_uid": "google_uid_12345",
  "claim_type": "Google_VerifiedEmail",
  "claim_value": "workspace_user",
  "metadata": {
    "proof_source": "oauth",
    "workspace_domain": "example.com"
  }
}`}
      />

      <h2>Action Ticket Example</h2>
      <CodeBlock
        language="json"
        title="POST /api/neodid/action-ticket"
        code={`{
  "provider": "binance",
  "provider_uid": "binance_uid_12345",
  "disposable_account": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "action_id": "Airdrop_Season_1"
}`}
      />

      <h2>AA Recovery Ticket Example</h2>
      <CodeBlock
        language="json"
        title="POST /api/neodid/recovery-ticket"
        code={`{
  "provider": "github",
  "network": "neo_n3",
  "aa_contract": "0x711c1899a3b7fa0e055ae0d17c9acfcd1bef6423",
  "verifier_contract": "0x1111111111111111111111111111111111111111",
  "account_id": "aa-social-recovery-demo",
  "new_owner": "0x89b05cac00804648c666b47ecb1c57bc185821b7",
  "recovery_nonce": "7",
  "expires_at": "1735689600",
  "encrypted_params": "<sealed provider_uid / oauth / email patch>"
}`}
      />

      <p>
        The recovery ticket flow is specified in the dedicated AA integration guide:
        <Link href="/docs/r/AA_SOCIAL_RECOVERY" style={{ marginLeft: "0.5rem", color: "var(--neo-green)" }}>
          AA Social Recovery
        </Link>
      </p>

      <h2>Third-Party Contract Pattern</h2>
      <CodeBlock
        language="csharp"
        title="DApp Ticket Consumption"
        code={`public static bool Vote(UInt160 disposableAccount, string actionId, ByteString actionNullifier, ByteString sgxSignature)
{
    ExecutionEngine.Assert(Runtime.CheckWitness(disposableAccount), "Unauthorized");

    bool accepted = (bool)Contract.Call(
        NeoDidRegistryHash,
        "useActionTicket",
        CallFlags.All,
        disposableAccount,
        actionId,
        actionNullifier,
        sgxSignature
    );

    ExecutionEngine.Assert(accepted, "Invalid NeoDID action ticket");
    // ... continue DApp logic ...
    return true;
}`}
      />

      <div className="grid grid-2" style={{ gap: "1.5rem", marginTop: "2.5rem" }}>
        <Link href="/launchpad" className="card-industrial" style={{ padding: "1.75rem", textDecoration: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 800, fontSize: "1rem", color: "#fff" }}>Launchpad</span>
            <ArrowRight size={18} color="var(--neo-green)" />
          </div>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.85rem", marginBottom: 0 }}>
            Use the unified Launchpad to move between Oracle, Compute, Templates, Studio, and Verifier flows.
          </p>
        </Link>
        <Link href="/docs/studio" className="card-industrial" style={{ padding: "1.75rem", textDecoration: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 800, fontSize: "1rem", color: "#fff" }}>Starter Studio</span>
            <ArrowRight size={18} color="var(--neo-green)" />
          </div>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.85rem", marginBottom: 0 }}>
            Keep using Starter Studio for payload generation patterns while NeoDID service routes mature.
          </p>
        </Link>
        <Link href="/docs/r/AA_SOCIAL_RECOVERY" className="card-industrial" style={{ padding: "1.75rem", textDecoration: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 800, fontSize: "1rem", color: "#fff" }}>AA Recovery Spec</span>
            <ArrowRight size={18} color="var(--neo-green)" />
          </div>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.85rem", marginBottom: 0 }}>
            Read the recovery ticket schema, verifier checks, timelock flow, and confidentiality model for Abstract Account recovery.
          </p>
        </Link>
      </div>
    </div>
  );
}
