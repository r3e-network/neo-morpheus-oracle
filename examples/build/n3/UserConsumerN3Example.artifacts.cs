using Neo.Cryptography.ECC;
using Neo.Extensions;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Numerics;

#pragma warning disable CS0067

namespace Neo.SmartContract.Testing;

public abstract class UserConsumerN3Example(Neo.SmartContract.Testing.SmartContractInitialize initialize) : Neo.SmartContract.Testing.SmartContract(initialize), IContractInfo
{
    #region Compiled data

    public static Neo.SmartContract.Manifest.ContractManifest Manifest => Neo.SmartContract.Manifest.ContractManifest.Parse(@"{""name"":""UserConsumerN3Example"",""groups"":[],""features"":{},""supportedstandards"":[],""abi"":{""methods"":[{""name"":""_deploy"",""parameters"":[{""name"":""data"",""type"":""Any""},{""name"":""update"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":0,""safe"":false},{""name"":""admin"",""parameters"":[],""returntype"":""Hash160"",""offset"":45,""safe"":true},{""name"":""oracle"",""parameters"":[],""returntype"":""Hash160"",""offset"":74,""safe"":true},{""name"":""setAdmin"",""parameters"":[{""name"":""newAdmin"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":97,""safe"":false},{""name"":""setOracle"",""parameters"":[{""name"":""oracle"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":245,""safe"":false},{""name"":""requestRaw"",""parameters"":[{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":304,""safe"":false},{""name"":""requestBuiltinProviderPrice"",""parameters"":[],""returntype"":""Integer"",""offset"":420,""safe"":false},{""name"":""requestBuiltinCompute"",""parameters"":[{""name"":""encryptedPayload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":577,""safe"":false},{""name"":""onOracleResult"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""requestType"",""type"":""String""},{""name"":""success"",""type"":""Boolean""},{""name"":""result"",""type"":""ByteArray""},{""name"":""error"",""type"":""String""}],""returntype"":""Void"",""offset"":675,""safe"":false},{""name"":""getCallback"",""parameters"":[{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Array"",""offset"":758,""safe"":true},{""name"":""_initialize"",""parameters"":[],""returntype"":""Void"",""offset"":799,""safe"":false}],""events"":[]},""permissions"":[{""contract"":""0xacce6fd80d44e1796aa0c2c625e9e4e0ce39efc0"",""methods"":[""deserialize"",""serialize""]},{""contract"":""*"",""methods"":[""request""]}],""trusts"":[],""extra"":{""nef"":{""optimization"":""Basic""}}}");

    /// <summary>
    /// Optimization: "Basic"
    /// </summary>
    public static Neo.SmartContract.NefFile Nef => Convert.FromBase64String(@"TkVGM05lby5Db21waWxlci5DU2hhcnAgMy45LjErNWZhOTU2NmU1MTY1ZWRlMjE2NWE5YmUxZjRhMDEyMGMxNzYuLi4AAALA7znO4OTpJcbCoGp54UQN2G/OrAlzZXJpYWxpemUBAAEPwO85zuDk6SXGwqBqeeFEDdhvzqwLZGVzZXJpYWxpemUBAAEPAAD9NANXAAJ5JgQiFEEtUQgwE85YQZv2Z85B5j8YhEBB5j8YhEBBLVEIMEBBm/ZnzkBYQZv2Z85Bkl3oMUrYJAlKygAUKAM6QEGSXegxQFlBm/ZnzkGSXegxStgkCUrKABQoAzpAVwABNDd4C5gkBQkiEHhK2SgkBkUJIgbKABSzJBIMDWludmFsaWQgYWRtaW7geFhBm/ZnzkHmPxiEQFcBADSPcGgLmCQFCSIQaErZKCQGRQkiBsoAFLMkEgwNYWRtaW4gbm90IHNldOBoQfgn7IwkEQwMdW5hdXRob3JpemVk4EBK2SgkBkUJIgbKABSzQEH4J+yMQFcAATSjeAuYJAUJIhB4StkoJAZFCSIGygAUsyQTDA5pbnZhbGlkIG9yYWNsZeB4WUGb9mfOQeY/GIRAVwECNC9wDA5vbk9yYWNsZVJlc3VsdEHb/qh0eXgUwB8MB3JlcXVlc3RoQWJ9W1IiAkBXAQA15f7//3BoC5gkBQkiEGhK2SgkBkUJIgbKABSzJBMMDm9yYWNsZSBub3Qgc2V04GgiAkBBYn1bUkBB2/6odEBXAgA0u3AMWHsicHJvdmlkZXIiOiJ0d2VsdmVkYXRhIiwic3ltYm9sIjoiTkVPLVVTRCIsImpzb25fcGF0aCI6InByaWNlIiwidGFyZ2V0X2NoYWluIjoibmVvX24zIn1xDA5vbk9yYWNsZVJlc3VsdEHb/qh0aQwOcHJpdmFjeV9vcmFjbGUUwB8MB3JlcXVlc3RoQWJ9W1IiAkBAVwIBNR7///9wDBZ7ImVuY3J5cHRlZF9wYXlsb2FkIjoieIvbKAwCIn2L2yhxDA5vbk9yYWNsZVJlc3VsdEHb/qh0aQwHY29tcHV0ZRTAHwwHcmVxdWVzdGhBYn1bUiICQEBXAAU0HXx7enkUwDcAAFp42zDbKItBm/ZnzkHmPxiEQEE5U248NZr+//+XJBgME3VuYXV0aG9yaXplZCBjYWxsZXLgQEE5U248QDcAAECLQNsoQFcBAVp42zDbKItBm/ZnzkGSXegxcGgLlyYGEMAiCGg3AQAiAkA3AQBAVgMMAQHbMGAMAQLbMGEMARDbMGJADR63/w==").AsSerializable<Neo.SmartContract.NefFile>();

    #endregion

    #region Properties

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract UInt160? Admin { [DisplayName("admin")] get; }

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
    [DisplayName("requestBuiltinProviderPrice")]
    public abstract BigInteger? RequestBuiltinProviderPrice();

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("requestRaw")]
    public abstract BigInteger? RequestRaw(string? requestType, byte[]? payload);

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
