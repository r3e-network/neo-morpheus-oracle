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

    public static Neo.SmartContract.Manifest.ContractManifest Manifest => Neo.SmartContract.Manifest.ContractManifest.Parse(@"{""name"":""MorpheusDataFeed"",""groups"":[],""features"":{},""supportedstandards"":[],""abi"":{""methods"":[{""name"":""_deploy"",""parameters"":[{""name"":""data"",""type"":""Any""},{""name"":""update"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":0,""safe"":false},{""name"":""admin"",""parameters"":[],""returntype"":""Hash160"",""offset"":47,""safe"":true},{""name"":""updater"",""parameters"":[],""returntype"":""Hash160"",""offset"":76,""safe"":true},{""name"":""oracleVerificationKey"",""parameters"":[],""returntype"":""PublicKey"",""offset"":99,""safe"":true},{""name"":""setAdmin"",""parameters"":[{""name"":""newAdmin"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":323,""safe"":false},{""name"":""setUpdater"",""parameters"":[{""name"":""updater"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":413,""safe"":false},{""name"":""setOracleVerificationKey"",""parameters"":[{""name"":""publicKey"",""type"":""PublicKey""}],""returntype"":""Void"",""offset"":507,""safe"":false},{""name"":""clearOracleVerificationKey"",""parameters"":[],""returntype"":""Void"",""offset"":635,""safe"":false},{""name"":""getPairCount"",""parameters"":[],""returntype"":""Integer"",""offset"":721,""safe"":true},{""name"":""getPairByIndex"",""parameters"":[{""name"":""index"",""type"":""Integer""}],""returntype"":""String"",""offset"":1473,""safe"":true},{""name"":""getAllPairs"",""parameters"":[],""returntype"":""Array"",""offset"":1541,""safe"":true},{""name"":""updateFeed"",""parameters"":[{""name"":""pair"",""type"":""String""},{""name"":""roundId"",""type"":""Integer""},{""name"":""price"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":1645,""safe"":false},{""name"":""updateFeedSigned"",""parameters"":[{""name"":""pair"",""type"":""String""},{""name"":""roundId"",""type"":""Integer""},{""name"":""price"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""},{""name"":""signature"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":1666,""safe"":false},{""name"":""adminResetFeed"",""parameters"":[{""name"":""pair"",""type"":""String""},{""name"":""roundId"",""type"":""Integer""},{""name"":""price"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":1687,""safe"":false},{""name"":""updateResource"",""parameters"":[{""name"":""resourceId"",""type"":""String""},{""name"":""version"",""type"":""Integer""},{""name"":""value"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":1932,""safe"":false},{""name"":""updateFeeds"",""parameters"":[{""name"":""pairs"",""type"":""Array""},{""name"":""roundIds"",""type"":""Array""},{""name"":""prices"",""type"":""Array""},{""name"":""timestamps"",""type"":""Array""},{""name"":""attestationHashes"",""type"":""Array""},{""name"":""sourceSetIds"",""type"":""Array""}],""returntype"":""Void"",""offset"":1947,""safe"":false},{""name"":""updateResources"",""parameters"":[{""name"":""resourceIds"",""type"":""Array""},{""name"":""versions"",""type"":""Array""},{""name"":""values"",""type"":""Array""},{""name"":""timestamps"",""type"":""Array""},{""name"":""attestationHashes"",""type"":""Array""},{""name"":""sourceSetIds"",""type"":""Array""}],""returntype"":""Void"",""offset"":2295,""safe"":false},{""name"":""getLatest"",""parameters"":[{""name"":""pair"",""type"":""String""}],""returntype"":""Array"",""offset"":1410,""safe"":true},{""name"":""getResource"",""parameters"":[{""name"":""resourceId"",""type"":""String""}],""returntype"":""Array"",""offset"":2310,""safe"":true},{""name"":""getAllFeedRecords"",""parameters"":[],""returntype"":""Array"",""offset"":2322,""safe"":true},{""name"":""getAllResources"",""parameters"":[],""returntype"":""Array"",""offset"":2415,""safe"":true},{""name"":""update"",""parameters"":[{""name"":""nefFile"",""type"":""ByteArray""},{""name"":""manifest"",""type"":""String""}],""returntype"":""Void"",""offset"":2420,""safe"":false},{""name"":""_initialize"",""parameters"":[],""returntype"":""Void"",""offset"":2439,""safe"":false}],""events"":[{""name"":""FeedUpdated"",""parameters"":[{""name"":""pair"",""type"":""String""},{""name"":""roundId"",""type"":""Integer""},{""name"":""price"",""type"":""Integer""},{""name"":""timestamp"",""type"":""Integer""},{""name"":""attestationHash"",""type"":""ByteArray""},{""name"":""sourceSetId"",""type"":""Integer""}]},{""name"":""AdminChanged"",""parameters"":[{""name"":""oldAdmin"",""type"":""Hash160""},{""name"":""newAdmin"",""type"":""Hash160""}]},{""name"":""UpdaterChanged"",""parameters"":[{""name"":""oldUpdater"",""type"":""Hash160""},{""name"":""newUpdater"",""type"":""Hash160""}]},{""name"":""VerificationKeyChanged"",""parameters"":[{""name"":""oldKey"",""type"":""PublicKey""},{""name"":""newKey"",""type"":""PublicKey""}]}]},""permissions"":[{""contract"":""0x726cb6e0cd8628a1350a611384688911ab75f51b"",""methods"":[""verifyWithECDsa""]},{""contract"":""0xacce6fd80d44e1796aa0c2c625e9e4e0ce39efc0"",""methods"":[""deserialize"",""itoa"",""memorySearch"",""serialize""]},{""contract"":""0xfffdc93764dbaddd97c48f252a53ea4643faa3fd"",""methods"":[""update""]}],""trusts"":[],""extra"":{""Author"":""Morpheus Oracle"",""Version"":""2.0.0"",""Description"":""Shared numeric resource registry for the Morpheus MiniApp OS"",""nef"":{""optimization"":""Basic""}}}");

    /// <summary>
    /// Optimization: "Basic"
    /// </summary>
    public static Neo.SmartContract.NefFile Nef => Convert.FromBase64String(@"TkVGM05lby5Db21waWxlci5DU2hhcnAgMy45LjErNWZhOTU2NmU1MTY1ZWRlMjE2NWE5YmUxZjRhMDEyMGMxNzYuLi4AAAbA7znO4OTpJcbCoGp54UQN2G/OrARpdG9hAgABD8DvOc7g5OklxsKgannhRA3Yb86sDG1lbW9yeVNlYXJjaAIAAQ8b9XWrEYlohBNhCjWhKIbN4LZscg92ZXJpZnlXaXRoRUNEc2EEAAEPwO85zuDk6SXGwqBqeeFEDdhvzqwLZGVzZXJpYWxpemUBAAEPwO85zuDk6SXGwqBqeeFEDdhvzqwJc2VyaWFsaXplAQABD/2j+kNG6lMqJY/El92t22Q3yf3/BnVwZGF0ZQMAAA8AAP2uCVcBAnkmBCIWQS1RCDBwaBPOWEGb9mfOQeY/GIRAQS1RCDBAQeY/GIRAQZv2Z85AWEGb9mfOQZJd6DFK2CQJSsoAFCgDOkBBkl3oMUBZQZv2Z85Bkl3oMUrYJAlKygAUKAM6QFcBAFpBm/ZnzkGSXegxcGgLlyYFCyISaNsw2yhK2CQJSsoAISgDOiICQNsoStgkCUrKACEoAzpA2zBAVwEANI5waAuYJAUJIhBoStkoJAZFCSIGygAUsyQSDA1hZG1pbiBub3Qgc2V04GhB+CfsjCQRDAx1bmF1dGhvcml6ZWTgQErZKCQGRQkiBsoAFLNAQfgn7IxAVwEANVH///9waAuYJAUJIhBoStkoJAZFCSIGygAUsyQUDA91cGRhdGVyIG5vdCBzZXTgaEH4J+yMJBEMDHVuYXV0aG9yaXplZOBAVwEBNVj///94C5gkBQkiEHhK2SgkBkUJIgbKABSzJBIMDWludmFsaWQgYWRtaW7gNbz+//9weFhBm/ZnzkHmPxiEeGgSwAwMQWRtaW5DaGFuZ2VkQZUBb2FAVwEBNf7+//94C5gkBQkiEHhK2SgkBkUJIgbKABSzJBQMD2ludmFsaWQgdXBkYXRlcuA1ff7//3B4WUGb9mfOQeY/GIR4aBLADA5VcGRhdGVyQ2hhbmdlZEGVAW9hQFcBATWg/v//eAuYJAUJIgx4StkoUMoAIbOrJB0MGGludmFsaWQgdmVyaWZpY2F0aW9uIGtleeA1Mf7//3B42zBaQZv2Z85B5j8YhHhoEsAMFlZlcmlmaWNhdGlvbktleUNoYW5nZWRBlQFvYUBK2ShQygAhs6tAQeY/GIRA2zBAVwEANSD+//814P3//3BaQZv2Z85BL1jF7QtoEsAMFlZlcmlmaWNhdGlvbktleUNoYW5nZWRBlQFvYUBBL1jF7UBbQZv2Z84SwEASwEBcQZv2Z84SwEBXAQBdQZv2Z85Bkl3oMXBoC5cmBRAiDWhK2CYGRRAiBNshIgJAStgmBkUQIgTbIUBXAgF4NLfBRVOLUEGSXegxcGgLmCYEIiM0uHF4adswNKjBRVOLUEHmPxiEaRGeXUGb9mfOQeY/GIRAwUVTi1BBkl3oMUDBRVOLUEHmPxiEQEHmPxiEQFcBBHgMAXyL2yhwaBp5NwAAi9soSnBFaAwBfIvbKEpwRWgaejcAAIvbKEpwRWgMAXyL2yhKcEVoGns3AACL2yhKcEVoIgJAi9soQEA3AABAVwIFNbn8//9waAuXJgcjgAAAAHwLmCQFCSIGfMoQtyQcDBdmZWVkIHNpZ25hdHVyZSByZXF1aXJlZOAMAXx4NwEAELUkHQwYcGFpciBtYXkgbm90IGNvbnRhaW4gJ3wn4Hl7eng1S////3EAF3xoaTcCACQbDBZpbnZhbGlkIGZlZWQgc2lnbmF0dXJl4EDKQDcBAEA3AgBAVwIHeAuYJAUJIgZ4yhC3JBIMDXBhaXIgcmVxdWlyZWTgeRC4JBIMDWludmFsaWQgcm91bmTgehC4JBIMDWludmFsaWQgcHJpY2XgexC4JBYMEWludmFsaWQgdGltZXN0YW1w4H0QuCQXDBJpbnZhbGlkIHNvdXJjZSBzZXTgfAuXJgUIIgd8ygAgtiQeDBlhdHRlc3RhdGlvbiBoYXNoIHRvbyBsb25n4H57enl4Nbn+//94Ncj9///BRVOLUEGSXegxcGgLmCY0eDR4cXlpEc63JBAMC3N0YWxlIHJvdW5k4HtpE864JBQMD3N0YWxlIHRpbWVzdGFtcOB4NcX9//99fErYJgVFDAB7enl4Fr9xaTcEAHg1Zv3//8FFU4tQQeY/GIR9aRTOe3p5eBbADAtGZWVkVXBkYXRlZEGVAW9hQFcBAXg1Nv3//8FFU4tQQZJd6DFwaAuXJg0QDAAQEBB4Fr8iCGg3AwAiAkBANwMAQMFFU4tQQeY/GIRANwQAQFcBAXgQuCQSDA1pbnZhbGlkIGluZGV44HjbMDXs/P//wUVTi1BBkl3oMXBoC5cmBgwAIgNoIgJAwUVTi1BBkl3oMUBAVwMANcn8//9KAgAAAIADAAAAgAAAAAC7JAM6cGjDcRByIj5qNJhKaWpR0EVqSpxKAgAAAIAuBCIKSgL///9/Mh4D/////wAAAACRSgL///9/MgwDAAAAAAEAAACfckVqaLUkwWkiAkBXAAY1iPr//wt9fHt6eXg1xP3//0BXAAc1c/r//359fHt6eXg1r/3//0BXAQY1BPr//3gLmCQFCSIGeMoQtyQSDA1wYWlyIHJlcXVpcmVk4HkQuCQSDA1pbnZhbGlkIHJvdW5k4HoQuCQSDA1pbnZhbGlkIHByaWNl4HsQuCQWDBFpbnZhbGlkIHRpbWVzdGFtcOB9ELgkFwwSaW52YWxpZCBzb3VyY2Ugc2V04HwLlyYFCCIHfMoAILYkHgwZYXR0ZXN0YXRpb24gaGFzaCB0b28gbG9uZ+B4Nbv7//99fErYJgVFDAB7enl4Fr9waDcEAHg1XPv//8FFU4tQQeY/GIR9aBTOe3p5eBbADAtGZWVkVXBkYXRlZEGVAW9hQFcABn18e3p5eDXY/v//QFcBBjVa+f//eAuYJAUJIgZ4yhC3JBMMDnBhaXJzIHJlcXVpcmVk4HkLmCQFCSIHecp4ypckHQwYcm91bmRJZHMgbGVuZ3RoIG1pc21hdGNo4HoLmCQFCSIHesp4ypckGwwWcHJpY2VzIGxlbmd0aCBtaXNtYXRjaOB7C5gkBQkiB3vKeMqXJB8MGnRpbWVzdGFtcHMgbGVuZ3RoIG1pc21hdGNo4HwLmCQFCSIHfMp4ypckJgwhYXR0ZXN0YXRpb25IYXNoZXMgbGVuZ3RoIG1pc21hdGNo4H0LmCQFCSIHfcp4ypckIQwcc291cmNlU2V0SWRzIGxlbmd0aCBtaXNtYXRjaOAQcCJNC31oznxozntoznpoznloznhozjWI+///aEqcSgIAAACALgQiCkoC////fzIeA/////8AAAAAkUoC////fzIMAwAAAAABAAAAn3BFaHjKtSSxQFcABn18e3p5eDWb/v//QFcAAXg1ePz//yICQFcDADXw/P//cGjKxABxEHIiQ2hqzjVb/P//SmlqUdBFakqcSgIAAACALgQiCkoC////fzIeA/////8AAAAAkUoC////fzIMAwAAAAABAAAAn3JFamjKtSS7aSICQDSjIgJAVwACNSf3//8LeXg3BQBANwUAQFYGDAEB2zBgDAEC2zBhDAED2zBjDAEE2zBkDAEF2zBlDAEG2zBiQPwxsIA=").AsSerializable<Neo.SmartContract.NefFile>();

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
