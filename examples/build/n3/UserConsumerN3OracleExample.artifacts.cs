using Neo.Cryptography.ECC;
using Neo.Extensions;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Numerics;

#pragma warning disable CS0067

namespace Neo.SmartContract.Testing;

public abstract class UserConsumerN3OracleExample(Neo.SmartContract.Testing.SmartContractInitialize initialize) : Neo.SmartContract.Testing.SmartContract(initialize), IContractInfo
{
    #region Compiled data

    public static Neo.SmartContract.Manifest.ContractManifest Manifest => Neo.SmartContract.Manifest.ContractManifest.Parse(@"{""name"":""UserConsumerN3OracleExample"",""groups"":[],""features"":{},""supportedstandards"":[],""abi"":{""methods"":[{""name"":""_deploy"",""parameters"":[{""name"":""data"",""type"":""Any""},{""name"":""update"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":0,""safe"":false},{""name"":""admin"",""parameters"":[],""returntype"":""Hash160"",""offset"":45,""safe"":true},{""name"":""oracle"",""parameters"":[],""returntype"":""Hash160"",""offset"":74,""safe"":true},{""name"":""setAdmin"",""parameters"":[{""name"":""newAdmin"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":97,""safe"":false},{""name"":""setOracle"",""parameters"":[{""name"":""oracle"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":245,""safe"":false},{""name"":""requestRaw"",""parameters"":[{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":304,""safe"":false},{""name"":""requestBuiltinProviderPrice"",""parameters"":[],""returntype"":""Integer"",""offset"":420,""safe"":false},{""name"":""requestBuiltinCompute"",""parameters"":[{""name"":""encryptedPayload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":577,""safe"":false},{""name"":""requestRawSponsored"",""parameters"":[{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":675,""safe"":false},{""name"":""requestBuiltinProviderPriceSponsored"",""parameters"":[],""returntype"":""Integer"",""offset"":688,""safe"":false},{""name"":""requestBuiltinComputeSponsored"",""parameters"":[{""name"":""encryptedPayload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":696,""safe"":false},{""name"":""depositOracleCredits"",""parameters"":[{""name"":""amount"",""type"":""Integer""}],""returntype"":""Void"",""offset"":705,""safe"":false},{""name"":""onNEP17Payment"",""parameters"":[{""name"":""from"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""},{""name"":""data"",""type"":""Any""}],""returntype"":""Void"",""offset"":780,""safe"":false},{""name"":""contractGasBalance"",""parameters"":[],""returntype"":""Integer"",""offset"":885,""safe"":true},{""name"":""onOracleResult"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""requestType"",""type"":""String""},{""name"":""success"",""type"":""Boolean""},{""name"":""result"",""type"":""ByteArray""},{""name"":""error"",""type"":""String""}],""returntype"":""Void"",""offset"":900,""safe"":false},{""name"":""getCallback"",""parameters"":[{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Array"",""offset"":977,""safe"":true},{""name"":""_initialize"",""parameters"":[],""returntype"":""Void"",""offset"":1018,""safe"":false}],""events"":[]},""permissions"":[{""contract"":""0xacce6fd80d44e1796aa0c2c625e9e4e0ce39efc0"",""methods"":[""deserialize"",""serialize""]},{""contract"":""0xd2a4cff31913016155e38e474a2c06d08be276cf"",""methods"":[""balanceOf"",""transfer""]},{""contract"":""*"",""methods"":[""request""]}],""trusts"":[],""extra"":{""nef"":{""optimization"":""Basic""}}}");

    /// <summary>
    /// Optimization: "Basic"
    /// </summary>
    public static Neo.SmartContract.NefFile Nef => Convert.FromBase64String(@"TkVGM05lby5Db21waWxlci5DU2hhcnAgMy45LjErNWZhOTU2NmU1MTY1ZWRlMjE2NWE5YmUxZjRhMDEyMGMxNzYuLi4AAATPduKL0AYsSkeO41VhARMZ88+k0gh0cmFuc2ZlcgQAAQ/PduKL0AYsSkeO41VhARMZ88+k0gliYWxhbmNlT2YBAAEPwO85zuDk6SXGwqBqeeFEDdhvzqwJc2VyaWFsaXplAQABD8DvOc7g5OklxsKgannhRA3Yb86sC2Rlc2VyaWFsaXplAQABDwAA/Q8EVwACeSYEIhRBLVEIMBPOWEGb9mfOQeY/GIRAQeY/GIRAQS1RCDBAQZv2Z85AWEGb9mfOQZJd6DFK2CQJSsoAFCgDOkBBkl3oMUBZQZv2Z85Bkl3oMUrYJAlKygAUKAM6QFcAATQ3eAuYJAUJIhB4StkoJAZFCSIGygAUsyQSDA1pbnZhbGlkIGFkbWlu4HhYQZv2Z85B5j8YhEBXAQA0j3BoC5gkBQkiEGhK2SgkBkUJIgbKABSzJBIMDWFkbWluIG5vdCBzZXTgaEH4J+yMJBEMDHVuYXV0aG9yaXplZOBAStkoJAZFCSIGygAUs0BB+CfsjEBXAAE0o3gLmCQFCSIQeErZKCQGRQkiBsoAFLMkEwwOaW52YWxpZCBvcmFjbGXgeFlBm/ZnzkHmPxiEQFcBAjQvcAwOb25PcmFjbGVSZXN1bHRB2/6odHl4FMAfDAdyZXF1ZXN0aEFifVtSIgJAVwEANeX+//9waAuYJAUJIhBoStkoJAZFCSIGygAUsyQTDA5vcmFjbGUgbm90IHNldOBoIgJAQWJ9W1JAQdv+qHRAVwIANLtwDFh7InByb3ZpZGVyIjoidHdlbHZlZGF0YSIsInN5bWJvbCI6Ik5FTy1VU0QiLCJqc29uX3BhdGgiOiJwcmljZSIsInRhcmdldF9jaGFpbiI6Im5lb19uMyJ9cQwOb25PcmFjbGVSZXN1bHRB2/6odGkMDnByaXZhY3lfb3JhY2xlFMAfDAdyZXF1ZXN0aEFifVtSIgJAQFcCATUe////cAwWeyJlbmNyeXB0ZWRfcGF5bG9hZCI6IniL2ygMAiJ9i9socQwOb25PcmFjbGVSZXN1bHRB2/6odGkMB2NvbXB1dGUUwB8MB3JlcXVlc3RoQWJ9W1IiAkBAVwACeXg1iP7//yICQDX0/v//IgJAVwABeDSFIgJAVwEBNZ7+//9weBC3JBMMDmludmFsaWQgYW1vdW504EHb/qh0eGhB2/6odDcAACQYDBNnYXMgdHJhbnNmZXIgZmFpbGVk4EA3AABAVwADQTlTbjwMFM924ovQBixKR47jVWEBExnzz6TSlyQWDBFvbmx5IEdBUyBhY2NlcHRlZOB5ELgkEwwOaW52YWxpZCBhbW91bnTgQEE5U248QAwUz3bii9AGLEpHjuNVYQETGfPPpNJAQdv+qHQ3AQAiAkA3AQBAVwAFNB18e3p5FMA3AgBaeNsw2yiLQZv2Z85B5j8YhEBBOVNuPDW5/f//lyQYDBN1bmF1dGhvcml6ZWQgY2FsbGVy4EA3AgBAi0DbKEBXAQFaeNsw2yiLQZv2Z85Bkl3oMXBoC5cmBhDAIghoNwMAIgJANwMAQFYDDAEB2zBgDAEC2zBhDAEQ2zBiQPczH4c=").AsSerializable<Neo.SmartContract.NefFile>();

    #endregion

    #region Properties

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract UInt160? Admin { [DisplayName("admin")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? ContractGasBalance { [DisplayName("contractGasBalance")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract UInt160? Oracle { [DisplayName("oracle")] get; }

    #endregion

    #region Safe methods

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getCallback")]
    public abstract IList<object>? GetCallback(BigInteger? requestId);

    #endregion

    #region Unsafe methods

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("depositOracleCredits")]
    public abstract void DepositOracleCredits(BigInteger? amount);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("onNEP17Payment")]
    public abstract void OnNEP17Payment(UInt160? from, BigInteger? amount, object? data = null);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("onOracleResult")]
    public abstract void OnOracleResult(BigInteger? requestId, string? requestType, bool? success, byte[]? result, string? error);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("requestBuiltinCompute")]
    public abstract BigInteger? RequestBuiltinCompute(byte[]? encryptedPayload);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("requestBuiltinComputeSponsored")]
    public abstract BigInteger? RequestBuiltinComputeSponsored(byte[]? encryptedPayload);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("requestBuiltinProviderPrice")]
    public abstract BigInteger? RequestBuiltinProviderPrice();

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("requestBuiltinProviderPriceSponsored")]
    public abstract BigInteger? RequestBuiltinProviderPriceSponsored();

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("requestRaw")]
    public abstract BigInteger? RequestRaw(string? requestType, byte[]? payload);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("requestRawSponsored")]
    public abstract BigInteger? RequestRawSponsored(string? requestType, byte[]? payload);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setAdmin")]
    public abstract void SetAdmin(UInt160? newAdmin);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setOracle")]
    public abstract void SetOracle(UInt160? oracle);

    #endregion
}
