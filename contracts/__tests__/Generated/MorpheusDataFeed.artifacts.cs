using Neo.Cryptography.ECC;
using Neo.Extensions;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Numerics;

#pragma warning disable CS0067

namespace Neo.SmartContract.Testing;

public abstract class MorpheusDataFeed(Neo.SmartContract.Testing.SmartContractInitialize initialize) : Neo.SmartContract.Testing.SmartContract(initialize), IContractInfo
{
    #region Compiled data

    public static Neo.SmartContract.Manifest.ContractManifest Manifest => Neo.SmartContract.Manifest.ContractManifest.Parse(@"{""name"":""MorpheusDataFeed"",""groups"":[],""features"":{},""supportedstandards"":[],""abi"":{""methods"":[{""name"":""_deploy"",""parameters"":[{""name"":""data"",""type"":""Any""},{""name"":""update"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":0,""safe"":false},{""name"":""admin"",""parameters"":[],""returntype"":""Hash160"",""offset"":47,""safe"":true},{""name"":""updater"",""parameters"":[],""returntype"":""Hash160"",""offset"":76,""safe"":true},{""name"":""oracleVerificationKey"",""parameters"":[],""returntype"":""PublicKey"",""offset"":99,""safe"":true},{""name"":""setAdmin"",""parameters"":[{""name"":""newAdmin"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":323,""safe"":false},{""name"":""setUpdater"",""parameters"":[{""name"":""updater"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":413,""safe"":false},{""name"":""setOracleVerificationKey"",""parameters"":[{""name"":""publicKey"",""type"":""PublicKey""}],""returntype"":""Void"",""offset"":507,""safe"":false},{""name"":""clearOracleVerificationKey"",""parameters"":[],""returntype"":""Void"",""offset"":635,""safe"":false},{""name"":""getPairCount"",""parameters"":[],""returntype"":""Integer"",""offset"":721,""safe"":true},{""name"":""getPairByIndex"",""parameters"":[{""name"":""index"",""type"":""Integer""}],""returntype"":""String"",""offset"":1401,""safe"":true},{""name"":""getAllPairs"",""parameters"":[],""returntype"":""Array"",""offset"":1469,""safe"":true},{""name"":""updateFeed"",""parameters"":[{""name"":""pair"",""type"":""String""},{""name"":""roundId"",""type"":""Integer""},{""name"":""price"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":1573,""safe"":false},{""name"":""updateFeedSigned"",""parameters"":[{""name"":""pair"",""type"":""String""},{""name"":""roundId"",""type"":""Integer""},{""name"":""price"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""},{""name"":""signature"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":1594,""safe"":false},{""name"":""adminResetFeed"",""parameters"":[{""name"":""pair"",""type"":""String""},{""name"":""roundId"",""type"":""Integer""},{""name"":""price"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":1615,""safe"":false},{""name"":""updateResource"",""parameters"":[{""name"":""resourceId"",""type"":""String""},{""name"":""version"",""type"":""Integer""},{""name"":""value"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":1860,""safe"":false},{""name"":""updateFeeds"",""parameters"":[{""name"":""pairs"",""type"":""Array""},{""name"":""roundIds"",""type"":""Array""},{""name"":""prices"",""type"":""Array""},{""name"":""timestamps"",""type"":""Array""},{""name"":""attestationHashes"",""type"":""Array""},{""name"":""sourceSetIds"",""type"":""Array""}],""returntype"":""Void"",""offset"":1875,""safe"":false},{""name"":""updateResources"",""parameters"":[{""name"":""resourceIds"",""type"":""Array""},{""name"":""versions"",""type"":""Array""},{""name"":""values"",""type"":""Array""},{""name"":""timestamps"",""type"":""Array""},{""name"":""attestationHashes"",""type"":""Array""},{""name"":""sourceSetIds"",""type"":""Array""}],""returntype"":""Void"",""offset"":2223,""safe"":false},{""name"":""getLatest"",""parameters"":[{""name"":""pair"",""type"":""String""}],""returntype"":""Array"",""offset"":1338,""safe"":true},{""name"":""getResource"",""parameters"":[{""name"":""resourceId"",""type"":""String""}],""returntype"":""Array"",""offset"":2238,""safe"":true},{""name"":""getAllFeedRecords"",""parameters"":[],""returntype"":""Array"",""offset"":2250,""safe"":true},{""name"":""getAllResources"",""parameters"":[],""returntype"":""Array"",""offset"":2343,""safe"":true},{""name"":""update"",""parameters"":[{""name"":""nefFile"",""type"":""ByteArray""},{""name"":""manifest"",""type"":""String""}],""returntype"":""Void"",""offset"":2348,""safe"":false},{""name"":""_initialize"",""parameters"":[],""returntype"":""Void"",""offset"":2367,""safe"":false}],""events"":[{""name"":""FeedUpdated"",""parameters"":[{""name"":""pair"",""type"":""String""},{""name"":""roundId"",""type"":""Integer""},{""name"":""price"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""}]},{""name"":""AdminChanged"",""parameters"":[{""name"":""oldAdmin"",""type"":""Hash160""},{""name"":""newAdmin"",""type"":""Hash160""}]},{""name"":""UpdaterChanged"",""parameters"":[{""name"":""oldUpdater"",""type"":""Hash160""},{""name"":""newUpdater"",""type"":""Hash160""}]},{""name"":""VerificationKeyChanged"",""parameters"":[{""name"":""oldKey"",""type"":""PublicKey""},{""name"":""newKey"",""type"":""PublicKey""}]}]},""permissions"":[{""contract"":""0x726cb6e0cd8628a1350a611384688911ab75f51b"",""methods"":[""verifyWithECDsa""]},{""contract"":""0xacce6fd80d44e1796aa0c2c625e9e4e0ce39efc0"",""methods"":[""deserialize"",""itoa"",""serialize""]},{""contract"":""0xfffdc93764dbaddd97c48f252a53ea4643faa3fd"",""methods"":[""update""]}],""trusts"":[],""extra"":{""Author"":""Morpheus Oracle"",""Version"":""2.0.0"",""Description"":""Shared numeric resource registry for the Morpheus MiniApp OS"",""nef"":{""optimization"":""Basic""}}}");

    /// <summary>
    /// Optimization: "Basic"
    /// </summary>
    public static Neo.SmartContract.NefFile Nef => Convert.FromBase64String(@"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").AsSerializable<Neo.SmartContract.NefFile>();

    #endregion

    #region Events

    public delegate void delAdminChanged(UInt160? oldAdmin, UInt160? newAdmin);

    [DisplayName("AdminChanged")]
    public event delAdminChanged? OnAdminChanged;

    public delegate void delFeedUpdated(string? pair, BigInteger? roundId, BigInteger? price, BigInteger? timestamp, byte[]? attestationHash, BigInteger? sourceSetId);

    [DisplayName("FeedUpdated")]
    public event delFeedUpdated? OnFeedUpdated;

    public delegate void delUpdaterChanged(UInt160? oldUpdater, UInt160? newUpdater);

    [DisplayName("UpdaterChanged")]
    public event delUpdaterChanged? OnUpdaterChanged;

    public delegate void delVerificationKeyChanged(ECPoint? oldKey, ECPoint? newKey);

    [DisplayName("VerificationKeyChanged")]
    public event delVerificationKeyChanged? OnVerificationKeyChanged;

    #endregion

    #region Properties

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract UInt160? Admin { [DisplayName("admin")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract IList<object>? AllFeedRecords { [DisplayName("getAllFeedRecords")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract IList<object>? AllPairs { [DisplayName("getAllPairs")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract IList<object>? AllResources { [DisplayName("getAllResources")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? PairCount { [DisplayName("getPairCount")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract ECPoint? OracleVerificationKey { [DisplayName("oracleVerificationKey")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract UInt160? Updater { [DisplayName("updater")] get; }

    #endregion

    #region Safe methods

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getLatest")]
    public abstract IList<object>? GetLatest(string? pair);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getPairByIndex")]
    public abstract string? GetPairByIndex(BigInteger? index);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getResource")]
    public abstract IList<object>? GetResource(string? resourceId);

    #endregion

    #region Unsafe methods

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("adminResetFeed")]
    public abstract void AdminResetFeed(string? pair, BigInteger? roundId, BigInteger? price, BigInteger? timestamp, byte[]? attestationHash, BigInteger? sourceSetId);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("clearOracleVerificationKey")]
    public abstract void ClearOracleVerificationKey();

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setAdmin")]
    public abstract void SetAdmin(UInt160? newAdmin);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setOracleVerificationKey")]
    public abstract void SetOracleVerificationKey(ECPoint? publicKey);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setUpdater")]
    public abstract void SetUpdater(UInt160? updater);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("update")]
    public abstract void Update(byte[]? nefFile, string? manifest);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("updateFeed")]
    public abstract void UpdateFeed(string? pair, BigInteger? roundId, BigInteger? price, BigInteger? timestamp, byte[]? attestationHash, BigInteger? sourceSetId);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("updateFeeds")]
    public abstract void UpdateFeeds(IList<object>? pairs, IList<object>? roundIds, IList<object>? prices, IList<object>? timestamps, IList<object>? attestationHashes, IList<object>? sourceSetIds);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("updateFeedSigned")]
    public abstract void UpdateFeedSigned(string? pair, BigInteger? roundId, BigInteger? price, BigInteger? timestamp, byte[]? attestationHash, BigInteger? sourceSetId, byte[]? signature);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("updateResource")]
    public abstract void UpdateResource(string? resourceId, BigInteger? version, BigInteger? value, BigInteger? timestamp, byte[]? attestationHash, BigInteger? sourceSetId);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("updateResources")]
    public abstract void UpdateResources(IList<object>? resourceIds, IList<object>? versions, IList<object>? values, IList<object>? timestamps, IList<object>? attestationHashes, IList<object>? sourceSetIds);

    #endregion
}
