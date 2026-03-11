import { createHash } from "node:crypto";
import { wallet as neoWallet } from "@cityofzion/neon-js";
import { json, sha256Hex, stableStringify, trimString } from "../platform/core.js";
import { resolveConfidentialPayload } from "../oracle/crypto.js";
import { buildVerificationEnvelope, buildSignedResultEnvelope } from "../chain/index.js";
import { maybeBuildDstackAttestation, deriveKeyBytes, deriveNeoN3PrivateKeyHex, getDstackInfo, shouldUseDerivedKeys } from "../platform/dstack.js";

const NEODID_BINDING_DOMAIN = Buffer.from("neodid-binding-v1", "utf8");
const NEODID_ACTION_DOMAIN = Buffer.from("neodid-action-v1", "utf8");
const FIXED_HASH_BYTES = 32;
const SUPPORTED_PROVIDERS = [
  { id: "twitter", category: "social", aliases: [], auth_modes: ["oauth"], claim_types: ["Twitter_VIP", "Twitter_Verified", "Twitter_Followers"] },
  { id: "github", category: "social", aliases: [], auth_modes: ["oauth"], claim_types: ["Github_Contributor", "Github_OrgMember", "Github_VerifiedUser"] },
  { id: "google", category: "social", aliases: ["gmail"], auth_modes: ["oauth"], claim_types: ["Google_Identity", "Google_Workspace", "Google_VerifiedEmail"] },
  { id: "discord", category: "social", aliases: [], auth_modes: ["oauth"], claim_types: ["Discord_Member"] },
  { id: "telegram", category: "social", aliases: [], auth_modes: ["oauth"], claim_types: ["Telegram_Member"] },
  { id: "binance", category: "exchange", aliases: [], auth_modes: ["api", "oauth"], claim_types: ["Binance_KYC", "Binance_VIP", "Binance_AssetHolder"] },
  { id: "okx", category: "exchange", aliases: ["okex"], auth_modes: ["api", "oauth"], claim_types: ["OKX_KYC", "OKX_VIP", "OKX_AssetHolder"] },
  { id: "email", category: "contact", aliases: ["mail"], auth_modes: ["otp", "magic_link"], claim_types: ["Email_Verified"] },
  { id: "generic_oauth", category: "generic", aliases: [], auth_modes: ["oauth"], claim_types: ["Generic_Claim"] },
];

const PROVIDER_ALIAS_MAP = Object.fromEntries(
  SUPPORTED_PROVIDERS.flatMap((provider) => [
    [provider.id, provider.id],
    ...(provider.aliases || []).map((alias) => [alias, provider.id]),
  ]),
);

function encodeLengthPrefixedAscii(value = "") {
  const text = String(value ?? "");
  const body = Buffer.from(text, "utf8");
  if (body.length > 255) {
    throw new Error("segment too long");
  }
  return Buffer.concat([Buffer.from([body.length]), body]);
}

function normalizeHashHex(value) {
  return trimString(value).replace(/^0x/i, "").toLowerCase();
}

function normalizeNeoDidProviderId(value) {
  const normalized = trimString(value).toLowerCase();
  return PROVIDER_ALIAS_MAP[normalized] || normalized;
}

function requireSupportedProvider(value) {
  const providerId = normalizeNeoDidProviderId(value);
  if (!SUPPORTED_PROVIDERS.some((provider) => provider.id === providerId)) {
    throw new Error(`unsupported neodid provider: ${value}`);
  }
  return providerId;
}

async function resolveNeoDidSalt(payload = {}) {
  const explicit = trimString(payload.neodid_secret_salt || process.env.NEODID_SECRET_SALT || "");
  if (explicit) {
    return Buffer.from(sha256Hex(explicit), "hex");
  }
  try {
    const configuredPath = trimString(process.env.PHALA_DSTACK_NEODID_SALT_PATH || "");
    const keyPath = configuredPath || "morpheus/neodid/nullifier/v1";
    return await deriveKeyBytes(keyPath, "neodid-nullifier-salt");
  } catch {
    const info = await getDstackInfo({ required: false }).catch(() => null);
    return Buffer.from(sha256Hex(`neodid:${info?.app_id || "fallback"}`), "hex");
  }
}

function computeMasterNullifier(provider, providerUid, saltBytes) {
  return createHash("sha256")
    .update(Buffer.from(String(provider || ""), "utf8"))
    .update(Buffer.from([0x1f]))
    .update(Buffer.from(String(providerUid || ""), "utf8"))
    .update(Buffer.from([0x1f]))
    .update(saltBytes)
    .digest("hex");
}

function computeActionNullifier(provider, providerUid, actionId, saltBytes) {
  return createHash("sha256")
    .update(Buffer.from(String(provider || ""), "utf8"))
    .update(Buffer.from([0x1f]))
    .update(Buffer.from(String(providerUid || ""), "utf8"))
    .update(Buffer.from([0x1f]))
    .update(Buffer.from(String(actionId || ""), "utf8"))
    .update(Buffer.from([0x1f]))
    .update(saltBytes)
    .digest("hex");
}

function computeMetadataHash(metadata) {
  return sha256Hex(metadata ?? {});
}

function buildBindingDigestBytes(ticket) {
  return createHash("sha256").update(Buffer.concat([
    NEODID_BINDING_DOMAIN,
    Buffer.from(ticket.vault_account.replace(/^0x/i, ""), "hex"),
    encodeLengthPrefixedAscii(ticket.provider),
    encodeLengthPrefixedAscii(ticket.claim_type),
    encodeLengthPrefixedAscii(ticket.claim_value || ""),
    Buffer.from(ticket.master_nullifier, "hex"),
    Buffer.from(ticket.metadata_hash, "hex"),
  ])).digest();
}

function buildActionDigestBytes(ticket) {
  return createHash("sha256").update(Buffer.concat([
    NEODID_ACTION_DOMAIN,
    Buffer.from(ticket.disposable_account.replace(/^0x/i, ""), "hex"),
    encodeLengthPrefixedAscii(ticket.action_id),
    Buffer.from(ticket.action_nullifier, "hex"),
  ])).digest();
}

async function resolveNeoDidSignerPrivateKey(payload = {}) {
  let privateKey = trimString(payload.private_key || payload.signing_key || process.env.NEODID_NEO_N3_PRIVATE_KEY || "");
  if (!privateKey && shouldUseDerivedKeys(payload)) {
    try {
      privateKey = await deriveNeoN3PrivateKeyHex("neodid");
    } catch {
      // fall through
    }
  }
  if (!privateKey) {
    privateKey = trimString(process.env.PHALA_NEO_N3_PRIVATE_KEY || process.env.PHALA_NEO_N3_WIF || "");
  }
  if (!privateKey) throw new Error("NeoDID signing key is not configured");
  return privateKey;
}

async function signDigestBytes(digestBytes, payload = {}) {
  const privateKey = await resolveNeoDidSignerPrivateKey(payload);
  const account = new neoWallet.Account(privateKey);
  return {
    signature: neoWallet.sign(Buffer.from(digestBytes).toString("hex"), account.privateKey),
    public_key: account.publicKey,
    signer_address: account.address,
    signer_script_hash: `0x${account.scriptHash}`,
  };
}

function resolveProviderUid(payload = {}) {
  const providerUid = trimString(payload.provider_uid || payload.social_uid || payload.user_id || payload.account_id || "");
  if (!providerUid) throw new Error("provider_uid is required");
  return providerUid;
}

function resolveHash160(value, fieldName) {
  const normalized = trimString(value).replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) throw new Error(`${fieldName} must be a 20-byte hash160`);
  return `0x${normalized}`;
}

export function handleNeoDidProviders() {
  return json(200, { providers: SUPPORTED_PROVIDERS });
}

export async function handleNeoDidRuntime(payload = {}) {
  const info = await getDstackInfo({ required: false });
  const signer = await signDigestBytes(Buffer.from(sha256Hex("neodid-runtime"), "hex"), payload);
  return json(200, {
    service: "neodid",
    app_id: info?.app_id || null,
    instance_id: info?.instance_id || null,
    compose_hash: info?.compose_hash || null,
    verification_public_key: signer.public_key,
    verifier_curve: "secp256r1",
    providers: SUPPORTED_PROVIDERS,
  });
}

export async function handleNeoDidBind(payload = {}) {
  const resolvedPayload = await resolveConfidentialPayload(payload);
  const saltBytes = await resolveNeoDidSalt(resolvedPayload);
  const ticket = {
    vault_account: resolveHash160(resolvedPayload.vault_account || resolvedPayload.vault_script_hash, "vault_account"),
    provider: requireSupportedProvider(resolvedPayload.provider || "twitter"),
    provider_uid: resolveProviderUid(resolvedPayload),
    claim_type: trimString(resolvedPayload.claim_type || "Generic_Claim") || "Generic_Claim",
    claim_value: trimString(resolvedPayload.claim_value || ""),
    metadata_hash: computeMetadataHash(resolvedPayload.metadata || {}),
  };
  ticket.master_nullifier = computeMasterNullifier(ticket.provider, ticket.provider_uid, saltBytes);
  const digestBytes = buildBindingDigestBytes(ticket);
  const signer = await signDigestBytes(digestBytes, resolvedPayload);
  const result = {
    mode: "neodid_bind",
    vault_account: ticket.vault_account,
    provider: ticket.provider,
    claim_type: ticket.claim_type,
    claim_value: ticket.claim_value,
    master_nullifier: `0x${ticket.master_nullifier}`,
    metadata_hash: `0x${ticket.metadata_hash}`,
    digest: `0x${Buffer.from(digestBytes).toString("hex")}`,
    ...signer,
  };
  const signed = await buildSignedResultEnvelope(result, resolvedPayload);
  const teeAttestation = await maybeBuildDstackAttestation(resolvedPayload, signed.output_hash);
  return json(200, {
    ...result,
    output_hash: signed.output_hash,
    attestation_hash: signed.attestation_hash,
    verification: buildVerificationEnvelope(signed, teeAttestation),
    tee_attestation: teeAttestation,
  });
}

export async function handleNeoDidActionTicket(payload = {}) {
  const resolvedPayload = await resolveConfidentialPayload(payload);
  const saltBytes = await resolveNeoDidSalt(resolvedPayload);
  const provider = requireSupportedProvider(resolvedPayload.provider || "twitter");
  const providerUid = resolveProviderUid(resolvedPayload);
  const actionId = trimString(resolvedPayload.action_id || resolvedPayload.intent || "").trim();
  if (!actionId) throw new Error("action_id is required");
  const actionNullifier = computeActionNullifier(provider, providerUid, actionId, saltBytes);
  const ticket = {
    disposable_account: resolveHash160(resolvedPayload.disposable_account || resolvedPayload.disposable_script_hash, "disposable_account"),
    action_id: actionId,
    action_nullifier: actionNullifier,
  };
  const digestBytes = buildActionDigestBytes(ticket);
  const signer = await signDigestBytes(digestBytes, resolvedPayload);
  const result = {
    mode: "neodid_action_ticket",
    disposable_account: ticket.disposable_account,
    action_id: ticket.action_id,
    action_nullifier: `0x${ticket.action_nullifier}`,
    digest: `0x${Buffer.from(digestBytes).toString("hex")}`,
    ...signer,
  };
  const signed = await buildSignedResultEnvelope(result, resolvedPayload);
  const teeAttestation = await maybeBuildDstackAttestation(resolvedPayload, signed.output_hash);
  return json(200, {
    ...result,
    output_hash: signed.output_hash,
    attestation_hash: signed.attestation_hash,
    verification: buildVerificationEnvelope(signed, teeAttestation),
    tee_attestation: teeAttestation,
  });
}
