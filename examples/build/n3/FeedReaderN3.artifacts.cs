using Neo.Cryptography.ECC;
using Neo.Extensions;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Numerics;

#pragma warning disable CS0067

namespace Neo.SmartContract.Testing;

public abstract class FeedReaderN3(Neo.SmartContract.Testing.SmartContractInitialize initialize) : Neo.SmartContract.Testing.SmartContract(initialize), IContractInfo
{
    #region Compiled data

    public static Neo.SmartContract.Manifest.ContractManifest Manifest => Neo.SmartContract.Manifest.ContractManifest.Parse(@"{""name"":""FeedReaderN3"",""groups"":[],""features"":{},""supportedstandards"":[],""abi"":{""methods"":[{""name"":""getNeoUsd"",""parameters"":[{""name"":""dataFeedHash"",""type"":""Hash160""}],""returntype"":""Array"",""offset"":0,""safe"":true},{""name"":""getAllPairs"",""parameters"":[{""name"":""dataFeedHash"",""type"":""Hash160""}],""returntype"":""Array"",""offset"":52,""safe"":true}],""events"":[]},""permissions"":[{""contract"":""*"",""methods"":[""getAllPairs"",""getLatest""]}],""trusts"":[],""extra"":{""nef"":{""optimization"":""Basic""}}}");

    /// <summary>
    /// Optimization: "Basic"
    /// </summary>
    public static Neo.SmartContract.NefFile Nef => Convert.FromBase64String(@"TkVGM05lby5Db21waWxlci5DU2hhcnAgMy45LjErNWZhOTU2NmU1MTY1ZWRlMjE2NWE5YmUxZjRhMDEyMGMxNzYuLi4AAAAAAE9XAAEMElRXRUxWRURBVEE6TkVPLVVTRBHAFQwJZ2V0TGF0ZXN0eEFifVtSIgJAQWJ9W1JAVwABwhUMC2dldEFsbFBhaXJzeEFifVtSIgJANsaHag==").AsSerializable<Neo.SmartContract.NefFile>();

    #endregion

    #region Safe methods

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getAllPairs")]
    public abstract IList<object>? GetAllPairs(UInt160? dataFeedHash);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getNeoUsd")]
    public abstract IList<object>? GetNeoUsd(UInt160? dataFeedHash);

    #endregion

}
