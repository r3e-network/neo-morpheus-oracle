import { json } from "./core.js";
import { requireAuth } from "./auth.js";
import {
  buildOracleResponse,
  ensureOracleKeyMaterial,
  handleFeedsPrice,
  handleOracleFeed,
  handleVrf,
} from "./oracle.js";
import {
  handleComputeExecute,
  handleComputeFunctions,
  handleComputeJobs,
} from "./compute.js";
import {
  handleRelayTransaction,
  handleSignPayload,
  handleTxProxyInvoke,
} from "./chain.js";

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
      "oracle/public-key",
      "oracle/query",
      "oracle/smart-fetch",
      "oracle/feed",
      "feeds/price/:symbol",
      "vrf/random",
      "txproxy/invoke",
      "sign/payload",
      "relay/transaction",
      "compute/functions",
      "compute/execute",
    ],
  });
}

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  const payload = request.method === "GET" ? {} : await request.json().catch(() => ({}));

  try {
    if (path.endsWith("/health")) return handleHealth();

    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    if (path.endsWith("/oracle/public-key")) {
      const keyMaterial = await ensureOracleKeyMaterial();
      return json(200, {
        algorithm: keyMaterial.algorithm,
        public_key: keyMaterial.publicKeyDer,
        public_key_pem: keyMaterial.publicKeyPem,
      });
    }

    if (path.endsWith("/oracle/query")) {
      return json(200, await buildOracleResponse(payload, "query"));
    }

    if (path.endsWith("/oracle/smart-fetch")) {
      return json(200, await buildOracleResponse(payload, "smart-fetch"));
    }

    if (/\/feeds\/price\/.+/.test(path)) {
      return handleFeedsPrice(decodeURIComponent(path.split("/").pop() || "NEO-USD"));
    }
    if (path.endsWith("/feeds/price")) {
      return handleFeedsPrice(url.searchParams.get("symbol") || payload.symbol || "NEO-USD");
    }

    if (path.endsWith("/vrf/random")) return handleVrf(payload);
    if (path.endsWith("/oracle/feed") || payload.action === "oracle_feed") return handleOracleFeed(payload);
    if (path.endsWith("/txproxy/invoke")) return handleTxProxyInvoke(payload);
    if (path.endsWith("/sign/payload") || payload.action === "sign_payload") return handleSignPayload(payload);
    if (path.endsWith("/relay/transaction") || payload.action === "relay_transaction") return handleRelayTransaction(payload);
    if (path.endsWith("/compute/functions")) return handleComputeFunctions();
    if (path.endsWith("/compute/execute")) return handleComputeExecute(payload);
    if (/\/compute\/jobs\/.+/.test(path)) return handleComputeJobs(path.split("/").pop() || null);
    if (path.endsWith("/compute/jobs")) return handleComputeJobs();

    return json(404, { error: "not found", path });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : String(error) });
  }
}
