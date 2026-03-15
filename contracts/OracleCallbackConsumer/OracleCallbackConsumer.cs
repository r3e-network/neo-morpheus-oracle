using System.ComponentModel;
using System.Numerics;
using Neo;
using Neo.SmartContract.Framework;
using Neo.SmartContract.Framework.Attributes;
using Neo.SmartContract.Framework.Native;
using Neo.SmartContract.Framework.Services;

namespace MorpheusOracle.Contracts
{
    public delegate void OracleCallbackReceivedHandler(BigInteger requestId, string requestType, bool success, string error);
    public delegate void AdminChangedHandler(UInt160 oldAdmin, UInt160 newAdmin);
    public delegate void OracleChangedHandler(UInt160 oldOracle, UInt160 newOracle);

    /// <summary>
    /// Minimal callback sink used to receive and persist Morpheus Oracle results.
    /// </summary>
    /// <remarks>
    /// This example contract demonstrates the expected callback pattern: set a trusted Oracle
    /// contract, accept only that caller, and store callback payloads by request id for later read
    /// access or downstream processing.
    /// </remarks>
    [DisplayName("OracleCallbackConsumer")]
    [ManifestExtra("Author", "Morpheus Oracle")]
    [ManifestExtra("Version", "1.0.0")]
    [ManifestExtra("Description", "Minimal callback consumer for MorpheusOracle verification")]
    [ContractPermission("*", "*")]
    public partial class OracleCallbackConsumer : SmartContract
    {
        private static readonly byte[] PREFIX_ADMIN = new byte[] { 0x01 };
        private static readonly byte[] PREFIX_ORACLE = new byte[] { 0x02 };
        private static readonly byte[] PREFIX_CALLBACK = new byte[] { 0x10 };

        [DisplayName("OracleCallbackReceived")]
        public static event OracleCallbackReceivedHandler OnOracleCallbackReceived;

        [DisplayName("AdminChanged")]
        public static event AdminChangedHandler OnAdminChanged;

        [DisplayName("OracleChanged")]
        public static event OracleChangedHandler OnOracleChanged;

        public static void _deploy(object data, bool update)
        {
            if (update) return;
            Storage.Put(Storage.CurrentContext, PREFIX_ADMIN, Runtime.Transaction.Sender);
        }

        [Safe]
        public static UInt160 Admin()
        {
            return (UInt160)Storage.Get(Storage.CurrentContext, PREFIX_ADMIN);
        }

        [Safe]
        public static UInt160 Oracle()
        {
            return (UInt160)Storage.Get(Storage.CurrentContext, PREFIX_ORACLE);
        }

        public static void SetAdmin(UInt160 newAdmin)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(newAdmin != null && newAdmin.IsValid, "invalid");
            UInt160 oldAdmin = Admin();
            Storage.Put(Storage.CurrentContext, PREFIX_ADMIN, newAdmin);
            OnAdminChanged(oldAdmin, newAdmin);
        }

        /// <summary>
        /// Sets the Oracle contract allowed to call <c>OnOracleResult</c>.
        /// </summary>
        public static void SetOracle(UInt160 oracle)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(oracle != null && oracle.IsValid, "invalid");
            UInt160 oldOracle = Oracle();
            Storage.Put(Storage.CurrentContext, PREFIX_ORACLE, oracle);
            OnOracleChanged(oldOracle, oracle);
        }

        /// <summary>
        /// Receives a callback from the configured Oracle contract and stores it under the request id.
        /// </summary>
        public static void OnOracleResult(BigInteger requestId, string requestType, bool success, ByteString result, string error)
        {
            ValidateOracle();

            byte[] key = Helper.Concat(PREFIX_CALLBACK, (ByteString)requestId.ToByteArray());
            Storage.Put(Storage.CurrentContext, key, StdLib.Serialize(new object[] { requestType, success, result, error }));
            OnOracleCallbackReceived(requestId, requestType, success, error);
        }

        [Safe]
        public static object[] GetCallback(BigInteger requestId)
        {
            byte[] key = Helper.Concat(PREFIX_CALLBACK, (ByteString)requestId.ToByteArray());
            ByteString data = Storage.Get(Storage.CurrentContext, key);
            if (data == null) return new object[] { };
            return (object[])StdLib.Deserialize(data);
        }

        private static void ValidateAdmin()
        {
            UInt160 admin = Admin();
            ExecutionEngine.Assert(admin != null && admin.IsValid, "admin not set");
            ExecutionEngine.Assert(Runtime.CheckWitness(admin), "unauthorized");
        }

        private static void ValidateOracle()
        {
            UInt160 oracle = Oracle();
            ExecutionEngine.Assert(oracle != null && oracle.IsValid, "oracle not set");
            ExecutionEngine.Assert(Runtime.CallingScriptHash == oracle, "unauthorized caller");
        }
    }
}
