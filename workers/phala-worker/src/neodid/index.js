import { createHash } from "node:crypto";
import { wallet as neoWallet } from "@cityofzion/neon-js";
import { json, sha256Hex, trimString } from "../platform/core.js";
import { resolveConfidentialPayload } from "../oracle/crypto.js";
import { buildVerificationEnvelope, buildSignedResultEnvelope } from "../chain/index.js";
import { maybeBuildDstackAttestation, deriveKeyBytes, deriveNeoN3PrivateKeyHex, getDstackInfo, shouldUseDerivedKeys } from "../platform/dstack.js";

const NEODID_BINDING_DOMAIN = Buffer.from("neodid-binding-v1", "utf8");
const NEODID_ACTION_DOMAIN = Buffer.from("neodid-action-v1", "utf8");
const NEODID_RECOVERY_DOMAIN = Buffer.from("neodid-recovery-v1", "utf8");
const SUPPORTED_PROVIDERS = [
  { id: "web3auth", category: "identity", aliases: ["w3a"], auth_modes: ["aggregate_oauth", "mfa"], claim_types: ["Web3Auth_PrimaryIdentity", "Web3Auth_LinkedSocials", "Web3Auth_VerifiedUser"] },
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

function encodeHash160OrZero(value) {
  if (!value) return Buffer.alloc(20, 0);
  return Buffer.from(value.replace(/^0x/i, ""), "hex");
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

function buildRecoveryDigestBytes(ticket) {
  return createHash("sha256").update(Buffer.concat([
    NEODID_RECOVERY_DOMAIN,
    encodeLengthPrefixedAscii(ticket.network),
    Buffer.from(ticket.aa_contract.replace(/^0x/i, ""), "hex"),
    encodeHash160OrZero(ticket.verifier_contract),
    encodeHash160OrZero(ticket.account_address),
    encodeLengthPrefixedAscii(ticket.account_id),
    Buffer.from(ticket.new_owner.replace(/^0x/i, ""), "hex"),
    encodeLengthPrefixedAscii(ticket.recovery_nonce),
    encodeLengthPrefixedAscii(ticket.expires_at),
    encodeLengthPrefixedAscii(ticket.action_id),
    Buffer.from(ticket.master_nullifier, "hex"),
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

function resolveOptionalHash160(value, fieldName) {
  const text = trimString(value);
  if (!text) return null;
  return resolveHash160(text, fieldName);
}

function resolveRequiredText(value, fieldName) {
  const text = trimString(value);
  if (!text) throw new Error(`${fieldName} is required`);
  if (Buffer.byteLength(text, "utf8") > 255) throw new Error(`${fieldName} is too long`);
  return text;
}

function resolveRecoveryActionId(payload, network, aaContract, accountId, newOwner, recoveryNonce) {
  const explicit = trimString(payload.action_id || payload.recovery_action_id || payload.recovery_id || payload.intent || "");
  if (explicit) return resolveRequiredText(explicit, "action_id");
  const digest = sha256Hex([
    "aa_recovery",
    network,
    aaContract,
    accountId,
    newOwner,
    recoveryNonce,
  ].join("\u001f"));
  return resolveRequiredText(
    `aa_recovery:${digest}`,
    "action_id",
  );
}

async function buildNeoDidResponse(mode, result, payload) {
  const signed = await buildSignedResultEnvelope(result, payload);
  const teeAttestation = await maybeBuildDstackAttestation(payload, signed.output_hash);
  const callbackEncoding = trimString(payload.callback_encoding || payload.result_encoding || "");
  return json(200, {
    ...result,
    mode,
    callback_encoding: callbackEncoding || undefined,
    output_hash: signed.output_hash,
    attestation_hash: signed.attestation_hash,
    verification: buildVerificationEnvelope(signed, teeAttestation),
    tee_attestation: teeAttestation,
  });
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
    supported_routes: [
      "/neodid/providers",
      "/neodid/runtime",
      "/neodid/bind",
      "/neodid/action-ticket",
      "/neodid/recovery-ticket",
    ],
    request_types: [
      "neodid_bind",
      "neodid_action_ticket",
      "neodid_recovery_ticket",
    ],
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
    vault_account: ticket.vault_account,
    provider: ticket.provider,
    claim_type: ticket.claim_type,
    claim_value: ticket.claim_value,
    master_nullifier: `0x${ticket.master_nullifier}`,
    metadata_hash: `0x${ticket.metadata_hash}`,
    digest: `0x${Buffer.from(digestBytes).toString("hex")}`,
    ...signer,
  };
  return buildNeoDidResponse("neodid_bind", result, resolvedPayload);
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
    disposable_account: ticket.disposable_account,
    action_id: ticket.action_id,
    action_nullifier: `0x${ticket.action_nullifier}`,
    digest: `0x${Buffer.from(digestBytes).toString("hex")}`,
    ...signer,
  };
  return buildNeoDidResponse("neodid_action_ticket", result, resolvedPayload);
}

export async function handleNeoDidRecoveryTicket(payload = {}) {
  const resolvedPayload = await resolveConfidentialPayload(payload);
  const saltBytes = await resolveNeoDidSalt(resolvedPayload);
  const provider = requireSupportedProvider(resolvedPayload.provider || "twitter");
  const providerUid = resolveProviderUid(resolvedPayload);
  const network = resolveRequiredText(resolvedPayload.network || resolvedPayload.target_chain || "neo_n3", "network");
  const aaContract = resolveHash160(
    resolvedPayload.aa_contract || resolvedPayload.account_contract || resolvedPayload.wallet_contract,
    "aa_contract",
  );
  const verifierContract = resolveOptionalHash160(
    resolvedPayload.verifier_contract || resolvedPayload.recovery_verifier_contract,
    "verifier_contract",
  );
  const accountAddress = resolveOptionalHash160(
    resolvedPayload.account_address || resolvedPayload.aa_address || resolvedPayload.wallet_address,
    "account_address",
  );
  const accountId = resolveRequiredText(
    resolvedPayload.account_id || resolvedPayload.accountId || resolvedPayload.wallet_id,
    "account_id",
  );
  const newOwner = resolveHash160(
    resolvedPayload.new_owner || resolvedPayload.recovery_address || resolvedPayload.target_owner,
    "new_owner",
  );
  const recoveryNonce = resolveRequiredText(
    resolvedPayload.recovery_nonce || resolvedPayload.nonce,
    "recovery_nonce",
  );
  const expiresAt = resolveRequiredText(
    resolvedPayload.expires_at || resolvedPayload.expiry || resolvedPayload.ticket_expires_at,
    "expires_at",
  );
  const masterNullifier = computeMasterNullifier(provider, providerUid, saltBytes);
  const actionId = resolveRecoveryActionId(resolvedPayload, network, aaContract, accountId, newOwner, recoveryNonce);
  const actionNullifier = computeActionNullifier(provider, providerUid, actionId, saltBytes);

  const ticket = {
    network,
    aa_contract: aaContract,
    verifier_contract: verifierContract,
    account_address: accountAddress,
    account_id: accountId,
    new_owner: newOwner,
    recovery_nonce: recoveryNonce,
    expires_at: expiresAt,
    action_id: actionId,
    master_nullifier: masterNullifier,
    action_nullifier: actionNullifier,
  };
  const digestBytes = buildRecoveryDigestBytes(ticket);
  const signer = await signDigestBytes(digestBytes, resolvedPayload);
  const result = {
    network: ticket.network,
    aa_contract: ticket.aa_contract,
    verifier_contract: ticket.verifier_contract,
    account_address: ticket.account_address,
    account_id: ticket.account_id,
    new_owner: ticket.new_owner,
    recovery_nonce: ticket.recovery_nonce,
    expires_at: ticket.expires_at,
    provider,
    action_id: ticket.action_id,
    master_nullifier: `0x${ticket.master_nullifier}`,
    action_nullifier: `0x${ticket.action_nullifier}`,
    digest: `0x${Buffer.from(digestBytes).toString("hex")}`,
    ...signer,
  };
  return buildNeoDidResponse("neodid_recovery_ticket", result, resolvedPayload);
}
