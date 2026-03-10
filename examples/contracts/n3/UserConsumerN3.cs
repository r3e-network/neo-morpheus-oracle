using System.ComponentModel;
using System.Numerics;
using Neo;
using Neo.SmartContract.Framework;
using Neo.SmartContract.Framework.Attributes;
using Neo.SmartContract.Framework.Native;
using Neo.SmartContract.Framework.Services;

[DisplayName("UserConsumerN3OracleExample")]
[ContractPermission("*", "request")]
[ContractPermission("0xd2a4cff31913016155e38e474a2c06d08be276cf", "transfer")]
public class UserConsumerN3 : SmartContract
{
    private static readonly byte[] PREFIX_ADMIN = new byte[] { 0x01 };
    private static readonly byte[] PREFIX_ORACLE = new byte[] { 0x02 };
    private static readonly byte[] PREFIX_CALLBACK = new byte[] { 0x10 };

    public static void _deploy(object data, bool update)
    {
        if (update) return;
        Storage.Put(Storage.CurrentContext, PREFIX_ADMIN, Runtime.Transaction.Sender);
    }

    [Safe]
    public static UInt160 Admin() => (UInt160)Storage.Get(Storage.CurrentContext, PREFIX_ADMIN);

    [Safe]
    public static UInt160 Oracle() => (UInt160)Storage.Get(Storage.CurrentContext, PREFIX_ORACLE);

    public static void SetAdmin(UInt160 newAdmin)
    {
        ValidateAdmin();
        ExecutionEngine.Assert(newAdmin != null && newAdmin.IsValid, "invalid admin");
        Storage.Put(Storage.CurrentContext, PREFIX_ADMIN, newAdmin);
    }

    public static void SetOracle(UInt160 oracle)
    {
        ValidateAdmin();
        ExecutionEngine.Assert(oracle != null && oracle.IsValid, "invalid oracle");
        Storage.Put(Storage.CurrentContext, PREFIX_ORACLE, oracle);
    }

    public static BigInteger RequestRaw(string requestType, ByteString payload)
    {
        UInt160 oracle = RequireOracle();
        return (BigInteger)Contract.Call(
            oracle,
            "request",
            CallFlags.All,
            requestType,
            payload,
            Runtime.ExecutingScriptHash,
            "onOracleResult"
        );
    }

    public static BigInteger RequestBuiltinProviderPrice()
    {
        UInt160 oracle = RequireOracle();
        string payloadJson = "{\"provider\":\"twelvedata\",\"symbol\":\"NEO-USD\",\"json_path\":\"price\",\"target_chain\":\"neo_n3\"}";
        return (BigInteger)Contract.Call(
            oracle,
            "request",
            CallFlags.All,
            "privacy_oracle",
            (ByteString)payloadJson,
            Runtime.ExecutingScriptHash,
            "onOracleResult"
        );
    }

    public static BigInteger RequestBuiltinCompute(ByteString encryptedPayload)
    {
        UInt160 oracle = RequireOracle();
        string payloadJson = "{\"encrypted_payload\":\"" + (string)encryptedPayload + "\"}";
        return (BigInteger)Contract.Call(
            oracle,
            "request",
            CallFlags.All,
            "compute",
            (ByteString)payloadJson,
            Runtime.ExecutingScriptHash,
            "onOracleResult"
        );
    }

    public static BigInteger RequestRawSponsored(string requestType, ByteString payload)
    {
        return RequestRaw(requestType, payload);
    }

    public static BigInteger RequestBuiltinProviderPriceSponsored()
    {
        return RequestBuiltinProviderPrice();
    }

    public static BigInteger RequestBuiltinComputeSponsored(ByteString encryptedPayload)
    {
        return RequestBuiltinCompute(encryptedPayload);
    }

    public static void DepositOracleCredits(BigInteger amount)
    {
        UInt160 oracle = RequireOracle();
        ExecutionEngine.Assert(amount > 0, "invalid amount");
        ExecutionEngine.Assert(
            GAS.Transfer(Runtime.ExecutingScriptHash, oracle, amount, Runtime.ExecutingScriptHash),
            "gas transfer failed"
        );
    }

    public static void OnNEP17Payment(UInt160 from, BigInteger amount, object data)
    {
        ExecutionEngine.Assert(Runtime.CallingScriptHash == GAS.Hash, "only GAS accepted");
        ExecutionEngine.Assert(amount >= 0, "invalid amount");
    }

    [Safe]
    public static BigInteger ContractGasBalance()
    {
        return GAS.BalanceOf(Runtime.ExecutingScriptHash);
    }

    public static void OnOracleResult(BigInteger requestId, string requestType, bool success, ByteString result, string error)
    {
        ValidateOracle();
        Storage.Put(
            Storage.CurrentContext,
            Helper.Concat(PREFIX_CALLBACK, (ByteString)requestId.ToByteArray()),
            StdLib.Serialize(new object[] { requestType, success, result, error })
        );
    }

    [Safe]
    public static object[] GetCallback(BigInteger requestId)
    {
        ByteString raw = Storage.Get(Storage.CurrentContext, Helper.Concat(PREFIX_CALLBACK, (ByteString)requestId.ToByteArray()));
        if (raw == null) return new object[] { };
        return (object[])StdLib.Deserialize(raw);
    }

    private static void ValidateAdmin()
    {
        UInt160 admin = Admin();
        ExecutionEngine.Assert(admin != null && admin.IsValid, "admin not set");
        ExecutionEngine.Assert(Runtime.CheckWitness(admin), "unauthorized");
    }

    private static UInt160 RequireOracle()
    {
        UInt160 oracle = Oracle();
        ExecutionEngine.Assert(oracle != null && oracle.IsValid, "oracle not set");
        return oracle;
    }

    private static void ValidateOracle()
    {
        ExecutionEngine.Assert(Runtime.CallingScriptHash == RequireOracle(), "unauthorized caller");
    }
}
