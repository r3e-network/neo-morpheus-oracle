using Neo.Cryptography.ECC;
using Neo.Extensions;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Numerics;

#pragma warning disable CS0067

namespace Neo.SmartContract.Testing;

public abstract class MorpheusOracle(Neo.SmartContract.Testing.SmartContractInitialize initialize) : Neo.SmartContract.Testing.SmartContract(initialize), IContractInfo
{
    #region Compiled data

    public static Neo.SmartContract.Manifest.ContractManifest Manifest => Neo.SmartContract.Manifest.ContractManifest.Parse(@"{""name"":""MorpheusOracle"",""groups"":[],""features"":{},""supportedstandards"":[],""abi"":{""methods"":[{""name"":""_deploy"",""parameters"":[{""name"":""data"",""type"":""Any""},{""name"":""update"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":0,""safe"":false},{""name"":""admin"",""parameters"":[],""returntype"":""Hash160"",""offset"":893,""safe"":true},{""name"":""updater"",""parameters"":[],""returntype"":""Hash160"",""offset"":918,""safe"":true},{""name"":""runtimeEncryptionAlgorithm"",""parameters"":[],""returntype"":""String"",""offset"":943,""safe"":true},{""name"":""runtimeEncryptionPublicKey"",""parameters"":[],""returntype"":""String"",""offset"":959,""safe"":true},{""name"":""runtimeEncryptionKeyVersion"",""parameters"":[],""returntype"":""Integer"",""offset"":974,""safe"":true},{""name"":""runtimeVerificationPublicKey"",""parameters"":[],""returntype"":""PublicKey"",""offset"":1012,""safe"":true},{""name"":""oracleEncryptionAlgorithm"",""parameters"":[],""returntype"":""String"",""offset"":1072,""safe"":true},{""name"":""oracleEncryptionPublicKey"",""parameters"":[],""returntype"":""String"",""offset"":1078,""safe"":true},{""name"":""oracleEncryptionKeyVersion"",""parameters"":[],""returntype"":""Integer"",""offset"":1081,""safe"":true},{""name"":""oracleVerificationPublicKey"",""parameters"":[],""returntype"":""PublicKey"",""offset"":1084,""safe"":true},{""name"":""systemRequestFee"",""parameters"":[],""returntype"":""Integer"",""offset"":1087,""safe"":true},{""name"":""requestFee"",""parameters"":[],""returntype"":""Integer"",""offset"":1128,""safe"":true},{""name"":""requestTTL"",""parameters"":[],""returntype"":""Integer"",""offset"":1131,""safe"":true},{""name"":""feeCreditOf"",""parameters"":[{""name"":""requester"",""type"":""Hash160""}],""returntype"":""Integer"",""offset"":1173,""safe"":true},{""name"":""accruedRequestFees"",""parameters"":[],""returntype"":""Integer"",""offset"":1280,""safe"":true},{""name"":""reservedRequestFees"",""parameters"":[],""returntype"":""Integer"",""offset"":1318,""safe"":true},{""name"":""withdrawableFees"",""parameters"":[],""returntype"":""Integer"",""offset"":1356,""safe"":true},{""name"":""getMiniAppCount"",""parameters"":[],""returntype"":""Integer"",""offset"":1443,""safe"":true},{""name"":""getSystemModuleCount"",""parameters"":[],""returntype"":""Integer"",""offset"":798,""safe"":true},{""name"":""getMiniAppIdByIndex"",""parameters"":[{""name"":""index"",""type"":""Integer""}],""returntype"":""String"",""offset"":1481,""safe"":true},{""name"":""getSystemModuleIdByIndex"",""parameters"":[{""name"":""index"",""type"":""Integer""}],""returntype"":""String"",""offset"":1544,""safe"":true},{""name"":""getAllMiniAppIds"",""parameters"":[],""returntype"":""Array"",""offset"":1600,""safe"":true},{""name"":""getAllSystemModuleIds"",""parameters"":[],""returntype"":""Array"",""offset"":1707,""safe"":true},{""name"":""getMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Array"",""offset"":1814,""safe"":true},{""name"":""getSystemModule"",""parameters"":[{""name"":""moduleId"",""type"":""String""}],""returntype"":""Array"",""offset"":560,""safe"":true},{""name"":""isModuleGrantedToMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}],""returntype"":""Boolean"",""offset"":1909,""safe"":true},{""name"":""getMiniAppRequestCount"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Integer"",""offset"":2048,""safe"":true},{""name"":""getMiniAppFulfilledCount"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Integer"",""offset"":2121,""safe"":true},{""name"":""getTotalRequests"",""parameters"":[],""returntype"":""Integer"",""offset"":2194,""safe"":true},{""name"":""getTotalFulfilled"",""parameters"":[],""returntype"":""Integer"",""offset"":2232,""safe"":true},{""name"":""getRequest"",""parameters"":[{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Array"",""offset"":2270,""safe"":true},{""name"":""getInboxItem"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Array"",""offset"":2337,""safe"":true},{""name"":""getMiniAppState"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""}],""returntype"":""ByteArray"",""offset"":2448,""safe"":true},{""name"":""setAdmin"",""parameters"":[{""name"":""newAdmin"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":2599,""safe"":false},{""name"":""setUpdater"",""parameters"":[{""name"":""updater"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":2765,""safe"":false},{""name"":""setRuntimeEncryptionKey"",""parameters"":[{""name"":""algorithm"",""type"":""String""},{""name"":""publicKey"",""type"":""String""}],""returntype"":""Void"",""offset"":2856,""safe"":false},{""name"":""setOracleEncryptionKey"",""parameters"":[{""name"":""algorithm"",""type"":""String""},{""name"":""publicKey"",""type"":""String""}],""returntype"":""Void"",""offset"":3080,""safe"":false},{""name"":""setRuntimeVerificationPublicKey"",""parameters"":[{""name"":""publicKey"",""type"":""PublicKey""}],""returntype"":""Void"",""offset"":3091,""safe"":false},{""name"":""setOracleVerificationPublicKey"",""parameters"":[{""name"":""publicKey"",""type"":""PublicKey""}],""returntype"":""Void"",""offset"":3212,""safe"":false},{""name"":""setRequestFee"",""parameters"":[{""name"":""amount"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3219,""safe"":false},{""name"":""withdrawAccruedFees"",""parameters"":[{""name"":""to"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3301,""safe"":false},{""name"":""setRequestTTL"",""parameters"":[{""name"":""ttlMs"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3536,""safe"":false},{""name"":""expireStaleRequest"",""parameters"":[{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3620,""safe"":false},{""name"":""registerSystemModule"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""}],""returntype"":""Void"",""offset"":4169,""safe"":false},{""name"":""configureSystemModule"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""},{""name"":""active"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":4398,""safe"":false},{""name"":""registerMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""appAdmin"",""type"":""Hash160""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""metadataUri"",""type"":""String""},{""name"":""metadataHash"",""type"":""String""}],""returntype"":""Void"",""offset"":4492,""safe"":false},{""name"":""configureMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""metadataUri"",""type"":""String""},{""name"":""metadataHash"",""type"":""String""},{""name"":""active"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":5535,""safe"":false},{""name"":""grantModuleToMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}],""returntype"":""Void"",""offset"":5764,""safe"":false},{""name"":""revokeModuleFromMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}],""returntype"":""Void"",""offset"":5907,""safe"":false},{""name"":""putMiniAppState"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""},{""name"":""value"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":6008,""safe"":false},{""name"":""putMiniAppStateBatch"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKeys"",""type"":""Array""},{""name"":""values"",""type"":""Array""}],""returntype"":""Void"",""offset"":6275,""safe"":false},{""name"":""deleteMiniAppState"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":6547,""safe"":false},{""name"":""submitMiniAppRequest"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":6623,""safe"":false},{""name"":""submitMiniAppRequestFromIntegration"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":7471,""safe"":false},{""name"":""requestFromCallback"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""callbackMethod"",""type"":""String""}],""returntype"":""Integer"",""offset"":7643,""safe"":false},{""name"":""queueSystemRequest"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":8278,""safe"":false},{""name"":""queueAutomationRequest"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""callbackMethod"",""type"":""String""}],""returntype"":""Integer"",""offset"":8416,""safe"":false},{""name"":""request"",""parameters"":[{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""callbackMethod"",""type"":""String""}],""returntype"":""Integer"",""offset"":8562,""safe"":false},{""name"":""onNEP17Payment"",""parameters"":[{""name"":""from"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""},{""name"":""data"",""type"":""Any""}],""returntype"":""Void"",""offset"":8707,""safe"":false},{""name"":""fulfillRequest"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""success"",""type"":""Boolean""},{""name"":""result"",""type"":""ByteArray""},{""name"":""error"",""type"":""String""},{""name"":""verificationSignature"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":9187,""safe"":false},{""name"":""update"",""parameters"":[{""name"":""nefFile"",""type"":""ByteArray""},{""name"":""manifest"",""type"":""String""}],""returntype"":""Void"",""offset"":10434,""safe"":false},{""name"":""rebuildIndexes"",""parameters"":[{""name"":""startIndex"",""type"":""Integer""},{""name"":""count"",""type"":""Integer""}],""returntype"":""Void"",""offset"":10453,""safe"":false},{""name"":""_initialize"",""parameters"":[],""returntype"":""Void"",""offset"":10652,""safe"":false}],""events"":[{""name"":""MiniAppRegistered"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""admin"",""type"":""Hash160""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""}]},{""name"":""MiniAppUpdated"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""admin"",""type"":""Hash160""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""active"",""type"":""Boolean""}]},{""name"":""SystemModuleRegistered"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""}]},{""name"":""SystemModuleUpdated"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""},{""name"":""active"",""type"":""Boolean""}]},{""name"":""MiniAppCapabilityGranted"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}]},{""name"":""MiniAppCapabilityRevoked"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}]},{""name"":""MiniAppRequestQueued"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""sponsor"",""type"":""Hash160""},{""name"":""payload"",""type"":""ByteArray""}]},{""name"":""MiniAppRequestCompleted"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""success"",""type"":""Boolean""},{""name"":""resultHash"",""type"":""ByteArray""},{""name"":""resultSize"",""type"":""Integer""},{""name"":""error"",""type"":""String""}]},{""name"":""MiniAppInboxStored"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requestId"",""type"":""Integer""},{""name"":""requester"",""type"":""Hash160""},{""name"":""success"",""type"":""Boolean""}]},{""name"":""MiniAppStateChanged"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""},{""name"":""valueSize"",""type"":""Integer""}]},{""name"":""AdminChanged"",""parameters"":[{""name"":""oldAdmin"",""type"":""Hash160""},{""name"":""newAdmin"",""type"":""Hash160""}]},{""name"":""UpdaterChanged"",""parameters"":[{""name"":""oldUpdater"",""type"":""Hash160""},{""name"":""newUpdater"",""type"":""Hash160""}]},{""name"":""RuntimeEncryptionKeyUpdated"",""parameters"":[{""name"":""version"",""type"":""Integer""},{""name"":""algorithm"",""type"":""String""},{""name"":""publicKey"",""type"":""String""}]},{""name"":""RuntimeVerifierUpdated"",""parameters"":[{""name"":""oldVerifier"",""type"":""PublicKey""},{""name"":""newVerifier"",""type"":""PublicKey""}]},{""name"":""RequestFeeUpdated"",""parameters"":[{""name"":""oldFee"",""type"":""Integer""},{""name"":""newFee"",""type"":""Integer""}]},{""name"":""RequestFeeDeposited"",""parameters"":[{""name"":""from"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""},{""name"":""creditBalance"",""type"":""Integer""}]},{""name"":""AccruedFeesWithdrawn"",""parameters"":[{""name"":""to"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""}]},{""name"":""RequestExpired"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""sponsor"",""type"":""Hash160""},{""name"":""refundAmount"",""type"":""Integer""}]},{""name"":""RequestTTLUpdated"",""parameters"":[{""name"":""oldTTL"",""type"":""Integer""},{""name"":""newTTL"",""type"":""Integer""}]}]},""permissions"":[{""contract"":""0x726cb6e0cd8628a1350a611384688911ab75f51b"",""methods"":[""sha256"",""verifyWithECDsa""]},{""contract"":""0xacce6fd80d44e1796aa0c2c625e9e4e0ce39efc0"",""methods"":[""deserialize"",""serialize""]},{""contract"":""0xd2a4cff31913016155e38e474a2c06d08be276cf"",""methods"":[""transfer""]},{""contract"":""0xfffdc93764dbaddd97c48f252a53ea4643faa3fd"",""methods"":[""update""]},{""contract"":""*"",""methods"":[""onMiniAppResult"",""onOracleResult""]}],""trusts"":[],""extra"":{""Author"":""Morpheus Oracle"",""Version"":""2.0.0"",""Description"":""MiniApp OS kernel with shared IO, registration, and callback orchestration"",""nef"":{""optimization"":""Basic""}}}");

    /// <summary>
    /// Optimization: "Basic"
    /// </summary>
    public static Neo.SmartContract.NefFile Nef => Convert.FromBase64String(@"TkVGM05lby5Db21waWxlci5DU2hhcnAgMy45LjErNWZhOTU2NmU1MTY1ZWRlMjE2NWE5YmUxZjRhMDEyMGMxNzYuLi4AAAbA7znO4OTpJcbCoGp54UQN2G/OrAtkZXNlcmlhbGl6ZQEAAQ/A7znO4OTpJcbCoGp54UQN2G/OrAlzZXJpYWxpemUBAAEPG/V1qxGJaIQTYQo1oSiGzeC2bHIGc2hhMjU2AQABD8924ovQBixKR47jVWEBExnzz6TSCHRyYW5zZmVyBAABDxv1dasRiWiEE2EKNaEohs3gtmxyD3ZlcmlmeVdpdGhFQ0RzYQQAAQ/9o/pDRupTKiWPxJfdrdtkN8n9/wZ1cGRhdGUDAAAPAAD9eypXAQJ5Jgcj0gEAAEEtUQgwcGgTzlhBm/ZnzkHmPxiEEFlBm/ZnzkHmPxiEAkBCDwBaQZv2Z85B5j8YhAwfbW9ycGhldXMubW9kdWxlLm9yYWNsZS5mZXRjaC52MQwTL29yYWNsZS9zbWFydC1mZXRjaAwMb3JhY2xlLmZldGNoNXIBAAAMHm1vcnBoZXVzLm1vZHVsZS5jb21wdXRlLnJ1bi52MQwQL2NvbXB1dGUvZXhlY3V0ZQwLY29tcHV0ZS5ydW41LgEAAAwcbW9ycGhldXMubW9kdWxlLmZlZWQucmVhZC52MQwML29yYWNsZS9mZWVkDAlmZWVkLnJlYWQ18gAAAAwfbW9ycGhldXMubW9kdWxlLmZlZWQucHVibGlzaC52MQwML29yYWNsZS9mZWVkDAxmZWVkLnB1Ymxpc2g1sAAAAAwibW9ycGhldXMubW9kdWxlLmlkZW50aXR5LnZlcmlmeS52MQwPL25lb2RpZC9yZXNvbHZlDA9pZGVudGl0eS52ZXJpZnk0ZQwhbW9ycGhldXMubW9kdWxlLmF1dG9tYXRpb24ucnVuLnYxDBMvYXV0b21hdGlvbi9leGVjdXRlDA5hdXRvbWF0aW9uLnJ1bjQbQEEtUQgwQEHmPxiEQEGb9mfOQEHmPxiEQFcAA3g0OxTOELcmBCIyQbfDiAMIenl4NbIAAAB6eXgTwAwWU3lzdGVtTW9kdWxlUmVnaXN0ZXJlZEGVAW9hQFcBAQwRaW52YWxpZCBtb2R1bGUgaWQAQHg0IXg0RsFFU4tQQZJd6DFwaAuXJgd4ND8iCGg3AAAiAkBX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").AsSerializable<Neo.SmartContract.NefFile>();

    #endregion

    #region Events

    public delegate void delAccruedFeesWithdrawn(UInt160? to, BigInteger? amount);

    [DisplayName("AccruedFeesWithdrawn")]
    public event delAccruedFeesWithdrawn? OnAccruedFeesWithdrawn;

    public delegate void delAdminChanged(UInt160? oldAdmin, UInt160? newAdmin);

    [DisplayName("AdminChanged")]
    public event delAdminChanged? OnAdminChanged;

    public delegate void delMiniAppCapabilityGranted(string? appId, string? moduleId);

    [DisplayName("MiniAppCapabilityGranted")]
    public event delMiniAppCapabilityGranted? OnMiniAppCapabilityGranted;

    public delegate void delMiniAppCapabilityRevoked(string? appId, string? moduleId);

    [DisplayName("MiniAppCapabilityRevoked")]
    public event delMiniAppCapabilityRevoked? OnMiniAppCapabilityRevoked;

    public delegate void delMiniAppInboxStored(string? appId, BigInteger? requestId, UInt160? requester, bool? success);

    [DisplayName("MiniAppInboxStored")]
    public event delMiniAppInboxStored? OnMiniAppInboxStored;

    public delegate void delMiniAppRegistered(string? appId, UInt160? admin, UInt160? feePayer, UInt160? callbackContract);

    [DisplayName("MiniAppRegistered")]
    public event delMiniAppRegistered? OnMiniAppRegistered;

    public delegate void delMiniAppRequestCompleted(BigInteger? requestId, string? appId, string? moduleId, string? operation, bool? success, byte[]? resultHash, BigInteger? resultSize, string? error);

    [DisplayName("MiniAppRequestCompleted")]
    public event delMiniAppRequestCompleted? OnMiniAppRequestCompleted;

    public delegate void delMiniAppRequestQueued(BigInteger? requestId, string? appId, string? moduleId, string? operation, UInt160? requester, UInt160? sponsor, byte[]? payload);

    [DisplayName("MiniAppRequestQueued")]
    public event delMiniAppRequestQueued? OnMiniAppRequestQueued;

    public delegate void delMiniAppStateChanged(string? appId, byte[]? stateKey, BigInteger? valueSize);

    [DisplayName("MiniAppStateChanged")]
    public event delMiniAppStateChanged? OnMiniAppStateChanged;

    public delegate void delMiniAppUpdated(string? appId, UInt160? admin, UInt160? feePayer, UInt160? callbackContract, bool? active);

    [DisplayName("MiniAppUpdated")]
    public event delMiniAppUpdated? OnMiniAppUpdated;

    public delegate void delRequestExpired(BigInteger? requestId, string? appId, UInt160? requester, UInt160? sponsor, BigInteger? refundAmount);

    [DisplayName("RequestExpired")]
    public event delRequestExpired? OnRequestExpired;

    public delegate void delRequestFeeDeposited(UInt160? from, BigInteger? amount, BigInteger? creditBalance);

    [DisplayName("RequestFeeDeposited")]
    public event delRequestFeeDeposited? OnRequestFeeDeposited;

    public delegate void delRequestFeeUpdated(BigInteger? oldFee, BigInteger? newFee);

    [DisplayName("RequestFeeUpdated")]
    public event delRequestFeeUpdated? OnRequestFeeUpdated;

    public delegate void delRequestTTLUpdated(BigInteger? oldTTL, BigInteger? newTTL);

    [DisplayName("RequestTTLUpdated")]
    public event delRequestTTLUpdated? OnRequestTTLUpdated;

    public delegate void delRuntimeEncryptionKeyUpdated(BigInteger? version, string? algorithm, string? publicKey);

    [DisplayName("RuntimeEncryptionKeyUpdated")]
    public event delRuntimeEncryptionKeyUpdated? OnRuntimeEncryptionKeyUpdated;

    public delegate void delRuntimeVerifierUpdated(ECPoint? oldVerifier, ECPoint? newVerifier);

    [DisplayName("RuntimeVerifierUpdated")]
    public event delRuntimeVerifierUpdated? OnRuntimeVerifierUpdated;

    public delegate void delSystemModuleRegistered(string? moduleId, string? endpoint, string? schemaHash);

    [DisplayName("SystemModuleRegistered")]
    public event delSystemModuleRegistered? OnSystemModuleRegistered;

    public delegate void delSystemModuleUpdated(string? moduleId, string? endpoint, string? schemaHash, bool? active);

    [DisplayName("SystemModuleUpdated")]
    public event delSystemModuleUpdated? OnSystemModuleUpdated;

    public delegate void delUpdaterChanged(UInt160? oldUpdater, UInt160? newUpdater);

    [DisplayName("UpdaterChanged")]
    public event delUpdaterChanged? OnUpdaterChanged;

    #endregion

    #region Properties

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? AccruedRequestFees { [DisplayName("accruedRequestFees")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract UInt160? Admin { [DisplayName("admin")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract IList<object>? AllMiniAppIds { [DisplayName("getAllMiniAppIds")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract IList<object>? AllSystemModuleIds { [DisplayName("getAllSystemModuleIds")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? MiniAppCount { [DisplayName("getMiniAppCount")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? SystemModuleCount { [DisplayName("getSystemModuleCount")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? TotalFulfilled { [DisplayName("getTotalFulfilled")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? TotalRequests { [DisplayName("getTotalRequests")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract string? OracleEncryptionAlgorithm { [DisplayName("oracleEncryptionAlgorithm")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? OracleEncryptionKeyVersion { [DisplayName("oracleEncryptionKeyVersion")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract string? OracleEncryptionPublicKey { [DisplayName("oracleEncryptionPublicKey")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract ECPoint? OracleVerificationPublicKey { [DisplayName("oracleVerificationPublicKey")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? RequestFee { [DisplayName("requestFee")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? RequestTTL { [DisplayName("requestTTL")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? ReservedRequestFees { [DisplayName("reservedRequestFees")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract string? RuntimeEncryptionAlgorithm { [DisplayName("runtimeEncryptionAlgorithm")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? RuntimeEncryptionKeyVersion { [DisplayName("runtimeEncryptionKeyVersion")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract string? RuntimeEncryptionPublicKey { [DisplayName("runtimeEncryptionPublicKey")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract ECPoint? RuntimeVerificationPublicKey { [DisplayName("runtimeVerificationPublicKey")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? SystemRequestFee { [DisplayName("systemRequestFee")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract UInt160? Updater { [DisplayName("updater")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract BigInteger? WithdrawableFees { [DisplayName("withdrawableFees")] get; }

    #endregion

    #region Safe methods

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("feeCreditOf")]
    public abstract BigInteger? FeeCreditOf(UInt160? requester);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getInboxItem")]
    public abstract IList<object>? GetInboxItem(string? appId, BigInteger? requestId);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getMiniApp")]
    public abstract IList<object>? GetMiniApp(string? appId);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getMiniAppFulfilledCount")]
    public abstract BigInteger? GetMiniAppFulfilledCount(string? appId);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getMiniAppIdByIndex")]
    public abstract string? GetMiniAppIdByIndex(BigInteger? index);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getMiniAppRequestCount")]
    public abstract BigInteger? GetMiniAppRequestCount(string? appId);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getMiniAppState")]
    public abstract byte[]? GetMiniAppState(string? appId, byte[]? stateKey);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getRequest")]
    public abstract IList<object>? GetRequest(BigInteger? requestId);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getSystemModule")]
    public abstract IList<object>? GetSystemModule(string? moduleId);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getSystemModuleIdByIndex")]
    public abstract string? GetSystemModuleIdByIndex(BigInteger? index);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("isModuleGrantedToMiniApp")]
    public abstract bool? IsModuleGrantedToMiniApp(string? appId, string? moduleId);

    #endregion

    #region Unsafe methods

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("configureMiniApp")]
    public abstract void ConfigureMiniApp(string? appId, UInt160? feePayer, UInt160? callbackContract, string? metadataUri, string? metadataHash, bool? active);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("configureSystemModule")]
    public abstract void ConfigureSystemModule(string? moduleId, string? endpoint, string? schemaHash, bool? active);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("deleteMiniAppState")]
    public abstract void DeleteMiniAppState(string? appId, byte[]? stateKey);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("expireStaleRequest")]
    public abstract void ExpireStaleRequest(BigInteger? requestId);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("fulfillRequest")]
    public abstract void FulfillRequest(BigInteger? requestId, bool? success, byte[]? result, string? error, byte[]? verificationSignature);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("grantModuleToMiniApp")]
    public abstract void GrantModuleToMiniApp(string? appId, string? moduleId);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("onNEP17Payment")]
    public abstract void OnNEP17Payment(UInt160? from, BigInteger? amount, object? data = null);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("putMiniAppState")]
    public abstract void PutMiniAppState(string? appId, byte[]? stateKey, byte[]? value);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("putMiniAppStateBatch")]
    public abstract void PutMiniAppStateBatch(string? appId, IList<object>? stateKeys, IList<object>? values);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("queueAutomationRequest")]
    public abstract BigInteger? QueueAutomationRequest(UInt160? requester, string? requestType, byte[]? payload, UInt160? callbackContract, string? callbackMethod);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("queueSystemRequest")]
    public abstract BigInteger? QueueSystemRequest(UInt160? requester, string? appId, string? moduleId, string? operation, byte[]? payload);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("rebuildIndexes")]
    public abstract void RebuildIndexes(BigInteger? startIndex, BigInteger? count);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("registerMiniApp")]
    public abstract void RegisterMiniApp(string? appId, UInt160? appAdmin, UInt160? feePayer, UInt160? callbackContract, string? metadataUri, string? metadataHash);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("registerSystemModule")]
    public abstract void RegisterSystemModule(string? moduleId, string? endpoint, string? schemaHash);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("request")]
    public abstract BigInteger? Request(string? requestType, byte[]? payload, UInt160? callbackContract, string? callbackMethod);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("requestFromCallback")]
    public abstract BigInteger? RequestFromCallback(UInt160? requester, string? requestType, byte[]? payload, UInt160? callbackContract, string? callbackMethod);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("revokeModuleFromMiniApp")]
    public abstract void RevokeModuleFromMiniApp(string? appId, string? moduleId);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setAdmin")]
    public abstract void SetAdmin(UInt160? newAdmin);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setOracleEncryptionKey")]
    public abstract void SetOracleEncryptionKey(string? algorithm, string? publicKey);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setOracleVerificationPublicKey")]
    public abstract void SetOracleVerificationPublicKey(ECPoint? publicKey);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setRequestFee")]
    public abstract void SetRequestFee(BigInteger? amount);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setRequestTTL")]
    public abstract void SetRequestTTL(BigInteger? ttlMs);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setRuntimeEncryptionKey")]
    public abstract void SetRuntimeEncryptionKey(string? algorithm, string? publicKey);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setRuntimeVerificationPublicKey")]
    public abstract void SetRuntimeVerificationPublicKey(ECPoint? publicKey);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setUpdater")]
    public abstract void SetUpdater(UInt160? updater);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("submitMiniAppRequest")]
    public abstract BigInteger? SubmitMiniAppRequest(string? appId, string? moduleId, string? operation, byte[]? payload);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("submitMiniAppRequestFromIntegration")]
    public abstract BigInteger? SubmitMiniAppRequestFromIntegration(UInt160? requester, string? appId, string? moduleId, string? operation, byte[]? payload);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("update")]
    public abstract void Update(byte[]? nefFile, string? manifest);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("withdrawAccruedFees")]
    public abstract void WithdrawAccruedFees(UInt160? to, BigInteger? amount);

    #endregion
}
