import { json } from "./platform/core.js";
import { requireAuth } from "./platform/auth.js";
import {
  buildDstackAttestation,
  getDerivedKeySummary,
  getDstackInfo,
} from "./platform/dstack.js";
import {
  buildOracleResponse,
  ensureOracleKeyMaterial,
  handleFeedsPrice,
  handleOracleFeed,
  handleVrf,
  listFeedSymbols,
} from "./oracle/index.js";
import { handleProvidersList } from "./oracle/providers.js";
import {
  handleComputeExecute,
  handleComputeFunctions,
  handleComputeJobs,
} from "./compute/index.js";
import {
  handleRelayTransaction,
  handleSignPayload,
  handleTxProxyInvoke,
} from "./chain/index.js";
import {
  handleNeoDidActionTicket,
  handleNeoDidBind,
  handleNeoDidProviders,
  handleNeoDidRecoveryTicket,
  handleNeoDidRuntime,
} from "./neodid/index.js";

function handleHealth() {
  return json(200, {
    status: "ok",
    runtime: "phala-worker",
    oracle: {
      privacy_oracle: true,
      target_chains: ["neo_n3", "neo_x"],
      pricefeed_chain: "neo_n3",
      compute_merged_into_oracle: true,
    },
    features: [
      "providers",
      "info",
      "attestation",
      "keys/derived",
      "oracle/public-key",
      "oracle/query",
      "oracle/smart-fetch",
      "oracle/feed",
      "feeds/price/:symbol",
      "feeds/catalog",
      "vrf/random",
      "txproxy/invoke",
      "sign/payload",
      "relay/transaction",
      "compute/functions",
      "compute/execute",
      "neodid/providers",
      "neodid/runtime",
      "neodid/bind",
      "neodid/action-ticket",
      "neodid/recovery-ticket",
    ],
  });
}

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  const payload = request.method === "GET" ? Object.fromEntries(url.searchParams.entries()) : await request.json().catch(() => ({}));

  try {
    if (path.endsWith("/health")) return handleHealth();
    if (path.endsWith("/info")) {
      return json(200, { dstack: await getDstackInfo({ required: false }) });
    }
    if (path.endsWith("/attestation")) {
      const reportData = payload.report_data || payload.reportData || payload.output_hash || payload.message || "morpheus-attestation";
      return json(200, { attestation: await buildDstackAttestation(reportData, { required: false }) });
    }

    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    if (path.endsWith("/keys/derived")) {
      const role = typeof payload.role === "string" && payload.role.trim() ? payload.role.trim() : "worker";
      return json(200, { derived: await getDerivedKeySummary(role) });
    }

    if (path.endsWith("/neodid/providers")) return handleNeoDidProviders();
    if (path.endsWith("/neodid/runtime")) return await handleNeoDidRuntime(payload);
    if (path.endsWith("/neodid/bind")) return await handleNeoDidBind(payload);
    if (path.endsWith("/neodid/action-ticket")) return await handleNeoDidActionTicket(payload);
    if (path.endsWith("/neodid/recovery-ticket")) return await handleNeoDidRecoveryTicket(payload);

    if (path.endsWith("/providers")) return await handleProvidersList();

    if (path.endsWith("/oracle/public-key")) {
      const keyMaterial = await ensureOracleKeyMaterial(payload);
      return json(200, {
        algorithm: keyMaterial.algorithm,
        public_key: keyMaterial.publicKeyRaw,
        public_key_format: keyMaterial.key_format,
        key_source: keyMaterial.source,
        recommended_payload_encryption: keyMaterial.algorithm,
        supported_payload_encryption: [
          keyMaterial.algorithm,
        ],
      });
    }

    if (path.endsWith("/oracle/query")) {
      return json(200, await buildOracleResponse(payload, "query"));
    }

    if (path.endsWith("/oracle/smart-fetch")) {
      return json(200, await buildOracleResponse(payload, "smart-fetch"));
    }

    if (path.endsWith('/feeds/catalog')) {
      return json(200, { pairs: listFeedSymbols() });
    }
    if (/\/feeds\/price\/.+/.test(path)) {
      return await handleFeedsPrice(decodeURIComponent(path.split('/').pop() || 'NEO-USD'), Object.fromEntries(url.searchParams.entries()));
    }
    if (path.endsWith('/feeds/price')) {
      return await handleFeedsPrice(url.searchParams.get('symbol') || payload.symbol || 'NEO-USD', { ...Object.fromEntries(url.searchParams.entries()), ...payload });
    }

    if (path.endsWith("/vrf/random")) return await handleVrf(payload);
    if (path.endsWith("/oracle/feed") || payload.action === "oracle_feed") return await handleOracleFeed(payload);
    if (path.endsWith("/txproxy/invoke")) return await handleTxProxyInvoke(payload);
    if (path.endsWith("/sign/payload") || payload.action === "sign_payload") return await handleSignPayload(payload);
    if (path.endsWith("/relay/transaction") || payload.action === "relay_transaction") return await handleRelayTransaction(payload);
    if (path.endsWith("/compute/functions")) return handleComputeFunctions();
    if (path.endsWith("/compute/execute")) return await handleComputeExecute(payload);
    if (/\/compute\/jobs\/.+/.test(path)) return handleComputeJobs(path.split("/").pop() || null);
    if (path.endsWith("/compute/jobs")) return handleComputeJobs();
    return json(404, { error: "not found", path });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : String(error) });
  }
}
