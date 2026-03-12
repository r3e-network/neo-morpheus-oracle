"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Fingerprint, KeyRound, Lock, LogIn, LogOut, RefreshCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Web3AuthProvider, useIdentityToken, useWeb3AuthConnect, useWeb3AuthDisconnect } from "@web3auth/modal/react";
import { authConnector } from "@web3auth/no-modal";

import { encryptJsonWithOraclePublicKey } from "@/lib/browser-encryption";

const DEFAULT_WEB3AUTH_CLIENT_ID = "BHpd11oKRDW7--gsLg_lcAbCC9tiAjcDfMlYFabfVipkPe9I2enmxNzY1TfqalImrPEntXCpf6Gkl4N23rBqTS0";
const DEFAULT_WEB3AUTH_NETWORK = "sapphire_mainnet";
const inputStyle: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--border-dim)",
  color: "#fff",
  padding: "0.8rem 0.9rem",
  borderRadius: "2px",
  fontFamily: "var(--font-mono)",
  fontSize: "0.85rem",
};

type RuntimeState = {
  app_id?: string | null;
  compose_hash?: string | null;
  verification_public_key?: string | null;
  web3auth?: {
    jwks_url?: string | null;
    audience_configured?: boolean;
    derives_provider_uid_in_tee?: boolean;
  } | null;
};

type OriginDataState = {
  client_id?: string;
  origin?: string;
  origin_data?: Record<string, string>;
  error?: string;
};

type BindResult = {
  mode?: string;
  provider?: string;
  claim_type?: string;
  claim_value?: string;
  master_nullifier?: string;
  public_key?: string;
  output_hash?: string;
  attestation_hash?: string;
  verification?: Record<string, unknown>;
  error?: string;
};

function copyText(value: string) {
  return navigator.clipboard.writeText(value);
}

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

function maskToken(token: string) {
  if (!token) return "";
  if (token.length <= 24) return `${token.slice(0, 8)}...${token.slice(-8)}`;
  return `${token.slice(0, 18)}...${token.slice(-18)}`;
}

function describeWeb3AuthError(message: string) {
  const text = String(message || "");
  if (!text) return "";
  if (text.includes("could not validate redirect") || text.includes("whitelist your domain")) {
    return "Web3Auth rejected the login because the current origin is not trusted. If server-side origin signing is active, refresh this page and try again. Otherwise add the current domain to Web3Auth dashboard whitelist or configure WEB3AUTH_CLIENT_SECRET on the server.";
  }
  if (text.includes("WEB3AUTH_CLIENT_SECRET is not configured")) {
    return "The live page cannot sign originData because WEB3AUTH_CLIENT_SECRET is missing on the server. Add it to Vercel project envs or local .env before testing.";
  }
  if (text.includes("WEB3AUTH_CLIENT_SECRET does not match")) {
    return "The configured Web3Auth client secret does not belong to the configured client id. Fix the pair before retrying.";
  }
  return text;
}

function Web3AuthLiveStudioInner({ originDataState }: { originDataState: OriginDataState | null }) {
  const { connect, loading: connectLoading, error: connectError, isConnected } = useWeb3AuthConnect();
  const { disconnect, loading: disconnectLoading, error: disconnectError } = useWeb3AuthDisconnect();
  const { getIdentityToken, loading: tokenLoading, error: tokenError } = useIdentityToken();

  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const [identityToken, setIdentityToken] = useState("");
  const [bindResult, setBindResult] = useState<BindResult | null>(null);
  const [bindError, setBindError] = useState("");
  const [bindLoading, setBindLoading] = useState(false);
  const [encryptToken, setEncryptToken] = useState(true);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [vaultAccount, setVaultAccount] = useState("0x6d0656f6dd91469db1c90cc1e574380613f43738");
  const [claimType, setClaimType] = useState("Web3Auth_PrimaryIdentity");
  const [claimValue, setClaimValue] = useState("linked_social_root");
  const [currentOrigin, setCurrentOrigin] = useState("");

  const jwtPayload = useMemo(() => decodeJwtPayload(identityToken), [identityToken]);
  const busy = connectLoading || disconnectLoading || tokenLoading || bindLoading;
  const audienceConfigured = runtime?.web3auth?.audience_configured === true;
  const web3authErrors = [
    connectError?.message,
    disconnectError?.message,
    tokenError?.message,
  ].filter((value): value is string => Boolean(value));

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentOrigin(window.location.origin);
    }
    void (async () => {
      try {
        const response = await fetch("/api/neodid/runtime");
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || "Failed to load NeoDID runtime");
        setRuntime(body);
      } catch (error) {
        setRuntimeError(error instanceof Error ? error.message : String(error));
      }
    })();

  }, []);

  useEffect(() => {
    if (!isConnected || identityToken) return;
    void refreshIdentityArtifacts();
  }, [identityToken, isConnected]);

  useEffect(() => {
    void fetch("/api/web3auth/debug-state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        connected: isConnected,
        identityToken,
        jwtPayload,
        bindResult,
        error: [bindError, ...web3authErrors].filter(Boolean).join(" | "),
      }),
    }).catch(() => {});
  }, [bindError, bindResult, identityToken, isConnected, jwtPayload, web3authErrors]);

  async function copyWithToast(id: string, value: string) {
    await copyText(value);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 1500);
  }

  async function refreshIdentityArtifacts() {
    const token = await getIdentityToken();
    setIdentityToken(token || "");
    return { token: token || "" };
  }

  async function handleConnect() {
    setBindError("");
    setBindResult(null);
    await connect();
    await refreshIdentityArtifacts();
  }

  async function handleDisconnect() {
    await disconnect();
    setIdentityToken("");
    setBindResult(null);
    setBindError("");
  }

  async function handleBindProbe() {
    setBindLoading(true);
    setBindError("");
    setBindResult(null);

    try {
      let nextToken = identityToken;
      if (!nextToken) {
        nextToken = (await getIdentityToken()) || "";
        setIdentityToken(nextToken);
      }
      if (!nextToken) throw new Error("No Web3Auth id_token available");

      const payload: Record<string, unknown> = {
        vault_account: vaultAccount.trim(),
        provider: "web3auth",
        claim_type: claimType.trim(),
        claim_value: claimValue.trim(),
        metadata: {
          source: "web3auth-live-studio",
          encrypted_params: encryptToken,
          runtime_app_id: runtime?.app_id || null,
        },
      };

      if (encryptToken) {
        const keyResponse = await fetch("/api/oracle/public-key");
        const keyBody = await keyResponse.json().catch(() => ({}));
        if (!keyResponse.ok || !keyBody?.public_key) {
          throw new Error(keyBody?.error || "Oracle public key unavailable");
        }
        payload.encrypted_params = await encryptJsonWithOraclePublicKey(keyBody.public_key, JSON.stringify({
          id_token: nextToken,
        }));
      } else {
        payload.id_token = nextToken;
      }

      const response = await fetch("/api/neodid/bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || "NeoDID bind probe failed");
      }
      setBindResult(body);
    } catch (error) {
      setBindError(error instanceof Error ? error.message : String(error));
    } finally {
      setBindLoading(false);
    }
  }

  return (
    <div className="fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
        <Fingerprint size={14} color="var(--neo-green)" />
        <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono)" }}>
          WEB3AUTH LIVE STUDIO
        </span>
      </div>

      <h1>NeoDID Web3Auth Live</h1>
      <p className="lead" style={{ fontSize: "1.05rem", color: "var(--text-primary)", marginBottom: "2rem", lineHeight: 1.6 }}>
        Sign in with Web3Auth, fetch a real <code>id_token</code>, optionally seal it locally with Morpheus X25519 encryption, then submit a live
        <code>neodid_bind</code> request directly to the production NeoDID TEE.
      </p>

      <div className="card-industrial" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.45rem" }}>
              Runtime
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 700 }}>
              {audienceConfigured ? <ShieldCheck size={18} color="var(--neo-green)" /> : <ShieldAlert size={18} color="#ff7b7b" />}
              <span>{audienceConfigured ? "Audience Verified In TEE" : "Audience Not Configured"}</span>
            </div>
            <div style={{ color: "var(--text-secondary)", marginTop: "0.65rem", lineHeight: 1.6 }}>
              App id: <code>{runtime?.app_id || "..."}</code><br />
              Compose hash: <code>{runtime?.compose_hash || "..."}</code><br />
              JWKS: <code>{runtime?.web3auth?.jwks_url || "..."}</code>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button className="btn-secondary" onClick={() => window.location.reload()}>
              <RefreshCcw size={14} /> Refresh
            </button>
            {runtime?.verification_public_key ? (
              <button className="btn-secondary" onClick={() => copyWithToast("runtime-pubkey", runtime.verification_public_key || "")}>
                <Copy size={14} /> {copiedItem === "runtime-pubkey" ? "Copied" : "Copy Verifier Key"}
              </button>
            ) : null}
          </div>
        </div>
        {runtimeError ? (
          <div style={{ marginTop: "1rem", color: "#ff8f8f" }}>{runtimeError}</div>
        ) : null}
      </div>

      <div className="grid grid-2" style={{ gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div className="card-industrial" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" }}>
            <LogIn size={16} color="var(--neo-green)" />
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>1. Web3Auth Login</h3>
          </div>

          <div style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1rem" }}>
            Client id:
            {" "}
            <code>{process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || DEFAULT_WEB3AUTH_CLIENT_ID}</code>
            <br />
            Network:
            {" "}
            <code>{process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || DEFAULT_WEB3AUTH_NETWORK}</code>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <button className="btn-ata" onClick={handleConnect} disabled={busy}>
              <LogIn size={14} /> {isConnected ? "Reconnect" : "Open Web3Auth"}
            </button>
            <button className="btn-secondary" onClick={handleDisconnect} disabled={!isConnected || busy}>
              <LogOut size={14} /> Disconnect
            </button>
            <button className="btn-secondary" onClick={() => void refreshIdentityArtifacts()} disabled={!isConnected || busy}>
              <RefreshCcw size={14} /> Refresh Token
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.75rem" }}>
            {isConnected ? <CheckCircle2 size={16} color="var(--neo-green)" /> : <ShieldAlert size={16} color="#ff7b7b" />}
            <span style={{ fontWeight: 700 }}>{isConnected ? "Connected" : "Not connected"}</span>
          </div>

          {web3authErrors.length > 0 ? (
            <div style={{ color: "#ff8f8f", lineHeight: 1.6 }}>
              {web3authErrors.map(describeWeb3AuthError).join(" | ")}
            </div>
          ) : null}

          {jwtPayload ? (
            <div style={{ marginTop: "1rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Subject: <code>{String(jwtPayload.sub || "unknown")}</code><br />
              Email: <code>{String(jwtPayload.email || jwtPayload.verifierId || "n/a")}</code><br />
              Verifier: <code>{String(jwtPayload.verifier || jwtPayload.aggregateVerifier || "n/a")}</code>
            </div>
          ) : null}

          <div style={{ marginTop: "1rem", color: originDataState?.error ? "#ff8f8f" : "var(--text-secondary)", lineHeight: 1.6 }}>
            Origin signing:
            {" "}
            <code>{originDataState?.origin || currentOrigin || process.env.NEXT_PUBLIC_APP_URL || "unknown"}</code>
            <br />
            Status:
            {" "}
            <code>{originDataState?.origin_data ? "signed" : originDataState?.error ? "unavailable" : "loading"}</code>
            {originDataState?.error ? (
              <>
                <br />
                Reason:
                {" "}
                <code>{describeWeb3AuthError(originDataState.error)}</code>
              </>
            ) : null}
          </div>
        </div>

        <div className="card-industrial" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" }}>
            <KeyRound size={16} color="var(--neo-green)" />
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>2. Identity Token</h3>
          </div>

          <div style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "1rem" }}>
            Raw token:
            {" "}
            <code>{identityToken ? maskToken(identityToken) : "not loaded"}</code>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <button className="btn-secondary" onClick={() => copyWithToast("id-token", identityToken)} disabled={!identityToken}>
              <Copy size={14} /> {copiedItem === "id-token" ? "Copied" : "Copy id_token"}
            </button>
            <label className="btn-secondary" style={{ cursor: "pointer" }}>
              <Lock size={14} />
              <input
                type="checkbox"
                checked={encryptToken}
                onChange={(event) => setEncryptToken(event.target.checked)}
                style={{ marginRight: "8px" }}
              />
              Encrypt before submit
            </label>
          </div>

          {jwtPayload ? (
            <div style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Subject: <code>{String(jwtPayload.sub || "n/a")}</code><br />
              Email: <code>{String(jwtPayload.email || jwtPayload.verifierId || "n/a")}</code><br />
              Audience: <code>{String(jwtPayload.aud || "n/a")}</code><br />
              Aggregated root:
              {" "}
              <code>{String(jwtPayload.aggregateVerifierId || jwtPayload.verifierId || "n/a")}</code>
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)" }}>No JWT payload loaded yet.</div>
          )}
        </div>
      </div>

      <div className="card-industrial" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" }}>
          <Fingerprint size={16} color="var(--neo-green)" />
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>3. Live NeoDID Bind Probe</h3>
        </div>

        <div className="grid grid-2" style={{ gap: "1rem", marginBottom: "1rem" }}>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>Vault Account</div>
            <input style={inputStyle} value={vaultAccount} onChange={(event) => setVaultAccount(event.target.value)} />
          </label>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>Claim Type</div>
            <input style={inputStyle} value={claimType} onChange={(event) => setClaimType(event.target.value)} />
          </label>
        </div>

        <label style={{ display: "block", marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>Claim Value</div>
          <input style={inputStyle} value={claimValue} onChange={(event) => setClaimValue(event.target.value)} />
        </label>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <button className="btn-ata" onClick={() => void handleBindProbe()} disabled={!isConnected || !identityToken || bindLoading}>
              <Fingerprint size={14} /> {bindLoading ? "Submitting..." : "Submit Live Bind"}
            </button>
          <Link href="/docs/neodid" className="btn-secondary" style={{ textDecoration: "none" }}>
            NeoDID Docs <ExternalLink size={14} />
          </Link>
          <Link href="/docs/r/AA_SOCIAL_RECOVERY" className="btn-secondary" style={{ textDecoration: "none" }}>
            AA Recovery Spec <ExternalLink size={14} />
          </Link>
        </div>

        <div style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
          This page sends the token directly to the NeoDID worker, or hides it inside <code>encrypted_params</code> when the encryption toggle is enabled.
          The worker verifies the JWT against Web3Auth JWKS inside the TEE and derives the stable provider root there.
        </div>

        {bindError ? (
          <div style={{ marginTop: "1rem", color: "#ff8f8f", lineHeight: 1.6 }}>{bindError}</div>
        ) : null}

        {bindResult ? (
          <div style={{ marginTop: "1.25rem", padding: "1rem", border: "1px solid var(--border-highlight)", background: "rgba(0,255,163,0.03)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.75rem" }}>
              <CheckCircle2 size={16} color="var(--neo-green)" />
              <span style={{ fontWeight: 800 }}>Live bind completed</span>
            </div>
            <div style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "0.75rem" }}>
              Mode: <code>{String(bindResult.mode || "n/a")}</code><br />
              Provider: <code>{String(bindResult.provider || "n/a")}</code><br />
              Master nullifier: <code>{String(bindResult.master_nullifier || "n/a")}</code><br />
              Attestation hash: <code>{String(bindResult.attestation_hash || "n/a")}</code><br />
              Output hash: <code>{String(bindResult.output_hash || "n/a")}</code>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {bindResult.attestation_hash ? (
                <Link
                  href={`/verifier?attestation_hash=${encodeURIComponent(String(bindResult.attestation_hash))}`}
                  className="btn-secondary"
                  style={{ textDecoration: "none" }}
                >
                  Open Attestation <ExternalLink size={14} />
                </Link>
              ) : null}
              <button className="btn-secondary" onClick={() => copyWithToast("bind-json", JSON.stringify(bindResult, null, 2))}>
                <Copy size={14} /> {copiedItem === "bind-json" ? "Copied" : "Copy Result JSON"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Web3AuthLiveStudio() {
  const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || DEFAULT_WEB3AUTH_CLIENT_ID;
  const web3AuthNetwork = (process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || DEFAULT_WEB3AUTH_NETWORK) as "sapphire_mainnet";
  const [originDataState, setOriginDataState] = useState<OriginDataState | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setRedirectUrl(`${window.location.origin}${window.location.pathname}`);
    }
    void (async () => {
      try {
        const response = await fetch(`/api/web3auth/origin-data?origin=${encodeURIComponent(window.location.origin)}`);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || "Failed to load Web3Auth origin signature");
        setOriginDataState(body);
      } catch (error) {
        setOriginDataState({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, []);

  const connectors = useMemo(() => [
    authConnector({
      connectorSettings: {
        redirectUrl,
        originData: originDataState?.origin_data,
      },
    }),
  ], [originDataState?.origin_data, redirectUrl]);

  return (
    <Web3AuthProvider
      config={{
        web3AuthOptions: {
          clientId,
          web3AuthNetwork,
          ssr: false,
          sessionTime: 3600,
          enableLogging: false,
          connectors,
        },
      }}
    >
      <Web3AuthLiveStudioInner originDataState={originDataState} />
    </Web3AuthProvider>
  );
}
