import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultOracleRoot = path.resolve(moduleDir, '..');

export const MORPHEUS_NEODID_SERVICE_DID = 'did:morpheus:neo_n3:service:neodid';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadOptionalJson(filePath) {
  try {
    return loadJson(filePath);
  } catch {
    return null;
  }
}

function withNetworkSuffix(url, network) {
  const normalized = trimString(url).replace(/\/$/, '');
  if (!normalized) return '';
  if (normalized.endsWith(`/${network}`)) return normalized;
  return `${normalized}/${network}`;
}

function compactObject(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

function resolveSupplementalHashes(network, oracleRoot) {
  if (network === 'mainnet') {
    const deployment = loadOptionalJson(path.join(oracleRoot, 'examples', 'deployments', 'mainnet.json'));
    return {
      aaSessionKeyVerifier:
        trimString(deployment?.neo_n3?.aa_subdomains?.['sessionkey.smartwallet.neo']?.contract_hash) ||
        trimString(deployment?.neo_n3?.aa_subdomains?.sessionkey?.contract_hash),
    };
  }

  const validation = loadOptionalJson(
    path.join(oracleRoot, 'examples', 'deployments', 'testnet-cross-stack-validation.latest.json')
  );
  return {
    aaSessionKeyVerifier: trimString(validation?.shared_testnet_contracts?.aa_session_key_verifier),
  };
}

function buildContracts(network, rawRegistry, supplementalHashes) {
  const contracts = rawRegistry?.neo_n3?.contracts || {};
  const aaVerifiers = rawRegistry?.neo_n3?.aa_verifiers || {};

  return compactObject({
    aaCore: trimString(contracts.abstract_account),
    aaWeb3AuthVerifier: trimString(aaVerifiers.web3auth),
    aaSessionKeyVerifier: trimString(supplementalHashes.aaSessionKeyVerifier),
    aaSocialRecoveryVerifier: trimString(aaVerifiers.social_recovery),
    morpheusOracle: trimString(contracts.morpheus_oracle),
    oracleCallbackConsumer: trimString(contracts.oracle_callback_consumer),
    morpheusDatafeed: trimString(contracts.morpheus_datafeed),
    morpheusNeoDid: trimString(contracts.morpheus_neodid),
  });
}

function buildDomains(rawRegistry) {
  const domains = rawRegistry?.neo_n3?.domains || {};
  const aaSubdomains = rawRegistry?.neo_n3?.aa_subdomains || {};

  return compactObject({
    aa: trimString(domains.morpheus_aa),
    aaAlias: trimString(domains.morpheus_aa_alias),
    aaCore: trimString(aaSubdomains.core),
    aaWeb3AuthVerifier: trimString(aaSubdomains.web3auth),
    aaSessionKeyVerifier: trimString(aaSubdomains.session),
    aaSocialRecoveryVerifier: trimString(aaSubdomains.recovery),
    oracle: trimString(domains.morpheus_oracle),
    datafeed: trimString(domains.morpheus_datafeed),
    neodid: trimString(domains.morpheus_neodid),
  });
}

function buildMorpheusRuntime(network, rawRegistry) {
  const phala = rawRegistry?.phala || {};
  const publicApiUrl = trimString(phala.public_api_url);
  const edgeUrl = trimString(phala.edge_public_url);
  const controlPlaneBaseUrl = trimString(phala.control_plane_url);
  const runtimeUrls = [publicApiUrl, edgeUrl].filter(Boolean);

  return {
    publicApiUrl,
    publicApiUrls: publicApiUrl ? [publicApiUrl] : [],
    runtimeUrl: publicApiUrl,
    runtimeUrls,
    edgeUrl,
    controlPlaneBaseUrl,
    controlPlaneUrl: withNetworkSuffix(controlPlaneBaseUrl, network),
    oracleCvmId: trimString(phala.cvm_id),
    oracleCvmName: trimString(phala.cvm_name),
    oracleAttestationExplorerUrl: trimString(phala.oracle_attestation_explorer_url),
    datafeedCvmId: trimString(phala.datafeed_cvm_id),
    datafeedCvmName: trimString(phala.datafeed_cvm_name),
    datafeedAttestationExplorerUrl: trimString(phala.datafeed_attestation_explorer_url),
    neoDidServiceDid: MORPHEUS_NEODID_SERVICE_DID,
  };
}

function buildPublicNetworkEntry(network, rawRegistry, oracleRoot) {
  const supplementalHashes = resolveSupplementalHashes(network, oracleRoot);
  return {
    network,
    rpcUrl: trimString(rawRegistry?.neo_n3?.rpc_url),
    networkMagic: Number(rawRegistry?.neo_n3?.network_magic || 0),
    morpheus: buildMorpheusRuntime(network, rawRegistry),
    contracts: buildContracts(network, rawRegistry, supplementalHashes),
    domains: buildDomains(rawRegistry),
  };
}

export function loadPublicNetworkRegistry({ oracleRoot = defaultOracleRoot } = {}) {
  const out = {};
  for (const network of ['mainnet', 'testnet']) {
    const rawRegistry = loadJson(path.join(oracleRoot, 'config', 'networks', `${network}.json`));
    out[network] = buildPublicNetworkEntry(network, rawRegistry, oracleRoot);
  }
  return out;
}
