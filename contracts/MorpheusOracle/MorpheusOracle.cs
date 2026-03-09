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
    public enum OracleRequestStatus : byte
    {
        Pending = 0,
        Fulfilled = 1,
        Failed = 2
    }

    public delegate void OracleRequestedHandler(BigInteger requestId, string requestType, UInt160 requester, UInt160 callbackContract, string callbackMethod, ByteString payload);
    public delegate void OracleFulfilledHandler(BigInteger requestId, string requestType, bool success, ByteString resultHash, BigInteger resultSize, string error);
    public delegate void CallbackAddedHandler(UInt160 contractHash);
    public delegate void CallbackRemovedHandler(UInt160 contractHash);
    public delegate void AdminChangedHandler(UInt160 oldAdmin, UInt160 newAdmin);
    public delegate void UpdaterChangedHandler(UInt160 oldUpdater, UInt160 newUpdater);
    public delegate void OracleEncryptionKeyUpdatedHandler(BigInteger version, string algorithm, string publicKey);

    [DisplayName("MorpheusOracle")]
    [ManifestExtra("Author", "Morpheus Oracle")]
    [ManifestExtra("Version", "1.0.0")]
    [ManifestExtra("Description", "Oracle-only request gateway and callback contract")]
    [ContractPermission("*", "onOracleResult")]
    public class MorpheusOracle : SmartContract
    {
        private static readonly byte[] PREFIX_ADMIN = new byte[] { 0x01 };
        private static readonly byte[] PREFIX_UPDATER = new byte[] { 0x02 };
        private static readonly byte[] PREFIX_REQUEST = new byte[] { 0x03 };
        private static readonly byte[] PREFIX_COUNTER = new byte[] { 0x04 };
        private static readonly byte[] PREFIX_ALLOWED_CALLBACK = new byte[] { 0x05 };
        private static readonly byte[] PREFIX_ORACLE_KEY = new byte[] { 0x06 };
        private static readonly byte[] PREFIX_ORACLE_KEY_ALGO = new byte[] { 0x07 };
        private static readonly byte[] PREFIX_ORACLE_KEY_VERSION = new byte[] { 0x08 };
        private static readonly byte[] PREFIX_TOTAL_REQUESTS = new byte[] { 0x10 };
        private static readonly byte[] PREFIX_TOTAL_FULFILLED = new byte[] { 0x11 };
        private static readonly byte[] PREFIX_TYPE_REQUESTS = new byte[] { 0x12 };
        private static readonly byte[] PREFIX_TYPE_FULFILLED = new byte[] { 0x13 };

        private const int MAX_REQUEST_TYPE_LENGTH = 64;
        private const int MAX_CALLBACK_METHOD_LENGTH = 64;
        private const int MAX_PAYLOAD_LENGTH = 4096;
        private const int MAX_RESULT_LENGTH = 4096;
        private const int MAX_ERROR_LENGTH = 256;
        private const int MAX_ORACLE_KEY_ALGO_LENGTH = 64;
        private const int MAX_ORACLE_KEY_LENGTH = 2048;
        private const string CALLBACK_METHOD = "onOracleResult";

        public struct OracleRequest
        {
            public BigInteger Id;
            public string RequestType;
            public ByteString Payload;
            public UInt160 CallbackContract;
            public string CallbackMethod;
            public UInt160 Requester;
            public OracleRequestStatus Status;
            public BigInteger CreatedAt;
            public BigInteger FulfilledAt;
            public bool Success;
            public ByteString Result;
            public string Error;
        }

        [DisplayName("OracleRequested")]
        public static event OracleRequestedHandler OnOracleRequested;

        [DisplayName("OracleFulfilled")]
        public static event OracleFulfilledHandler OnOracleFulfilled;

        [DisplayName("CallbackAdded")]
        public static event CallbackAddedHandler OnCallbackAdded;

        [DisplayName("CallbackRemoved")]
        public static event CallbackRemovedHandler OnCallbackRemoved;

        [DisplayName("AdminChanged")]
        public static event AdminChangedHandler OnAdminChanged;

        [DisplayName("UpdaterChanged")]
        public static event UpdaterChangedHandler OnUpdaterChanged;

        [DisplayName("OracleEncryptionKeyUpdated")]
        public static event OracleEncryptionKeyUpdatedHandler OnOracleEncryptionKeyUpdated;

        public static void _deploy(object data, bool update)
        {
            if (update) return;
            Transaction tx = Runtime.Transaction;
            Storage.Put(Storage.CurrentContext, PREFIX_ADMIN, tx.Sender);
            Storage.Put(Storage.CurrentContext, PREFIX_COUNTER, 0);
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
        public static string OracleEncryptionAlgorithm()
        {
            return (string)Storage.Get(Storage.CurrentContext, PREFIX_ORACLE_KEY_ALGO);
        }

        [Safe]
        public static string OracleEncryptionPublicKey()
        {
            return (string)Storage.Get(Storage.CurrentContext, PREFIX_ORACLE_KEY);
        }

        [Safe]
        public static BigInteger OracleEncryptionKeyVersion()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_ORACLE_KEY_VERSION);
            return raw == null ? 0 : (BigInteger)raw;
        }

        private static void ValidateAdmin()
        {
            UInt160 admin = Admin();
            ExecutionEngine.Assert(admin != null, "admin not set");
            ExecutionEngine.Assert(Runtime.CheckWitness(admin), "unauthorized");
        }

        private static void ValidateUpdater()
        {
            UInt160 updater = Updater();
            ExecutionEngine.Assert(updater != null, "updater not set");
            ExecutionEngine.Assert(Runtime.CheckWitness(updater), "unauthorized");
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

        public static void SetOracleEncryptionKey(string algorithm, string publicKey)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(algorithm != null && algorithm.Length > 0, "algorithm required");
            ExecutionEngine.Assert(publicKey != null && publicKey.Length > 0, "public key required");
            ExecutionEngine.Assert(algorithm.Length <= MAX_ORACLE_KEY_ALGO_LENGTH, "algorithm too long");
            ExecutionEngine.Assert(publicKey.Length <= MAX_ORACLE_KEY_LENGTH, "public key too long");

            BigInteger version = OracleEncryptionKeyVersion() + 1;
            Storage.Put(Storage.CurrentContext, PREFIX_ORACLE_KEY_ALGO, algorithm);
            Storage.Put(Storage.CurrentContext, PREFIX_ORACLE_KEY, publicKey);
            Storage.Put(Storage.CurrentContext, PREFIX_ORACLE_KEY_VERSION, version);
            OnOracleEncryptionKeyUpdated(version, algorithm, publicKey);
        }

        private static StorageMap AllowedCallbackMap() => new StorageMap(Storage.CurrentContext, PREFIX_ALLOWED_CALLBACK);
        private static StorageMap RequestMap() => new StorageMap(Storage.CurrentContext, PREFIX_REQUEST);
        private static StorageMap TypeRequestsMap() => new StorageMap(Storage.CurrentContext, PREFIX_TYPE_REQUESTS);
        private static StorageMap TypeFulfilledMap() => new StorageMap(Storage.CurrentContext, PREFIX_TYPE_FULFILLED);

        public static void AddAllowedCallback(UInt160 contractHash)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(contractHash != null && contractHash.IsValid, "invalid contract");
            AllowedCallbackMap().Put((byte[])contractHash, 1);
            OnCallbackAdded(contractHash);
        }

        public static void RemoveAllowedCallback(UInt160 contractHash)
        {
            ValidateAdmin();
            AllowedCallbackMap().Delete((byte[])contractHash);
            OnCallbackRemoved(contractHash);
        }

        [Safe]
        public static bool IsAllowedCallback(UInt160 contractHash)
        {
            return AllowedCallbackMap().Get((byte[])contractHash) != null;
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

        private static void IncrementTypeRequests(string requestType)
        {
            ByteString raw = TypeRequestsMap().Get(requestType);
            BigInteger current = raw == null ? 0 : (BigInteger)raw;
            TypeRequestsMap().Put(requestType, current + 1);
        }

        private static void IncrementTypeFulfilled(string requestType)
        {
            ByteString raw = TypeFulfilledMap().Get(requestType);
            BigInteger current = raw == null ? 0 : (BigInteger)raw;
            TypeFulfilledMap().Put(requestType, current + 1);
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
        public static BigInteger GetTypeRequests(string requestType)
        {
            ByteString raw = TypeRequestsMap().Get(requestType);
            return raw == null ? 0 : (BigInteger)raw;
        }

        [Safe]
        public static BigInteger GetTypeFulfilled(string requestType)
        {
            ByteString raw = TypeFulfilledMap().Get(requestType);
            return raw == null ? 0 : (BigInteger)raw;
        }

        [Safe]
        public static OracleRequest GetRequest(BigInteger requestId)
        {
            ByteString raw = RequestMap().Get(requestId.ToByteArray());
            if (raw == null)
            {
                return new OracleRequest
                {
                    Id = 0,
                    RequestType = "",
                    Payload = (ByteString)"",
                    CallbackContract = null,
                    CallbackMethod = "",
                    Requester = null,
                    Status = OracleRequestStatus.Pending,
                    CreatedAt = 0,
                    FulfilledAt = 0,
                    Success = false,
                    Result = (ByteString)"",
                    Error = ""
                };
            }
            return (OracleRequest)StdLib.Deserialize(raw);
        }

        public static BigInteger Request(string requestType, ByteString payload, UInt160 callbackContract, string callbackMethod)
        {
            ExecutionEngine.Assert(requestType != null && requestType.Length > 0, "request type required");
            ExecutionEngine.Assert(callbackContract != null && callbackContract.IsValid, "callback contract required");
            ExecutionEngine.Assert(callbackMethod != null && callbackMethod.Length > 0, "callback method required");
            ExecutionEngine.Assert(requestType.Length <= MAX_REQUEST_TYPE_LENGTH, "request type too long");
            ExecutionEngine.Assert(callbackMethod.Length <= MAX_CALLBACK_METHOD_LENGTH, "callback method too long");
            ExecutionEngine.Assert(callbackMethod == CALLBACK_METHOD, "unsupported callback method");
            ExecutionEngine.Assert(payload == null || payload.Length <= MAX_PAYLOAD_LENGTH, "payload too large");
            ExecutionEngine.Assert(IsAllowedCallback(callbackContract), "callback contract not allowed");

            UInt160 requester = Runtime.Transaction.Sender;
            ExecutionEngine.Assert(requester != null && requester.IsValid, "requester required");
            ExecutionEngine.Assert(Runtime.CheckWitness(requester), "unauthorized requester");

            BigInteger requestId = NextRequestId();
            OracleRequest req = new OracleRequest
            {
                Id = requestId,
                RequestType = requestType,
                Payload = payload ?? (ByteString)"",
                CallbackContract = callbackContract,
                CallbackMethod = CALLBACK_METHOD,
                Requester = requester,
                Status = OracleRequestStatus.Pending,
                CreatedAt = Runtime.Time,
                FulfilledAt = 0,
                Success = false,
                Result = (ByteString)"",
                Error = ""
            };

            RequestMap().Put(requestId.ToByteArray(), StdLib.Serialize(req));
            IncrementTotalRequests();
            IncrementTypeRequests(requestType);
            OnOracleRequested(requestId, requestType, requester, callbackContract, callbackMethod, req.Payload);
            return requestId;
        }

        private static ByteString ComputeResultHash(ByteString result)
        {
            return CryptoLib.Sha256(result ?? (ByteString)"");
        }

        private static BigInteger ComputeResultSize(ByteString result)
        {
            return result == null ? 0 : result.Length;
        }

        public static void FulfillRequest(BigInteger requestId, bool success, ByteString result, string error)
        {
            ValidateUpdater();

            OracleRequest req = GetRequest(requestId);
            ExecutionEngine.Assert(req.Id > 0, "request not found");
            ExecutionEngine.Assert(req.Status == OracleRequestStatus.Pending, "request already fulfilled");
            ExecutionEngine.Assert(IsAllowedCallback(req.CallbackContract), "callback contract not allowed");
            ExecutionEngine.Assert(result == null || result.Length <= MAX_RESULT_LENGTH, "result too large");
            ExecutionEngine.Assert(error == null || error.Length <= MAX_ERROR_LENGTH, "error too large");

            req.Status = success ? OracleRequestStatus.Fulfilled : OracleRequestStatus.Failed;
            req.FulfilledAt = Runtime.Time;
            req.Success = success;
            req.Result = result ?? (ByteString)"";
            req.Error = error ?? "";
            RequestMap().Put(requestId.ToByteArray(), StdLib.Serialize(req));
            IncrementTotalFulfilled();
            IncrementTypeFulfilled(req.RequestType);

            try
            {
                Contract.Call(req.CallbackContract, CALLBACK_METHOD, CallFlags.All,
                    requestId, req.RequestType, req.Success, req.Result, req.Error);
            }
            catch
            {
                req.Status = OracleRequestStatus.Failed;
                req.Success = false;
                if (req.Error == null || req.Error.Length == 0)
                {
                    req.Error = "callback execution failed";
                }
                RequestMap().Put(requestId.ToByteArray(), StdLib.Serialize(req));
            }

            OnOracleFulfilled(requestId, req.RequestType, req.Success, ComputeResultHash(req.Result), ComputeResultSize(req.Result), req.Error);
        }

        public static void Update(ByteString nefFile, string manifest)
        {
            ValidateAdmin();
            ContractManagement.Update(nefFile, manifest, null);
        }
    }
}
