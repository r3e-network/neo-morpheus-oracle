// Compatibility shim: the worker has migrated from Phala dstack TEE to the AWS
// Nitro signer + Secrets Manager (see nitro-signer.js). This re-export keeps
// existing `from '../platform/dstack.js'` imports working; the import-path rename
// is handled by the broader phala->nitro pass.
export * from './nitro-signer.js';
