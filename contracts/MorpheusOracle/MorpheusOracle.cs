using System;
using System.ComponentModel;
using System.Numerics;
using Neo;
using Neo.SmartContract;
using Neo.SmartContract.Framework;
using Neo.SmartContract.Framework.Attributes;
using Neo.SmartContract.Framework.Native;
using Neo.SmartContract.Framework.Services;

namespace MorpheusOracle.Contracts
{
    public enum KernelRequestStatus : byte
    {
        Pending = 0,
        Succeeded = 1,
        Failed = 2
    }

    public delegate void MiniAppRegisteredHandler(string appId, UInt160 admin, UInt160 feePayer, UInt160 callbackContract);
    public delegate void MiniAppUpdatedHandler(string appId, UInt160 admin, UInt160 feePayer, UInt160 callbackContract, bool active);
    public delegate void SystemModuleRegisteredHandler(string moduleId, string endpoint, string schemaHash);
    public delegate void SystemModuleUpdatedHandler(string moduleId, string endpoint, string schemaHash, bool active);
    public delegate void MiniAppCapabilityGrantedHandler(string appId, string moduleId);
    public delegate void MiniAppCapabilityRevokedHandler(string appId, string moduleId);
    public delegate void MiniAppRequestQueuedHandler(BigInteger requestId, string appId, string moduleId, string operation, UInt160 requester, UInt160 sponsor, ByteString payload);
    public delegate void MiniAppRequestCompletedHandler(BigInteger requestId, string appId, string moduleId, string operation, bool success, ByteString resultHash, BigInteger resultSize, string error);
    public delegate void MiniAppInboxStoredHandler(string appId, BigInteger requestId, UInt160 requester, bool success);
    public delegate void MiniAppStateChangedHandler(string appId, ByteString stateKey, BigInteger valueSize);
    public delegate void AdminChangedHandler(UInt160 oldAdmin, UInt160 newAdmin);
    public delegate void UpdaterChangedHandler(UInt160 oldUpdater, UInt160 newUpdater);
    public delegate void RuntimeEncryptionKeyUpdatedHandler(BigInteger version, string algorithm, string publicKey);
    public delegate void RuntimeVerifierUpdatedHandler(ECPoint oldVerifier, ECPoint newVerifier);
    public delegate void RequestFeeUpdatedHandler(BigInteger oldFee, BigInteger newFee);
    public delegate void RequestFeeDepositedHandler(UInt160 from, BigInteger amount, BigInteger creditBalance);
    public delegate void AccruedFeesWithdrawnHandler(UInt160 to, BigInteger amount);
    public delegate void RequestExpiredHandler(BigInteger requestId, string appId, UInt160 requester, UInt160 sponsor, BigInteger refundAmount);
    public delegate void RequestTTLUpdatedHandler(BigInteger oldTTL, BigInteger newTTL);

    /// <summary>
    /// Legacy deployment name retained for compatibility, now acting as the shared MiniApp OS kernel.
    /// </summary>
    /// <remarks>
    /// The contract centralizes generic platform concerns:
    /// - miniapp registration and discovery
    /// - module registry and capability grants
    /// - unified async request queue / inbox delivery
    /// - prepaid fee credits and runtime verification keys
    /// - generic namespaced app state for registration-only miniapps
    ///
    /// Miniapps are expected to keep only their business semantics off-chain or in optional
    /// extension contracts, while the kernel owns IO, callback delivery, and state plumbing.
    /// </remarks>
    [DisplayName("MorpheusOracle")]
    [ManifestExtra("Author", "Morpheus Oracle")]
    [ManifestExtra("Version", "2.0.0")]
    [ManifestExtra("Description", "MiniApp OS kernel with shared IO, registration, and callback orchestration")]
    [ContractPermission("*", "onMiniAppResult")]
    public class MorpheusOracle : SmartContract
    {
        private static readonly byte[] PREFIX_ADMIN = new byte[] { 0x01 };
        private static readonly byte[] PREFIX_UPDATER = new byte[] { 0x02 };
        private static readonly byte[] PREFIX_REQUEST = new byte[] { 0x03 };
        private static readonly byte[] PREFIX_COUNTER = new byte[] { 0x04 };
        private static readonly byte[] PREFIX_APP = new byte[] { 0x05 };
        private static readonly byte[] PREFIX_APP_INDEX = new byte[] { 0x06 };
        private static readonly byte[] PREFIX_APP_COUNT = new byte[] { 0x07 };
        private static readonly byte[] PREFIX_MODULE = new byte[] { 0x08 };
        private static readonly byte[] PREFIX_MODULE_INDEX = new byte[] { 0x09 };
        private static readonly byte[] PREFIX_MODULE_COUNT = new byte[] { 0x10 };
        private static readonly byte[] PREFIX_APP_MODULE_GRANT = new byte[] { 0x11 };
        private static readonly byte[] PREFIX_RUNTIME_KEY = new byte[] { 0x12 };
        private static readonly byte[] PREFIX_RUNTIME_KEY_ALGO = new byte[] { 0x13 };
        private static readonly byte[] PREFIX_RUNTIME_KEY_VERSION = new byte[] { 0x14 };
        private static readonly byte[] PREFIX_RUNTIME_VERIFIER = new byte[] { 0x15 };
        private static readonly byte[] PREFIX_TOTAL_REQUESTS = new byte[] { 0x16 };
        private static readonly byte[] PREFIX_TOTAL_FULFILLED = new byte[] { 0x17 };
        private static readonly byte[] PREFIX_REQUEST_FEE = new byte[] { 0x18 };
        private static readonly byte[] PREFIX_REQUEST_CREDIT = new byte[] { 0x19 };
        private static readonly byte[] PREFIX_ACCRUED_REQUEST_FEES = new byte[] { 0x20 };
        private static readonly byte[] PREFIX_APP_REQUESTS = new byte[] { 0x21 };
        private static readonly byte[] PREFIX_APP_FULFILLED = new byte[] { 0x22 };
        private static readonly byte[] PREFIX_APP_INBOX = new byte[] { 0x23 };
        private static readonly byte[] PREFIX_APP_STATE = new byte[] { 0x24 };
        private static readonly byte[] PREFIX_REQUEST_TTL = new byte[] { 0x25 };
        private static readonly byte[] FULFILLMENT_SIGNATURE_DOMAIN = new byte[] { 109, 105, 110, 105, 97, 112, 112, 45, 111, 115, 45, 102, 117, 108, 102, 105, 108, 108, 109, 101, 110, 116, 45, 118, 49 };

        private const int MAX_APP_ID_LENGTH = 64;
        private const int MAX_MODULE_ID_LENGTH = 64;
        private const int MAX_OPERATION_LENGTH = 64;
        private const int MAX_PAYLOAD_LENGTH = 4096;
        private const int MAX_RESULT_LENGTH = 4096;
        private const int MAX_ERROR_LENGTH = 256;
        private const int MAX_RUNTIME_KEY_ALGO_LENGTH = 64;
        private const int MAX_RUNTIME_KEY_LENGTH = 2048;
        private const int MAX_METADATA_URI_LENGTH = 256;
        private const int MAX_METADATA_HASH_LENGTH = 128;
        private const int MAX_STATE_KEY_LENGTH = 128;
        private const int MAX_STATE_VALUE_LENGTH = 4096;
        private const string CALLBACK_METHOD = "onMiniAppResult";
        private const long DEFAULT_REQUEST_FEE = 1_000_000;
        /// <summary>
        /// Default request TTL in milliseconds (1 hour = 3,600,000 ms).
        /// Stale requests older than this can be expired to refund the fee credit.
        /// Runtime.Time on Neo N3 is in milliseconds since epoch.
        /// </summary>
        private const long DEFAULT_REQUEST_TTL = 3_600_000;

        public struct MiniAppRecord
        {
            public string AppId;
            public UInt160 Admin;
            public UInt160 FeePayer;
            public UInt160 CallbackContract;
            public string MetadataUri;
            public string MetadataHash;
            public bool Active;
            public BigInteger CreatedAt;
            public BigInteger UpdatedAt;
        }

        public struct SystemModuleRecord
        {
            public string ModuleId;
            public string Endpoint;
            public string SchemaHash;
            public bool Active;
            public BigInteger CreatedAt;
            public BigInteger UpdatedAt;
        }

        public struct KernelRequest
        {
            public BigInteger Id;
            public string AppId;
            public string ModuleId;
            public string Operation;
            public ByteString Payload;
            public UInt160 Requester;
            public UInt160 Sponsor;
            public UInt160 CallbackContract;
            public KernelRequestStatus Status;
            public BigInteger CreatedAt;
            public BigInteger FulfilledAt;
            public bool Success;
            public ByteString Result;
            public string Error;
        }

        public struct InboxItem
        {
            public string AppId;
            public BigInteger RequestId;
            public string ModuleId;
            public string Operation;
            public UInt160 Requester;
            public bool Success;
            public ByteString Result;
            public string Error;
            public BigInteger DeliveredAt;
        }

        [DisplayName("MiniAppRegistered")]
        public static event MiniAppRegisteredHandler OnMiniAppRegistered;

        [DisplayName("MiniAppUpdated")]
        public static event MiniAppUpdatedHandler OnMiniAppUpdated;

        [DisplayName("SystemModuleRegistered")]
        public static event SystemModuleRegisteredHandler OnSystemModuleRegistered;

        [DisplayName("SystemModuleUpdated")]
        public static event SystemModuleUpdatedHandler OnSystemModuleUpdated;

        [DisplayName("MiniAppCapabilityGranted")]
        public static event MiniAppCapabilityGrantedHandler OnMiniAppCapabilityGranted;

        [DisplayName("MiniAppCapabilityRevoked")]
        public static event MiniAppCapabilityRevokedHandler OnMiniAppCapabilityRevoked;

        [DisplayName("MiniAppRequestQueued")]
        public static event MiniAppRequestQueuedHandler OnMiniAppRequestQueued;

        [DisplayName("MiniAppRequestCompleted")]
        public static event MiniAppRequestCompletedHandler OnMiniAppRequestCompleted;

        [DisplayName("MiniAppInboxStored")]
        public static event MiniAppInboxStoredHandler OnMiniAppInboxStored;

        [DisplayName("MiniAppStateChanged")]
        public static event MiniAppStateChangedHandler OnMiniAppStateChanged;

        [DisplayName("AdminChanged")]
        public static event AdminChangedHandler OnAdminChanged;

        [DisplayName("UpdaterChanged")]
        public static event UpdaterChangedHandler OnUpdaterChanged;

        [DisplayName("RuntimeEncryptionKeyUpdated")]
        public static event RuntimeEncryptionKeyUpdatedHandler OnRuntimeEncryptionKeyUpdated;

        [DisplayName("RuntimeVerifierUpdated")]
        public static event RuntimeVerifierUpdatedHandler OnRuntimeVerifierUpdated;

        [DisplayName("RequestFeeUpdated")]
        public static event RequestFeeUpdatedHandler OnRequestFeeUpdated;

        [DisplayName("RequestFeeDeposited")]
        public static event RequestFeeDepositedHandler OnRequestFeeDeposited;

        [DisplayName("AccruedFeesWithdrawn")]
        public static event AccruedFeesWithdrawnHandler OnAccruedFeesWithdrawn;

        [DisplayName("RequestExpired")]
        public static event RequestExpiredHandler OnRequestExpired;

        [DisplayName("RequestTTLUpdated")]
        public static event RequestTTLUpdatedHandler OnRequestTTLUpdated;

        public static void _deploy(object data, bool update)
        {
            if (update) return;

            Transaction tx = Runtime.Transaction;
            Storage.Put(Storage.CurrentContext, PREFIX_ADMIN, tx.Sender);
            Storage.Put(Storage.CurrentContext, PREFIX_COUNTER, 0);
            Storage.Put(Storage.CurrentContext, PREFIX_REQUEST_FEE, DEFAULT_REQUEST_FEE);

            SeedBuiltInModule("oracle.fetch", "/oracle/smart-fetch", "morpheus.module.oracle.fetch.v1");
            SeedBuiltInModule("compute.run", "/compute/execute", "morpheus.module.compute.run.v1");
            SeedBuiltInModule("feed.read", "/oracle/feed", "morpheus.module.feed.read.v1");
            SeedBuiltInModule("feed.publish", "/oracle/feed", "morpheus.module.feed.publish.v1");
            SeedBuiltInModule("identity.verify", "/neodid/resolve", "morpheus.module.identity.verify.v1");
            SeedBuiltInModule("automation.run", "/automation/execute", "morpheus.module.automation.run.v1");
        }

        [Safe]
        public static UInt160 Admin()
        {
            return (UInt160)Storage.Get(Storage.CurrentContext, PREFIX_ADMIN);
        }

        [Safe]
        public static UInt160 Updater()
        {
            return (UInt160)Storage.Get(Storage.CurrentContext, PREFIX_UPDATER);
        }

        [Safe]
        public static string RuntimeEncryptionAlgorithm()
        {
            return (string)Storage.Get(Storage.CurrentContext, PREFIX_RUNTIME_KEY_ALGO);
        }

        [Safe]
        public static string RuntimeEncryptionPublicKey()
        {
            return (string)Storage.Get(Storage.CurrentContext, PREFIX_RUNTIME_KEY);
        }

        [Safe]
        public static BigInteger RuntimeEncryptionKeyVersion()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_RUNTIME_KEY_VERSION);
            return raw == null ? 0 : (BigInteger)raw;
        }

        [Safe]
        public static ECPoint RuntimeVerificationPublicKey()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_RUNTIME_VERIFIER);
            return raw == null ? null : (ECPoint)(byte[])raw;
        }

        // Legacy aliases kept so existing clients can migrate incrementally.
        [Safe]
        public static string OracleEncryptionAlgorithm() => RuntimeEncryptionAlgorithm();

        [Safe]
        public static string OracleEncryptionPublicKey() => RuntimeEncryptionPublicKey();

        [Safe]
        public static BigInteger OracleEncryptionKeyVersion() => RuntimeEncryptionKeyVersion();

        [Safe]
        public static ECPoint OracleVerificationPublicKey() => RuntimeVerificationPublicKey();

        [Safe]
        public static BigInteger SystemRequestFee()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_REQUEST_FEE);
            return raw == null ? DEFAULT_REQUEST_FEE : (BigInteger)raw;
        }

        [Safe]
        public static BigInteger RequestFee() => SystemRequestFee();

        /// <summary>
        /// Returns the configured request TTL in milliseconds.
        /// Requests older than this TTL can be expired via ExpireStaleRequest.
        /// </summary>
        [Safe]
        public static BigInteger RequestTTL()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_REQUEST_TTL);
            return raw == null ? DEFAULT_REQUEST_TTL : (BigInteger)raw;
        }

        [Safe]
        public static BigInteger FeeCreditOf(UInt160 requester)
        {
            if (requester == null || !requester.IsValid) return 0;
            ByteString raw = RequestCreditMap().Get((byte[])requester);
            return raw == null ? 0 : (BigInteger)raw;
        }

        [Safe]
        public static BigInteger AccruedRequestFees()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_ACCRUED_REQUEST_FEES);
            return raw == null ? 0 : (BigInteger)raw;
        }

        [Safe]
        public static BigInteger GetMiniAppCount()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_APP_COUNT);
            return raw == null ? 0 : (BigInteger)raw;
        }

        [Safe]
        public static BigInteger GetSystemModuleCount()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_MODULE_COUNT);
            return raw == null ? 0 : (BigInteger)raw;
        }

        [Safe]
        public static string GetMiniAppIdByIndex(BigInteger index)
        {
            ExecutionEngine.Assert(index >= 0, "invalid index");
            ByteString raw = AppIndexMap().Get(index.ToByteArray());
            return raw == null ? "" : (string)raw;
        }

        [Safe]
        public static string GetSystemModuleIdByIndex(BigInteger index)
        {
            ExecutionEngine.Assert(index >= 0, "invalid index");
            ByteString raw = ModuleIndexMap().Get(index.ToByteArray());
            return raw == null ? "" : (string)raw;
        }

        [Safe]
        public static string[] GetAllMiniAppIds()
        {
            int count = (int)GetMiniAppCount();
            string[] appIds = new string[count];
            for (int index = 0; index < count; index++)
            {
                appIds[index] = GetMiniAppIdByIndex(index);
            }
            return appIds;
        }

        [Safe]
        public static string[] GetAllSystemModuleIds()
        {
            int count = (int)GetSystemModuleCount();
            string[] moduleIds = new string[count];
            for (int index = 0; index < count; index++)
            {
                moduleIds[index] = GetSystemModuleIdByIndex(index);
            }
            return moduleIds;
        }

        [Safe]
        public static MiniAppRecord GetMiniApp(string appId)
        {
            ValidateIdentifier(appId, MAX_APP_ID_LENGTH, "invalid app id");
            ByteString raw = AppMap().Get(appId);
            if (raw == null)
            {
                return EmptyMiniApp(appId);
            }

            return (MiniAppRecord)StdLib.Deserialize(raw);
        }

        [Safe]
        public static SystemModuleRecord GetSystemModule(string moduleId)
        {
            ValidateIdentifier(moduleId, MAX_MODULE_ID_LENGTH, "invalid module id");
            ByteString raw = ModuleMap().Get(moduleId);
            if (raw == null)
            {
                return EmptySystemModule(moduleId);
            }

            return (SystemModuleRecord)StdLib.Deserialize(raw);
        }

        [Safe]
        public static bool IsModuleGrantedToMiniApp(string appId, string moduleId)
        {
            ValidateIdentifier(appId, MAX_APP_ID_LENGTH, "invalid app id");
            ValidateIdentifier(moduleId, MAX_MODULE_ID_LENGTH, "invalid module id");
            return AppModuleGrantMap().Get(BuildGrantKey(appId, moduleId)) != null;
        }

        [Safe]
        public static BigInteger GetMiniAppRequestCount(string appId)
        {
            ValidateIdentifier(appId, MAX_APP_ID_LENGTH, "invalid app id");
            ByteString raw = AppRequestsMap().Get(appId);
            return raw == null ? 0 : (BigInteger)raw;
        }

        [Safe]
        public static BigInteger GetMiniAppFulfilledCount(string appId)
        {
            ValidateIdentifier(appId, MAX_APP_ID_LENGTH, "invalid app id");
            ByteString raw = AppFulfilledMap().Get(appId);
            return raw == null ? 0 : (BigInteger)raw;
        }

        [Safe]
        public static BigInteger GetTotalRequests()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_TOTAL_REQUESTS);
            return raw == null ? 0 : (BigInteger)raw;
        }

        [Safe]
        public static BigInteger GetTotalFulfilled()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_TOTAL_FULFILLED);
            return raw == null ? 0 : (BigInteger)raw;
        }

        [Safe]
        public static KernelRequest GetRequest(BigInteger requestId)
        {
            ByteString raw = RequestMap().Get(requestId.ToByteArray());
            if (raw == null)
            {
                return new KernelRequest
                {
                    Id = 0,
                    AppId = "",
                    ModuleId = "",
                    Operation = "",
                    Payload = (ByteString)"",
                    Requester = null,
                    Sponsor = null,
                    CallbackContract = null,
                    Status = KernelRequestStatus.Pending,
                    CreatedAt = 0,
                    FulfilledAt = 0,
                    Success = false,
                    Result = (ByteString)"",
                    Error = ""
                };
            }

            return (KernelRequest)StdLib.Deserialize(raw);
        }

        [Safe]
        public static InboxItem GetInboxItem(string appId, BigInteger requestId)
        {
            ValidateIdentifier(appId, MAX_APP_ID_LENGTH, "invalid app id");
            ByteString raw = AppInboxMap().Get(BuildInboxKey(appId, requestId));
            if (raw == null)
            {
                return new InboxItem
                {
                    AppId = appId,
                    RequestId = requestId,
                    ModuleId = "",
                    Operation = "",
                    Requester = null,
                    Success = false,
                    Result = (ByteString)"",
                    Error = "",
                    DeliveredAt = 0
                };
            }

            return (InboxItem)StdLib.Deserialize(raw);
        }

        [Safe]
        public static ByteString GetMiniAppState(string appId, ByteString stateKey)
        {
            ValidateIdentifier(appId, MAX_APP_ID_LENGTH, "invalid app id");
            ValidateStateKey(stateKey);
            ByteString raw = AppStateMap().Get(BuildStateKey(appId, stateKey));
            return raw == null ? (ByteString)"" : raw;
        }

        public static void SetAdmin(UInt160 newAdmin)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(newAdmin != null && newAdmin.IsValid, "invalid admin");

            UInt160 oldAdmin = Admin();
            Storage.Put(Storage.CurrentContext, PREFIX_ADMIN, newAdmin);
            OnAdminChanged(oldAdmin, newAdmin);
        }

        public static void SetUpdater(UInt160 updater)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(updater != null && updater.IsValid, "invalid updater");

            UInt160 oldUpdater = Updater();
            Storage.Put(Storage.CurrentContext, PREFIX_UPDATER, updater);
            OnUpdaterChanged(oldUpdater, updater);
        }

        public static void SetRuntimeEncryptionKey(string algorithm, string publicKey)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(algorithm != null && algorithm.Length > 0, "algorithm required");
            ExecutionEngine.Assert(publicKey != null && publicKey.Length > 0, "public key required");
            ExecutionEngine.Assert(algorithm.Length <= MAX_RUNTIME_KEY_ALGO_LENGTH, "algorithm too long");
            ExecutionEngine.Assert(publicKey.Length <= MAX_RUNTIME_KEY_LENGTH, "public key too long");

            BigInteger version = RuntimeEncryptionKeyVersion() + 1;
            Storage.Put(Storage.CurrentContext, PREFIX_RUNTIME_KEY_ALGO, algorithm);
            Storage.Put(Storage.CurrentContext, PREFIX_RUNTIME_KEY, publicKey);
            Storage.Put(Storage.CurrentContext, PREFIX_RUNTIME_KEY_VERSION, version);
            OnRuntimeEncryptionKeyUpdated(version, algorithm, publicKey);
        }

        public static void SetOracleEncryptionKey(string algorithm, string publicKey)
        {
            SetRuntimeEncryptionKey(algorithm, publicKey);
        }

        public static void SetRuntimeVerificationPublicKey(ECPoint publicKey)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(publicKey != null && publicKey.IsValid, "invalid verifier");

            ECPoint oldVerifier = RuntimeVerificationPublicKey();
            Storage.Put(Storage.CurrentContext, PREFIX_RUNTIME_VERIFIER, (byte[])publicKey);
            OnRuntimeVerifierUpdated(oldVerifier, publicKey);
        }

        public static void SetOracleVerificationPublicKey(ECPoint publicKey)
        {
            SetRuntimeVerificationPublicKey(publicKey);
        }

        public static void SetRequestFee(BigInteger amount)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(amount > 0, "invalid request fee");

            BigInteger oldFee = SystemRequestFee();
            Storage.Put(Storage.CurrentContext, PREFIX_REQUEST_FEE, amount);
            OnRequestFeeUpdated(oldFee, amount);
        }

        public static void WithdrawAccruedFees(UInt160 to, BigInteger amount)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(to != null && to.IsValid, "invalid recipient");
            ExecutionEngine.Assert(amount > 0, "invalid amount");

            BigInteger accrued = AccruedRequestFees();
            ExecutionEngine.Assert(accrued >= amount, "insufficient accrued fees");
            ExecutionEngine.Assert(
                GAS.Transfer(Runtime.ExecutingScriptHash, to, amount, null),
                "fee transfer failed"
            );

            Storage.Put(Storage.CurrentContext, PREFIX_ACCRUED_REQUEST_FEES, accrued - amount);
            OnAccruedFeesWithdrawn(to, amount);
        }

        /// <summary>
        /// Configure the request TTL (in milliseconds).  Only the admin can change this.
        /// </summary>
        public static void SetRequestTTL(BigInteger ttlMs)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(ttlMs > 0, "TTL must be positive");

            BigInteger oldTTL = RequestTTL();
            Storage.Put(Storage.CurrentContext, PREFIX_REQUEST_TTL, ttlMs);
            OnRequestTTLUpdated(oldTTL, ttlMs);
        }

        /// <summary>
        /// Expire a stale pending request that has exceeded the configurable TTL.
        /// When a request is expired:
        ///   1. Its status is set to Failed with an expiry error message
        ///   2. The fee credit that was consumed at submission time is refunded
        ///      to the original sponsor (the account that paid)
        ///   3. A RequestExpired event is emitted for off-chain tracking
        ///
        /// Security rationale: prevents fee credits from being locked forever if
        /// the TEE worker or relayer fails to fulfill a request.  The admin,
        /// updater, or an automation service can call this periodically.
        /// </summary>
        public static void ExpireStaleRequest(BigInteger requestId)
        {
            // Only admin or updater may expire requests to prevent griefing
            UInt160 admin = Admin();
            UInt160 updater = Updater();
            bool isAdmin = admin != null && admin.IsValid && Runtime.CheckWitness(admin);
            bool isUpdater = updater != null && updater.IsValid && Runtime.CheckWitness(updater);
            ExecutionEngine.Assert(isAdmin || isUpdater, "unauthorized");

            KernelRequest req = GetRequest(requestId);
            ExecutionEngine.Assert(req.Id > 0, "request not found");
            ExecutionEngine.Assert(req.Status == KernelRequestStatus.Pending, "request not pending");

            // Check that the request has exceeded the configured TTL
            BigInteger ttl = RequestTTL();
            BigInteger age = Runtime.Time - req.CreatedAt;
            ExecutionEngine.Assert(age > ttl, "request has not expired");

            // Mark the request as failed with an expiry error
            req.Status = KernelRequestStatus.Failed;
            req.FulfilledAt = Runtime.Time;
            req.Success = false;
            req.Error = "request expired: TTL exceeded";
            RequestMap().Put(requestId.ToByteArray(), StdLib.Serialize(req));

            IncrementTotalFulfilled();
            IncrementMiniAppFulfilled(req.AppId);

            // Refund the fee credit to the sponsor who originally paid.
            // This ensures fee credits are not permanently lost when requests
            // go unfulfilled due to worker or relayer downtime.
            BigInteger fee = SystemRequestFee();
            if (fee > 0 && req.Sponsor != null && req.Sponsor.IsValid)
            {
                BigInteger currentCredit = FeeCreditOf(req.Sponsor);
                RequestCreditMap().Put((byte[])req.Sponsor, currentCredit + fee);

                // Reduce accrued fees since we are returning the fee
                BigInteger accrued = AccruedRequestFees();
                if (accrued >= fee)
                {
                    Storage.Put(Storage.CurrentContext, PREFIX_ACCRUED_REQUEST_FEES, accrued - fee);
                }
            }

            OnRequestExpired(requestId, req.AppId, req.Requester, req.Sponsor, fee);
            OnMiniAppRequestCompleted(
                requestId,
                req.AppId,
                req.ModuleId,
                req.Operation,
                false,
                ComputeResultHash((ByteString)""),
                0,
                req.Error
            );
        }

        public static void RegisterSystemModule(string moduleId, string endpoint, string schemaHash)
        {
            ValidateAdmin();
            ValidateModuleDefinition(moduleId, endpoint, schemaHash);

            SystemModuleRecord existing = GetSystemModule(moduleId);
            ExecutionEngine.Assert(existing.CreatedAt == 0, "module already exists");
            PutSystemModule(moduleId, endpoint, schemaHash, true, Runtime.Time);
            OnSystemModuleRegistered(moduleId, endpoint, schemaHash);
        }

        public static void ConfigureSystemModule(string moduleId, string endpoint, string schemaHash, bool active)
        {
            ValidateAdmin();
            ValidateModuleDefinition(moduleId, endpoint, schemaHash);

            SystemModuleRecord existing = GetSystemModule(moduleId);
            ExecutionEngine.Assert(existing.CreatedAt > 0, "module not found");
            PutSystemModule(moduleId, endpoint, schemaHash, active, existing.CreatedAt);
            OnSystemModuleUpdated(moduleId, endpoint, schemaHash, active);
        }

        public static void RegisterMiniApp(string appId, UInt160 appAdmin, UInt160 feePayer, UInt160 callbackContract, string metadataUri, string metadataHash)
        {
            ValidateMiniAppDefinition(appId, appAdmin, feePayer, callbackContract, metadataUri, metadataHash);
            ExecutionEngine.Assert(Runtime.CheckWitness(appAdmin) || Runtime.CheckWitness(Admin()), "unauthorized");

            MiniAppRecord existing = GetMiniApp(appId);
            ExecutionEngine.Assert(existing.CreatedAt == 0, "miniapp already exists");

            PutMiniApp(appId, appAdmin, feePayer, callbackContract, metadataUri, metadataHash, true, Runtime.Time);
            OnMiniAppRegistered(appId, appAdmin, feePayer, callbackContract);
        }

        public static void ConfigureMiniApp(string appId, UInt160 feePayer, UInt160 callbackContract, string metadataUri, string metadataHash, bool active)
        {
            MiniAppRecord app = RequireMiniApp(appId);
            ValidateMiniAppAdmin(app);
            ValidateMiniAppDefinition(appId, app.Admin, feePayer, callbackContract, metadataUri, metadataHash);

            PutMiniApp(appId, app.Admin, feePayer, callbackContract, metadataUri, metadataHash, active, app.CreatedAt);
            OnMiniAppUpdated(appId, app.Admin, feePayer, callbackContract, active);
        }

        public static void GrantModuleToMiniApp(string appId, string moduleId)
        {
            MiniAppRecord app = RequireMiniApp(appId);
            SystemModuleRecord module = RequireActiveModule(moduleId);
            ValidateMiniAppAdmin(app);

            AppModuleGrantMap().Put(BuildGrantKey(appId, module.ModuleId), 1);
            OnMiniAppCapabilityGranted(appId, module.ModuleId);
        }

        public static void RevokeModuleFromMiniApp(string appId, string moduleId)
        {
            MiniAppRecord app = RequireMiniApp(appId);
            ValidateIdentifier(moduleId, MAX_MODULE_ID_LENGTH, "invalid module id");
            ValidateMiniAppAdmin(app);

            AppModuleGrantMap().Delete(BuildGrantKey(appId, moduleId));
            OnMiniAppCapabilityRevoked(appId, moduleId);
        }

        public static void PutMiniAppState(string appId, ByteString stateKey, ByteString value)
        {
            MiniAppRecord app = RequireMiniApp(appId);
            ValidateMiniAppAdminOrUpdater(app);
            ValidateStateKey(stateKey);
            ExecutionEngine.Assert(value != null && value.Length <= MAX_STATE_VALUE_LENGTH, "invalid state value");

            AppStateMap().Put(BuildStateKey(appId, stateKey), value);
            OnMiniAppStateChanged(appId, stateKey, value.Length);
        }

        public static void PutMiniAppStateBatch(string appId, ByteString[] stateKeys, ByteString[] values)
        {
            MiniAppRecord app = RequireMiniApp(appId);
            ValidateMiniAppAdminOrUpdater(app);
            ExecutionEngine.Assert(stateKeys != null && stateKeys.Length > 0, "state keys required");
            ExecutionEngine.Assert(values != null && values.Length == stateKeys.Length, "state length mismatch");

            for (int index = 0; index < stateKeys.Length; index++)
            {
                ValidateStateKey(stateKeys[index]);
                ExecutionEngine.Assert(values[index] != null && values[index].Length <= MAX_STATE_VALUE_LENGTH, "invalid state value");
                AppStateMap().Put(BuildStateKey(appId, stateKeys[index]), values[index]);
                OnMiniAppStateChanged(appId, stateKeys[index], values[index].Length);
            }
        }

        public static void DeleteMiniAppState(string appId, ByteString stateKey)
        {
            MiniAppRecord app = RequireMiniApp(appId);
            ValidateMiniAppAdminOrUpdater(app);
            ValidateStateKey(stateKey);

            AppStateMap().Delete(BuildStateKey(appId, stateKey));
            OnMiniAppStateChanged(appId, stateKey, 0);
        }

        public static BigInteger SubmitMiniAppRequest(string appId, string moduleId, string operation, ByteString payload)
        {
            UInt160 requester = Runtime.Transaction.Sender;
            ExecutionEngine.Assert(requester != null && requester.IsValid, "requester required");
            ExecutionEngine.Assert(Runtime.CheckWitness(requester), "unauthorized requester");

            return SubmitMiniAppRequestInternal(requester, appId, moduleId, operation, payload);
        }

        public static BigInteger SubmitMiniAppRequestFromIntegration(UInt160 requester, string appId, string moduleId, string operation, ByteString payload)
        {
            ExecutionEngine.Assert(requester != null && requester.IsValid, "requester required");

            MiniAppRecord app = RequireActiveMiniApp(appId);
            ExecutionEngine.Assert(app.CallbackContract != null && app.CallbackContract.IsValid, "integration contract not set");
            ExecutionEngine.Assert(Runtime.CallingScriptHash == app.CallbackContract, "only integration contract");

            return SubmitMiniAppRequestInternal(requester, appId, moduleId, operation, payload);
        }

        // Legacy alias kept for compatibility with callback-contract mediated flows.
        public static BigInteger RequestFromCallback(UInt160 requester, string requestType, ByteString payload, UInt160 callbackContract, string callbackMethod)
        {
            ExecutionEngine.Assert(callbackMethod == CALLBACK_METHOD || callbackMethod == "onOracleResult", "unsupported callback method");

            MiniAppRecord app = FindMiniAppByCallback(callbackContract);
            ExecutionEngine.Assert(app.CreatedAt > 0, "miniapp not found for callback");
            string moduleId = ResolveLegacyModuleId(requestType);
            return SubmitMiniAppRequestFromIntegration(requester, app.AppId, moduleId, requestType, payload);
        }

        public static BigInteger QueueSystemRequest(UInt160 requester, string appId, string moduleId, string operation, ByteString payload)
        {
            ValidateUpdater();
            ExecutionEngine.Assert(requester != null && requester.IsValid, "requester required");
            return SubmitMiniAppRequestInternal(requester, appId, moduleId, operation, payload);
        }

        // Legacy alias kept for automation pipelines that still target the old method name.
        public static BigInteger QueueAutomationRequest(UInt160 requester, string requestType, ByteString payload, UInt160 callbackContract, string callbackMethod)
        {
            ExecutionEngine.Assert(callbackMethod == CALLBACK_METHOD || callbackMethod == "onOracleResult", "unsupported callback method");

            MiniAppRecord app = FindMiniAppByCallback(callbackContract);
            ExecutionEngine.Assert(app.CreatedAt > 0, "miniapp not found for callback");
            string moduleId = ResolveLegacyModuleId(requestType);
            return QueueSystemRequest(requester, app.AppId, moduleId, requestType, payload);
        }

        // Legacy alias kept so existing direct request scripts keep working during migration.
        public static BigInteger Request(string requestType, ByteString payload, UInt160 callbackContract, string callbackMethod)
        {
            ExecutionEngine.Assert(callbackMethod == CALLBACK_METHOD || callbackMethod == "onOracleResult", "unsupported callback method");

            MiniAppRecord app = FindMiniAppByCallback(callbackContract);
            ExecutionEngine.Assert(app.CreatedAt > 0, "miniapp not found for callback");
            string moduleId = ResolveLegacyModuleId(requestType);
            return SubmitMiniAppRequest(app.AppId, moduleId, requestType, payload);
        }

        public static void OnNEP17Payment(UInt160 from, BigInteger amount, object data)
        {
            ExecutionEngine.Assert(Runtime.CallingScriptHash == GAS.Hash, "only GAS accepted");
            ExecutionEngine.Assert(from != null && from.IsValid, "invalid sender");
            ExecutionEngine.Assert(amount > 0, "invalid amount");

            UInt160 beneficiary = ResolveCreditBeneficiary(from, data);
            BigInteger nextCredit = FeeCreditOf(beneficiary) + amount;
            RequestCreditMap().Put((byte[])beneficiary, nextCredit);
            OnRequestFeeDeposited(beneficiary, amount, nextCredit);
        }

        public static void FulfillRequest(BigInteger requestId, bool success, ByteString result, string error, ByteString verificationSignature)
        {
            ValidateUpdater();

            KernelRequest req = GetRequest(requestId);
            ExecutionEngine.Assert(req.Id > 0, "request not found");
            ExecutionEngine.Assert(req.Status == KernelRequestStatus.Pending, "request already fulfilled");
            ExecutionEngine.Assert(result == null || result.Length <= MAX_RESULT_LENGTH, "result too large");
            ExecutionEngine.Assert(error == null || error.Length <= MAX_ERROR_LENGTH, "error too long");

            ECPoint verifier = RuntimeVerificationPublicKey();
            ExecutionEngine.Assert(verifier != null && verifier.IsValid, "runtime verifier not set");
            ExecutionEngine.Assert(verificationSignature != null && verificationSignature.Length == 64, "invalid verification signature");

            ByteString digest = ComputeFulfillmentDigest(
                requestId,
                req.AppId,
                req.ModuleId,
                req.Operation,
                success,
                result ?? (ByteString)"",
                error ?? ""
            );

            ExecutionEngine.Assert(
                CryptoLib.VerifyWithECDsa(digest, verifier, verificationSignature, NamedCurveHash.secp256r1SHA256),
                "invalid verification signature"
            );

            req.Status = success ? KernelRequestStatus.Succeeded : KernelRequestStatus.Failed;
            req.FulfilledAt = Runtime.Time;
            req.Success = success;
            req.Result = result ?? (ByteString)"";
            req.Error = error ?? "";
            RequestMap().Put(requestId.ToByteArray(), StdLib.Serialize(req));

            IncrementTotalFulfilled();
            IncrementMiniAppFulfilled(req.AppId);

            InboxItem inbox = new InboxItem
            {
                AppId = req.AppId,
                RequestId = requestId,
                ModuleId = req.ModuleId,
                Operation = req.Operation,
                Requester = req.Requester,
                Success = req.Success,
                Result = req.Result,
                Error = req.Error,
                DeliveredAt = Runtime.Time
            };

            AppInboxMap().Put(BuildInboxKey(req.AppId, requestId), StdLib.Serialize(inbox));
            OnMiniAppInboxStored(req.AppId, requestId, req.Requester, req.Success);

            if (req.CallbackContract != null && req.CallbackContract.IsValid)
            {
                try
                {
                    Contract.Call(
                        req.CallbackContract,
                        CALLBACK_METHOD,
                        CallFlags.All,
                        requestId,
                        req.AppId,
                        req.ModuleId,
                        req.Operation,
                        req.Requester,
                        req.Success,
                        req.Result,
                        req.Error
                    );
                }
                catch
                {
                    // Inbox persistence is canonical. External callbacks are best-effort extensions only.
                }
            }

            OnMiniAppRequestCompleted(
                requestId,
                req.AppId,
                req.ModuleId,
                req.Operation,
                req.Success,
                ComputeResultHash(req.Result),
                ComputeResultSize(req.Result),
                req.Error
            );
        }

        public static void Update(ByteString nefFile, string manifest)
        {
            ValidateAdmin();
            ContractManagement.Update(nefFile, manifest, null);
        }

        private static StorageMap AppMap() => new StorageMap(Storage.CurrentContext, PREFIX_APP);
        private static StorageMap AppIndexMap() => new StorageMap(Storage.CurrentContext, PREFIX_APP_INDEX);
        private static StorageMap ModuleMap() => new StorageMap(Storage.CurrentContext, PREFIX_MODULE);
        private static StorageMap ModuleIndexMap() => new StorageMap(Storage.CurrentContext, PREFIX_MODULE_INDEX);
        private static StorageMap AppModuleGrantMap() => new StorageMap(Storage.CurrentContext, PREFIX_APP_MODULE_GRANT);
        private static StorageMap RequestMap() => new StorageMap(Storage.CurrentContext, PREFIX_REQUEST);
        private static StorageMap RequestCreditMap() => new StorageMap(Storage.CurrentContext, PREFIX_REQUEST_CREDIT);
        private static StorageMap AppRequestsMap() => new StorageMap(Storage.CurrentContext, PREFIX_APP_REQUESTS);
        private static StorageMap AppFulfilledMap() => new StorageMap(Storage.CurrentContext, PREFIX_APP_FULFILLED);
        private static StorageMap AppInboxMap() => new StorageMap(Storage.CurrentContext, PREFIX_APP_INBOX);
        private static StorageMap AppStateMap() => new StorageMap(Storage.CurrentContext, PREFIX_APP_STATE);

        private static void ValidateAdmin()
        {
            UInt160 admin = Admin();
            ExecutionEngine.Assert(admin != null && admin.IsValid, "admin not set");
            ExecutionEngine.Assert(Runtime.CheckWitness(admin), "unauthorized");
        }

        private static void ValidateUpdater()
        {
            UInt160 updater = Updater();
            ExecutionEngine.Assert(updater != null && updater.IsValid, "updater not set");
            ExecutionEngine.Assert(Runtime.CheckWitness(updater), "unauthorized");
        }

        private static void ValidateMiniAppAdmin(MiniAppRecord app)
        {
            UInt160 admin = Admin();
            bool isSystemAdmin = admin != null && admin.IsValid && Runtime.CheckWitness(admin);
            bool isMiniAppAdmin = app.Admin != null && app.Admin.IsValid && Runtime.CheckWitness(app.Admin);
            ExecutionEngine.Assert(isSystemAdmin || isMiniAppAdmin, "unauthorized");
        }

        private static void ValidateMiniAppAdminOrUpdater(MiniAppRecord app)
        {
            UInt160 admin = Admin();
            UInt160 updater = Updater();
            bool isSystemAdmin = admin != null && admin.IsValid && Runtime.CheckWitness(admin);
            bool isMiniAppAdmin = app.Admin != null && app.Admin.IsValid && Runtime.CheckWitness(app.Admin);
            bool isUpdater = updater != null && updater.IsValid && Runtime.CheckWitness(updater);
            ExecutionEngine.Assert(isSystemAdmin || isMiniAppAdmin || isUpdater, "unauthorized");
        }

        private static void ValidateIdentifier(string value, int maxLength, string error)
        {
            ExecutionEngine.Assert(value != null && value.Length > 0 && value.Length <= maxLength, error);
        }

        private static void ValidateMetadata(string metadataUri, string metadataHash)
        {
            ExecutionEngine.Assert(metadataUri == null || metadataUri.Length <= MAX_METADATA_URI_LENGTH, "metadata uri too long");
            ExecutionEngine.Assert(metadataHash == null || metadataHash.Length <= MAX_METADATA_HASH_LENGTH, "metadata hash too long");
        }

        private static void ValidateStateKey(ByteString stateKey)
        {
            ExecutionEngine.Assert(stateKey != null && stateKey.Length > 0 && stateKey.Length <= MAX_STATE_KEY_LENGTH, "invalid state key");
        }

        private static void ValidateModuleDefinition(string moduleId, string endpoint, string schemaHash)
        {
            ValidateIdentifier(moduleId, MAX_MODULE_ID_LENGTH, "invalid module id");
            ExecutionEngine.Assert(endpoint != null && endpoint.Length > 0 && endpoint.Length <= MAX_METADATA_URI_LENGTH, "invalid module endpoint");
            ExecutionEngine.Assert(schemaHash != null && schemaHash.Length > 0 && schemaHash.Length <= MAX_METADATA_HASH_LENGTH, "invalid schema hash");
        }

        private static void ValidateMiniAppDefinition(string appId, UInt160 appAdmin, UInt160 feePayer, UInt160 callbackContract, string metadataUri, string metadataHash)
        {
            ValidateIdentifier(appId, MAX_APP_ID_LENGTH, "invalid app id");
            ExecutionEngine.Assert(appAdmin != null && appAdmin.IsValid, "invalid miniapp admin");
            ExecutionEngine.Assert(feePayer != null && feePayer.IsValid, "invalid fee payer");
            if (callbackContract != null)
            {
                ExecutionEngine.Assert(callbackContract.IsValid, "invalid callback contract");
            }

            ValidateMetadata(metadataUri, metadataHash);
        }

        private static void ValidateRequestInputs(string appId, string moduleId, string operation, ByteString payload)
        {
            MiniAppRecord app = RequireActiveMiniApp(appId);
            SystemModuleRecord module = RequireActiveModule(moduleId);
            ExecutionEngine.Assert(operation != null && operation.Length > 0 && operation.Length <= MAX_OPERATION_LENGTH, "invalid operation");
            ExecutionEngine.Assert(payload == null || payload.Length <= MAX_PAYLOAD_LENGTH, "payload too large");
            ExecutionEngine.Assert(IsModuleGrantedToMiniApp(appId, moduleId), "module not granted");
            ExecutionEngine.Assert(app.Active, "miniapp inactive");
            ExecutionEngine.Assert(module.Active, "module inactive");
        }

        private static MiniAppRecord EmptyMiniApp(string appId)
        {
            return new MiniAppRecord
            {
                AppId = appId ?? "",
                Admin = null,
                FeePayer = null,
                CallbackContract = null,
                MetadataUri = "",
                MetadataHash = "",
                Active = false,
                CreatedAt = 0,
                UpdatedAt = 0
            };
        }

        private static SystemModuleRecord EmptySystemModule(string moduleId)
        {
            return new SystemModuleRecord
            {
                ModuleId = moduleId ?? "",
                Endpoint = "",
                SchemaHash = "",
                Active = false,
                CreatedAt = 0,
                UpdatedAt = 0
            };
        }

        private static MiniAppRecord RequireMiniApp(string appId)
        {
            MiniAppRecord app = GetMiniApp(appId);
            ExecutionEngine.Assert(app.CreatedAt > 0, "miniapp not found");
            return app;
        }

        private static MiniAppRecord RequireActiveMiniApp(string appId)
        {
            MiniAppRecord app = RequireMiniApp(appId);
            ExecutionEngine.Assert(app.Active, "miniapp inactive");
            return app;
        }

        private static SystemModuleRecord RequireActiveModule(string moduleId)
        {
            SystemModuleRecord module = GetSystemModule(moduleId);
            ExecutionEngine.Assert(module.CreatedAt > 0, "module not found");
            ExecutionEngine.Assert(module.Active, "module inactive");
            return module;
        }

        private static void IndexMiniAppIfNeeded(string appId)
        {
            if (GetMiniApp(appId).CreatedAt > 0) return;

            BigInteger count = GetMiniAppCount();
            AppIndexMap().Put(count.ToByteArray(), appId);
            Storage.Put(Storage.CurrentContext, PREFIX_APP_COUNT, count + 1);
        }

        private static void IndexSystemModuleIfNeeded(string moduleId)
        {
            if (GetSystemModule(moduleId).CreatedAt > 0) return;

            BigInteger count = GetSystemModuleCount();
            ModuleIndexMap().Put(count.ToByteArray(), moduleId);
            Storage.Put(Storage.CurrentContext, PREFIX_MODULE_COUNT, count + 1);
        }

        private static void PutMiniApp(string appId, UInt160 appAdmin, UInt160 feePayer, UInt160 callbackContract, string metadataUri, string metadataHash, bool active, BigInteger createdAt)
        {
            if (GetMiniApp(appId).CreatedAt == 0)
            {
                IndexMiniAppIfNeeded(appId);
            }

            MiniAppRecord app = new MiniAppRecord
            {
                AppId = appId,
                Admin = appAdmin,
                FeePayer = feePayer,
                CallbackContract = callbackContract,
                MetadataUri = metadataUri ?? "",
                MetadataHash = metadataHash ?? "",
                Active = active,
                CreatedAt = createdAt,
                UpdatedAt = Runtime.Time
            };

            AppMap().Put(appId, StdLib.Serialize(app));
        }

        private static void PutSystemModule(string moduleId, string endpoint, string schemaHash, bool active, BigInteger createdAt)
        {
            if (GetSystemModule(moduleId).CreatedAt == 0)
            {
                IndexSystemModuleIfNeeded(moduleId);
            }

            SystemModuleRecord module = new SystemModuleRecord
            {
                ModuleId = moduleId,
                Endpoint = endpoint,
                SchemaHash = schemaHash,
                Active = active,
                CreatedAt = createdAt,
                UpdatedAt = Runtime.Time
            };

            ModuleMap().Put(moduleId, StdLib.Serialize(module));
        }

        private static void SeedBuiltInModule(string moduleId, string endpoint, string schemaHash)
        {
            if (GetSystemModule(moduleId).CreatedAt > 0) return;
            PutSystemModule(moduleId, endpoint, schemaHash, true, Runtime.Time);
            OnSystemModuleRegistered(moduleId, endpoint, schemaHash);
        }

        private static BigInteger NextRequestId()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_COUNTER);
            BigInteger current = raw == null ? 0 : (BigInteger)raw;
            BigInteger next = current + 1;
            Storage.Put(Storage.CurrentContext, PREFIX_COUNTER, next);
            return next;
        }

        private static void IncrementTotalRequests()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_TOTAL_REQUESTS);
            BigInteger current = raw == null ? 0 : (BigInteger)raw;
            Storage.Put(Storage.CurrentContext, PREFIX_TOTAL_REQUESTS, current + 1);
        }

        private static void IncrementTotalFulfilled()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_TOTAL_FULFILLED);
            BigInteger current = raw == null ? 0 : (BigInteger)raw;
            Storage.Put(Storage.CurrentContext, PREFIX_TOTAL_FULFILLED, current + 1);
        }

        private static void IncrementMiniAppRequests(string appId)
        {
            ByteString raw = AppRequestsMap().Get(appId);
            BigInteger current = raw == null ? 0 : (BigInteger)raw;
            AppRequestsMap().Put(appId, current + 1);
        }

        private static void IncrementMiniAppFulfilled(string appId)
        {
            ByteString raw = AppFulfilledMap().Get(appId);
            BigInteger current = raw == null ? 0 : (BigInteger)raw;
            AppFulfilledMap().Put(appId, current + 1);
        }

        private static BigInteger SubmitMiniAppRequestInternal(UInt160 requester, string appId, string moduleId, string operation, ByteString payload)
        {
            ValidateRequestInputs(appId, moduleId, operation, payload);
            MiniAppRecord app = RequireActiveMiniApp(appId);

            UInt160 sponsor = ResolveFeePayer(requester, app.FeePayer);
            ConsumeRequestFeeFromPayer(sponsor);

            BigInteger requestId = NextRequestId();
            KernelRequest req = new KernelRequest
            {
                Id = requestId,
                AppId = appId,
                ModuleId = moduleId,
                Operation = operation,
                Payload = payload ?? (ByteString)"",
                Requester = requester,
                Sponsor = sponsor,
                CallbackContract = app.CallbackContract,
                Status = KernelRequestStatus.Pending,
                CreatedAt = Runtime.Time,
                FulfilledAt = 0,
                Success = false,
                Result = (ByteString)"",
                Error = ""
            };

            RequestMap().Put(requestId.ToByteArray(), StdLib.Serialize(req));
            IncrementTotalRequests();
            IncrementMiniAppRequests(appId);
            OnMiniAppRequestQueued(requestId, appId, moduleId, operation, requester, sponsor, req.Payload);
            return requestId;
        }

        private static UInt160 ResolveFeePayer(UInt160 requester, UInt160 sponsor)
        {
            BigInteger fee = SystemRequestFee();
            if (fee <= 0) return requester;

            if (sponsor != null
                && sponsor.IsValid
                && FeeCreditOf(sponsor) >= fee)
            {
                return sponsor;
            }

            return requester;
        }

        private static UInt160 ResolveCreditBeneficiary(UInt160 from, object data)
        {
            if (data is ByteString byteString && byteString != null && byteString.Length == 20)
            {
                return (UInt160)(byte[])byteString;
            }

            return from;
        }

        private static void ConsumeRequestFeeFromPayer(UInt160 feePayer)
        {
            ExecutionEngine.Assert(feePayer != null && feePayer.IsValid, "fee payer required");

            BigInteger fee = SystemRequestFee();
            if (fee <= 0) return;

            BigInteger credit = FeeCreditOf(feePayer);
            ExecutionEngine.Assert(credit >= fee, "request fee not paid");
            RequestCreditMap().Put((byte[])feePayer, credit - fee);
            Storage.Put(Storage.CurrentContext, PREFIX_ACCRUED_REQUEST_FEES, AccruedRequestFees() + fee);
        }

        private static MiniAppRecord FindMiniAppByCallback(UInt160 callbackContract)
        {
            if (callbackContract == null || !callbackContract.IsValid)
            {
                return EmptyMiniApp("");
            }

            int count = (int)GetMiniAppCount();
            for (int index = 0; index < count; index++)
            {
                string appId = GetMiniAppIdByIndex(index);
                MiniAppRecord app = GetMiniApp(appId);
                if (app.CallbackContract != null && app.CallbackContract == callbackContract)
                {
                    return app;
                }
            }

            return EmptyMiniApp("");
        }

        private static string ResolveLegacyModuleId(string requestType)
        {
            ValidateIdentifier(requestType, MAX_OPERATION_LENGTH, "invalid request type");

            if (requestType == "oracle" || requestType == "privacy_oracle") return "oracle.fetch";
            if (requestType == "compute") return "compute.run";
            if (requestType == "datafeed" || requestType == "pricefeed" || requestType == "feed") return "feed.read";
            if (requestType == "neodid_bind"
                || requestType == "neodid_action_ticket"
                || requestType == "neodid_recovery_ticket")
            {
                return "identity.verify";
            }

            if (requestType == "automation_register"
                || requestType == "automation_cancel"
                || requestType == "automation_execute")
            {
                return "automation.run";
            }

            return requestType;
        }

        private static ByteString ComputeResultHash(ByteString result)
        {
            return CryptoLib.Sha256(result ?? (ByteString)"");
        }

        private static BigInteger ComputeResultSize(ByteString result)
        {
            return result == null ? 0 : result.Length;
        }

        private static byte[] ToUInt256Bytes(BigInteger value)
        {
            ExecutionEngine.Assert(value >= 0, "invalid uint256");
            byte[] raw = value.ToByteArray();
            int length = raw.Length;
            if (length > 32)
            {
                ExecutionEngine.Assert(length == 33 && raw[32] == 0, "uint256 overflow");
                length = 32;
            }

            byte[] output = new byte[32];
            for (int index = 0; index < length; index++)
            {
                output[31 - index] = raw[index];
            }

            return output;
        }

        private static ByteString ComputeFulfillmentDigest(BigInteger requestId, string appId, string moduleId, string operation, bool success, ByteString result, string error)
        {
            byte[] payload = Helper.Concat(FULFILLMENT_SIGNATURE_DOMAIN, ToUInt256Bytes(requestId));
            payload = Helper.Concat(payload, CryptoLib.Sha256((ByteString)(appId ?? "")));
            payload = Helper.Concat(payload, CryptoLib.Sha256((ByteString)(moduleId ?? "")));
            payload = Helper.Concat(payload, CryptoLib.Sha256((ByteString)(operation ?? "")));
            payload = Helper.Concat(payload, new byte[] { success ? (byte)0x01 : (byte)0x00 });
            payload = Helper.Concat(payload, ComputeResultHash(result));
            payload = Helper.Concat(payload, CryptoLib.Sha256((ByteString)(error ?? "")));
            return CryptoLib.Sha256((ByteString)payload);
        }

        private static byte[] BuildGrantKey(string appId, string moduleId)
        {
            return (byte[])Helper.Concat(
                CryptoLib.Sha256((ByteString)(appId ?? "")),
                CryptoLib.Sha256((ByteString)(moduleId ?? ""))
            );
        }

        private static byte[] BuildInboxKey(string appId, BigInteger requestId)
        {
            return (byte[])Helper.Concat(
                CryptoLib.Sha256((ByteString)(appId ?? "")),
                (ByteString)requestId.ToByteArray()
            );
        }

        private static byte[] BuildStateKey(string appId, ByteString stateKey)
        {
            return (byte[])Helper.Concat(
                CryptoLib.Sha256((ByteString)(appId ?? "")),
                stateKey ?? (ByteString)""
            );
        }
    }
}
