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

    public static Neo.SmartContract.Manifest.ContractManifest Manifest => Neo.SmartContract.Manifest.ContractManifest.Parse(@"{""name"":""MorpheusDataFeed"",""groups"":[],""features"":{},""supportedstandards"":[],""abi"":{""methods"":[{""name"":""_deploy"",""parameters"":[{""name"":""data"",""type"":""Any""},{""name"":""update"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":0,""safe"":false},{""name"":""admin"",""parameters"":[],""returntype"":""Hash160"",""offset"":47,""safe"":true},{""name"":""updater"",""parameters"":[],""returntype"":""Hash160"",""offset"":76,""safe"":true},{""name"":""setAdmin"",""parameters"":[{""name"":""newAdmin"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":261,""safe"":false},{""name"":""setUpdater"",""parameters"":[{""name"":""updater"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":351,""safe"":false},{""name"":""getPairCount"",""parameters"":[],""returntype"":""Integer"",""offset"":466,""safe"":true},{""name"":""getPairByIndex"",""parameters"":[{""name"":""index"",""type"":""Integer""}],""returntype"":""String"",""offset"":978,""safe"":true},{""name"":""getAllPairs"",""parameters"":[],""returntype"":""Array"",""offset"":1046,""safe"":true},{""name"":""updateFeed"",""parameters"":[{""name"":""pair"",""type"":""String""},{""name"":""roundId"",""type"":""Integer""},{""name"":""price"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":1150,""safe"":false},{""name"":""adminResetFeed"",""parameters"":[{""name"":""pair"",""type"":""String""},{""name"":""roundId"",""type"":""Integer""},{""name"":""price"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":1170,""safe"":false},{""name"":""updateResource"",""parameters"":[{""name"":""resourceId"",""type"":""String""},{""name"":""version"",""type"":""Integer""},{""name"":""value"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":1415,""safe"":false},{""name"":""updateFeeds"",""parameters"":[{""name"":""pairs"",""type"":""Array""},{""name"":""roundIds"",""type"":""Array""},{""name"":""prices"",""type"":""Array""},{""name"":""timestamps"",""type"":""Array""},{""name"":""attestationHashes"",""type"":""Array""},{""name"":""sourceSetIds"",""type"":""Array""}],""returntype"":""Void"",""offset"":1430,""safe"":false},{""name"":""updateResources"",""parameters"":[{""name"":""resourceIds"",""type"":""Array""},{""name"":""versions"",""type"":""Array""},{""name"":""values"",""type"":""Array""},{""name"":""timestamps"",""type"":""Array""},{""name"":""attestationHashes"",""type"":""Array""},{""name"":""sourceSetIds"",""type"":""Array""}],""returntype"":""Void"",""offset"":1777,""safe"":false},{""name"":""getLatest"",""parameters"":[{""name"":""pair"",""type"":""String""}],""returntype"":""Array"",""offset"":914,""safe"":true},{""name"":""getResource"",""parameters"":[{""name"":""resourceId"",""type"":""String""}],""returntype"":""Array"",""offset"":1792,""safe"":true},{""name"":""getAllFeedRecords"",""parameters"":[],""returntype"":""Array"",""offset"":1804,""safe"":true},{""name"":""getAllResources"",""parameters"":[],""returntype"":""Array"",""offset"":1897,""safe"":true},{""name"":""update"",""parameters"":[{""name"":""nefFile"",""type"":""ByteArray""},{""name"":""manifest"",""type"":""String""}],""returntype"":""Void"",""offset"":1902,""safe"":false},{""name"":""_initialize"",""parameters"":[],""returntype"":""Void"",""offset"":1921,""safe"":false}],""events"":[{""name"":""FeedUpdated"",""parameters"":[{""name"":""pair"",""type"":""String""},{""name"":""roundId"",""type"":""Integer""},{""name"":""price"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""}]},{""name"":""AdminChanged"",""parameters"":[{""name"":""oldAdmin"",""type"":""Hash160""},{""name"":""newAdmin"",""type"":""Hash160""}]},{""name"":""UpdaterChanged"",""parameters"":[{""name"":""oldUpdater"",""type"":""Hash160""},{""name"":""newUpdater"",""type"":""Hash160""}]}]},""permissions"":[{""contract"":""0xacce6fd80d44e1796aa0c2c625e9e4e0ce39efc0"",""methods"":[""deserialize"",""serialize""]},{""contract"":""0xfffdc93764dbaddd97c48f252a53ea4643faa3fd"",""methods"":[""update""]}],""trusts"":[],""extra"":{""Author"":""Morpheus Oracle"",""Version"":""2.0.0"",""Description"":""Shared numeric resource registry for the Morpheus MiniApp OS"",""nef"":{""optimization"":""Basic""}}}");

    /// <summary>
    /// Optimization: "Basic"
    /// </summary>
    public static Neo.SmartContract.NefFile Nef => Convert.FromBase64String(@"TkVGM05lby5Db21waWxlci5DU2hhcnAgMy45LjErNWZhOTU2NmU1MTY1ZWRlMjE2NWE5YmUxZjRhMDEyMGMxNzYuLi4AAAPA7znO4OTpJcbCoGp54UQN2G/OrAtkZXNlcmlhbGl6ZQEAAQ/A7znO4OTpJcbCoGp54UQN2G/OrAlzZXJpYWxpemUBAAEP/aP6Q0bqUyolj8SX3a3bZDfJ/f8GdXBkYXRlAwAADwAA/aIHVwECeSYEIhZBLVEIMHBoE85YQZv2Z85B5j8YhEBBLVEIMEBB5j8YhEBBm/ZnzkBYQZv2Z85Bkl3oMUrYJAlKygAUKAM6QEGSXegxQFlBm/ZnzkGSXegxStgkCUrKABQoAzpAVwEANMlwaAuYJAUJIhBoStkoJAZFCSIGygAUsyQSDA1hZG1pbiBub3Qgc2V04GhB+CfsjCQRDAx1bmF1dGhvcml6ZWTgQErZKCQGRQkiBsoAFLNAQfgn7IxAVwEANIxwaAuYJAUJIhBoStkoJAZFCSIGygAUsyQUDA91cGRhdGVyIG5vdCBzZXTgaEH4J+yMJBEMDHVuYXV0aG9yaXplZOBAVwEBNVv///94C5gkBQkiEHhK2SgkBkUJIgbKABSzJBIMDWludmFsaWQgYWRtaW7gNfr+//9weFhBm/ZnzkHmPxiEeGgSwAwMQWRtaW5DaGFuZ2VkQZUBb2FAVwEBNQH///94C5gkBQkiEHhK2SgkBkUJIgbKABSzJBQMD2ludmFsaWQgdXBkYXRlcuA1u/7//3B4WUGb9mfOQeY/GIR4aBLADA5VcGRhdGVyQ2hhbmdlZEGVAW9hQFpBm/ZnzhLAQBLAQFtBm/ZnzhLAQFcBAFxBm/ZnzkGSXegxcGgLlyYFECINaErYJgZFECIE2yEiAkBK2CYGRRAiBNshQFcCAXg0t8FFU4tQQZJd6DFwaAuYJgQiIzS4cXhp2zA0qMFFU4tQQeY/GIRpEZ5cQZv2Z85B5j8YhEDBRVOLUEGSXegxQMFFU4tQQeY/GIRAQeY/GIRAVwIGeAuYJAUJIgZ4yhC3JBIMDXBhaXIgcmVxdWlyZWTgeRC4JBIMDWludmFsaWQgcm91bmTgehC4JBIMDWludmFsaWQgcHJpY2XgexC4JBYMEWludmFsaWQgdGltZXN0YW1w4H0QuCQXDBJpbnZhbGlkIHNvdXJjZSBzZXTgfAuXJgUIIgd8ygAgtiQeDBlhdHRlc3RhdGlvbiBoYXNoIHRvbyBsb25n4Hg1u/7//8FFU4tQQZJd6DFwaAuYJjR4NHpxeWkRzrckEAwLc3RhbGUgcm91bmTge2kTzrgkFAwPc3RhbGUgdGltZXN0YW1w4Hg1uP7//318StgmBUUMAHt6eXgWv3FpNwEAeDVZ/v//wUVTi1BB5j8YhH1pFM57enl4FsAMC0ZlZWRVcGRhdGVkQZUBb2FAykBXAQF4NSf+///BRVOLUEGSXegxcGgLlyYNEAwAEBAQeBa/IghoNwAAIgJAQEA3AABAwUVTi1BB5j8YhEA3AQBAVwEBeBC4JBIMDWludmFsaWQgaW5kZXjgeNswNdz9///BRVOLUEGSXegxcGgLlyYGDAAiA2giAkDBRVOLUEGSXegxQEBXAwA1uf3//0oCAAAAgAMAAACAAAAAALskAzpwaMNxEHIiPmo0mEppalHQRWpKnEoCAAAAgC4EIgpKAv///38yHgP/////AAAAAJFKAv///38yDAMAAAAAAQAAAJ9yRWpotSTBaSICQFcABjU8/P//fXx7enl4Ncz9//9AVwEGNc77//94C5gkBQkiBnjKELckEgwNcGFpciByZXF1aXJlZOB5ELgkEgwNaW52YWxpZCByb3VuZOB6ELgkEgwNaW52YWxpZCBwcmljZeB7ELgkFgwRaW52YWxpZCB0aW1lc3RhbXDgfRC4JBcMEmludmFsaWQgc291cmNlIHNldOB8C5cmBQgiB3zKACC2JB4MGWF0dGVzdGF0aW9uIGhhc2ggdG9vIGxvbmfgeDXB/P//fXxK2CYFRQwAe3p5eBa/cGg3AQB4NWL8///BRVOLUEHmPxiEfWgUznt6eXgWwAwLRmVlZFVwZGF0ZWRBlQFvYUBXAAZ9fHt6eXg17v7//0BXAQY1JPv//3gLmCQFCSIGeMoQtyQTDA5wYWlycyByZXF1aXJlZOB5C5gkBQkiB3nKeMqXJB0MGHJvdW5kSWRzIGxlbmd0aCBtaXNtYXRjaOB6C5gkBQkiB3rKeMqXJBsMFnByaWNlcyBsZW5ndGggbWlzbWF0Y2jgewuYJAUJIgd7ynjKlyQfDBp0aW1lc3RhbXBzIGxlbmd0aCBtaXNtYXRjaOB8C5gkBQkiB3zKeMqXJCYMIWF0dGVzdGF0aW9uSGFzaGVzIGxlbmd0aCBtaXNtYXRjaOB9C5gkBQkiB33KeMqXJCEMHHNvdXJjZVNldElkcyBsZW5ndGggbWlzbWF0Y2jgEHAiTH1oznxozntoznpoznloznhozjWm+///aEqcSgIAAACALgQiCkoC////fzIeA/////8AAAAAkUoC////fzIMAwAAAAABAAAAn3BFaHjKtSSyQFcABn18e3p5eDWc/v//QFcAAXg1jvz//yICQFcDADUH/f//cGjKxABxEHIiQ2hqzjVx/P//SmlqUdBFakqcSgIAAACALgQiCkoC////fzIeA/////8AAAAAkUoC////fzIMAwAAAAABAAAAn3JFamjKtSS7aSICQDSjIgJAVwACNfL4//8LeXg3AgBANwIAQFYFDAEB2zBgDAEC2zBhDAED2zBiDAEE2zBjDAEF2zBkQK2fdNU=").AsSerializable<Neo.SmartContract.NefFile>();

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
    [DisplayName("setAdmin")]
    public abstract void SetAdmin(UInt160? newAdmin);

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
    [DisplayName("updateResource")]
    public abstract void UpdateResource(string? resourceId, BigInteger? version, BigInteger? value, BigInteger? timestamp, byte[]? attestationHash, BigInteger? sourceSetId);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("updateResources")]
    public abstract void UpdateResources(IList<object>? resourceIds, IList<object>? versions, IList<object>? values, IList<object>? timestamps, IList<object>? attestationHashes, IList<object>? sourceSetIds);

    #endregion
}
