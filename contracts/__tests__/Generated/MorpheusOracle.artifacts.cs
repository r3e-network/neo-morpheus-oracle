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

    public static Neo.SmartContract.Manifest.ContractManifest Manifest => Neo.SmartContract.Manifest.ContractManifest.Parse(@"{""name"":""MorpheusOracle"",""groups"":[],""features"":{},""supportedstandards"":[],""abi"":{""methods"":[{""name"":""_deploy"",""parameters"":[{""name"":""data"",""type"":""Any""},{""name"":""update"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":0,""safe"":false},{""name"":""admin"",""parameters"":[],""returntype"":""Hash160"",""offset"":893,""safe"":true},{""name"":""updater"",""parameters"":[],""returntype"":""Hash160"",""offset"":918,""safe"":true},{""name"":""runtimeEncryptionAlgorithm"",""parameters"":[],""returntype"":""String"",""offset"":943,""safe"":true},{""name"":""runtimeEncryptionPublicKey"",""parameters"":[],""returntype"":""String"",""offset"":959,""safe"":true},{""name"":""runtimeEncryptionKeyVersion"",""parameters"":[],""returntype"":""Integer"",""offset"":974,""safe"":true},{""name"":""runtimeVerificationPublicKey"",""parameters"":[],""returntype"":""PublicKey"",""offset"":1012,""safe"":true},{""name"":""oracleEncryptionAlgorithm"",""parameters"":[],""returntype"":""String"",""offset"":1072,""safe"":true},{""name"":""oracleEncryptionPublicKey"",""parameters"":[],""returntype"":""String"",""offset"":1078,""safe"":true},{""name"":""oracleEncryptionKeyVersion"",""parameters"":[],""returntype"":""Integer"",""offset"":1081,""safe"":true},{""name"":""oracleVerificationPublicKey"",""parameters"":[],""returntype"":""PublicKey"",""offset"":1084,""safe"":true},{""name"":""systemRequestFee"",""parameters"":[],""returntype"":""Integer"",""offset"":1087,""safe"":true},{""name"":""requestFee"",""parameters"":[],""returntype"":""Integer"",""offset"":1128,""safe"":true},{""name"":""requestTTL"",""parameters"":[],""returntype"":""Integer"",""offset"":1131,""safe"":true},{""name"":""feeCreditOf"",""parameters"":[{""name"":""requester"",""type"":""Hash160""}],""returntype"":""Integer"",""offset"":1173,""safe"":true},{""name"":""accruedRequestFees"",""parameters"":[],""returntype"":""Integer"",""offset"":1280,""safe"":true},{""name"":""getMiniAppCount"",""parameters"":[],""returntype"":""Integer"",""offset"":1318,""safe"":true},{""name"":""getSystemModuleCount"",""parameters"":[],""returntype"":""Integer"",""offset"":798,""safe"":true},{""name"":""getMiniAppIdByIndex"",""parameters"":[{""name"":""index"",""type"":""Integer""}],""returntype"":""String"",""offset"":1356,""safe"":true},{""name"":""getSystemModuleIdByIndex"",""parameters"":[{""name"":""index"",""type"":""Integer""}],""returntype"":""String"",""offset"":1419,""safe"":true},{""name"":""getAllMiniAppIds"",""parameters"":[],""returntype"":""Array"",""offset"":1475,""safe"":true},{""name"":""getAllSystemModuleIds"",""parameters"":[],""returntype"":""Array"",""offset"":1582,""safe"":true},{""name"":""getMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Array"",""offset"":1689,""safe"":true},{""name"":""getSystemModule"",""parameters"":[{""name"":""moduleId"",""type"":""String""}],""returntype"":""Array"",""offset"":560,""safe"":true},{""name"":""isModuleGrantedToMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}],""returntype"":""Boolean"",""offset"":1784,""safe"":true},{""name"":""getMiniAppRequestCount"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Integer"",""offset"":1923,""safe"":true},{""name"":""getMiniAppFulfilledCount"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Integer"",""offset"":1996,""safe"":true},{""name"":""getTotalRequests"",""parameters"":[],""returntype"":""Integer"",""offset"":2069,""safe"":true},{""name"":""getTotalFulfilled"",""parameters"":[],""returntype"":""Integer"",""offset"":2107,""safe"":true},{""name"":""getRequest"",""parameters"":[{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Array"",""offset"":2145,""safe"":true},{""name"":""getInboxItem"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Array"",""offset"":2212,""safe"":true},{""name"":""getMiniAppState"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""}],""returntype"":""ByteArray"",""offset"":2323,""safe"":true},{""name"":""setAdmin"",""parameters"":[{""name"":""newAdmin"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":2474,""safe"":false},{""name"":""setUpdater"",""parameters"":[{""name"":""updater"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":2640,""safe"":false},{""name"":""setRuntimeEncryptionKey"",""parameters"":[{""name"":""algorithm"",""type"":""String""},{""name"":""publicKey"",""type"":""String""}],""returntype"":""Void"",""offset"":2731,""safe"":false},{""name"":""setOracleEncryptionKey"",""parameters"":[{""name"":""algorithm"",""type"":""String""},{""name"":""publicKey"",""type"":""String""}],""returntype"":""Void"",""offset"":2955,""safe"":false},{""name"":""setRuntimeVerificationPublicKey"",""parameters"":[{""name"":""publicKey"",""type"":""PublicKey""}],""returntype"":""Void"",""offset"":2966,""safe"":false},{""name"":""setOracleVerificationPublicKey"",""parameters"":[{""name"":""publicKey"",""type"":""PublicKey""}],""returntype"":""Void"",""offset"":3087,""safe"":false},{""name"":""setRequestFee"",""parameters"":[{""name"":""amount"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3094,""safe"":false},{""name"":""withdrawAccruedFees"",""parameters"":[{""name"":""to"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3176,""safe"":false},{""name"":""setRequestTTL"",""parameters"":[{""name"":""ttlMs"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3381,""safe"":false},{""name"":""expireStaleRequest"",""parameters"":[{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3465,""safe"":false},{""name"":""registerSystemModule"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""}],""returntype"":""Void"",""offset"":4006,""safe"":false},{""name"":""configureSystemModule"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""},{""name"":""active"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":4235,""safe"":false},{""name"":""registerMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""appAdmin"",""type"":""Hash160""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""metadataUri"",""type"":""String""},{""name"":""metadataHash"",""type"":""String""}],""returntype"":""Void"",""offset"":4329,""safe"":false},{""name"":""configureMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""metadataUri"",""type"":""String""},{""name"":""metadataHash"",""type"":""String""},{""name"":""active"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":5060,""safe"":false},{""name"":""grantModuleToMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}],""returntype"":""Void"",""offset"":5289,""safe"":false},{""name"":""revokeModuleFromMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}],""returntype"":""Void"",""offset"":5432,""safe"":false},{""name"":""putMiniAppState"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""},{""name"":""value"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":5544,""safe"":false},{""name"":""putMiniAppStateBatch"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKeys"",""type"":""Array""},{""name"":""values"",""type"":""Array""}],""returntype"":""Void"",""offset"":5811,""safe"":false},{""name"":""deleteMiniAppState"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":6083,""safe"":false},{""name"":""submitMiniAppRequest"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":6159,""safe"":false},{""name"":""submitMiniAppRequestFromIntegration"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":7001,""safe"":false},{""name"":""requestFromCallback"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""callbackMethod"",""type"":""String""}],""returntype"":""Integer"",""offset"":7173,""safe"":false},{""name"":""queueSystemRequest"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":7860,""safe"":false},{""name"":""queueAutomationRequest"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""callbackMethod"",""type"":""String""}],""returntype"":""Integer"",""offset"":7998,""safe"":false},{""name"":""request"",""parameters"":[{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""callbackMethod"",""type"":""String""}],""returntype"":""Integer"",""offset"":8144,""safe"":false},{""name"":""onNEP17Payment"",""parameters"":[{""name"":""from"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""},{""name"":""data"",""type"":""Any""}],""returntype"":""Void"",""offset"":8289,""safe"":false},{""name"":""fulfillRequest"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""success"",""type"":""Boolean""},{""name"":""result"",""type"":""ByteArray""},{""name"":""error"",""type"":""String""},{""name"":""verificationSignature"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":8892,""safe"":false},{""name"":""update"",""parameters"":[{""name"":""nefFile"",""type"":""ByteArray""},{""name"":""manifest"",""type"":""String""}],""returntype"":""Void"",""offset"":10131,""safe"":false},{""name"":""_initialize"",""parameters"":[],""returntype"":""Void"",""offset"":10150,""safe"":false}],""events"":[{""name"":""MiniAppRegistered"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""admin"",""type"":""Hash160""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""}]},{""name"":""MiniAppUpdated"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""admin"",""type"":""Hash160""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""active"",""type"":""Boolean""}]},{""name"":""SystemModuleRegistered"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""}]},{""name"":""SystemModuleUpdated"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""},{""name"":""active"",""type"":""Boolean""}]},{""name"":""MiniAppCapabilityGranted"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}]},{""name"":""MiniAppCapabilityRevoked"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}]},{""name"":""MiniAppRequestQueued"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""sponsor"",""type"":""Hash160""},{""name"":""payload"",""type"":""ByteArray""}]},{""name"":""MiniAppRequestCompleted"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""success"",""type"":""Boolean""},{""name"":""resultHash"",""type"":""ByteArray""},{""name"":""resultSize"",""type"":""Integer""},{""name"":""error"",""type"":""String""}]},{""name"":""MiniAppInboxStored"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requestId"",""type"":""Integer""},{""name"":""requester"",""type"":""Hash160""},{""name"":""success"",""type"":""Boolean""}]},{""name"":""MiniAppStateChanged"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""},{""name"":""valueSize"",""type"":""Integer""}]},{""name"":""AdminChanged"",""parameters"":[{""name"":""oldAdmin"",""type"":""Hash160""},{""name"":""newAdmin"",""type"":""Hash160""}]},{""name"":""UpdaterChanged"",""parameters"":[{""name"":""oldUpdater"",""type"":""Hash160""},{""name"":""newUpdater"",""type"":""Hash160""}]},{""name"":""RuntimeEncryptionKeyUpdated"",""parameters"":[{""name"":""version"",""type"":""Integer""},{""name"":""algorithm"",""type"":""String""},{""name"":""publicKey"",""type"":""String""}]},{""name"":""RuntimeVerifierUpdated"",""parameters"":[{""name"":""oldVerifier"",""type"":""PublicKey""},{""name"":""newVerifier"",""type"":""PublicKey""}]},{""name"":""RequestFeeUpdated"",""parameters"":[{""name"":""oldFee"",""type"":""Integer""},{""name"":""newFee"",""type"":""Integer""}]},{""name"":""RequestFeeDeposited"",""parameters"":[{""name"":""from"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""},{""name"":""creditBalance"",""type"":""Integer""}]},{""name"":""AccruedFeesWithdrawn"",""parameters"":[{""name"":""to"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""}]},{""name"":""RequestExpired"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""sponsor"",""type"":""Hash160""},{""name"":""refundAmount"",""type"":""Integer""}]},{""name"":""RequestTTLUpdated"",""parameters"":[{""name"":""oldTTL"",""type"":""Integer""},{""name"":""newTTL"",""type"":""Integer""}]}]},""permissions"":[{""contract"":""0x726cb6e0cd8628a1350a611384688911ab75f51b"",""methods"":[""sha256"",""verifyWithECDsa""]},{""contract"":""0xacce6fd80d44e1796aa0c2c625e9e4e0ce39efc0"",""methods"":[""deserialize"",""serialize""]},{""contract"":""0xd2a4cff31913016155e38e474a2c06d08be276cf"",""methods"":[""transfer""]},{""contract"":""0xfffdc93764dbaddd97c48f252a53ea4643faa3fd"",""methods"":[""update""]},{""contract"":""*"",""methods"":[""onMiniAppResult"",""onOracleResult""]}],""trusts"":[],""extra"":{""Author"":""Morpheus Oracle"",""Version"":""2.0.0"",""Description"":""MiniApp OS kernel with shared IO, registration, and callback orchestration"",""nef"":{""optimization"":""Basic""}}}");

    /// <summary>
    /// Optimization: "Basic"
    /// </summary>
    public static Neo.SmartContract.NefFile Nef => Convert.FromBase64String(@"TkVGM05lby5Db21waWxlci5DU2hhcnAgMy45LjErNWZhOTU2NmU1MTY1ZWRlMjE2NWE5YmUxZjRhMDEyMGMxNzYuLi4AAAbA7znO4OTpJcbCoGp54UQN2G/OrAtkZXNlcmlhbGl6ZQEAAQ/A7znO4OTpJcbCoGp54UQN2G/OrAlzZXJpYWxpemUBAAEPG/V1qxGJaIQTYQo1oSiGzeC2bHIGc2hhMjU2AQABD8924ovQBixKR47jVWEBExnzz6TSCHRyYW5zZmVyBAABDxv1dasRiWiEE2EKNaEohs3gtmxyD3ZlcmlmeVdpdGhFQ0RzYQQAAQ/9o/pDRupTKiWPxJfdrdtkN8n9/wZ1cGRhdGUDAAAPAAD9cChXAQJ5Jgcj0gEAAEEtUQgwcGgTzlhBm/ZnzkHmPxiEEFlBm/ZnzkHmPxiEAkBCDwBaQZv2Z85B5j8YhAwfbW9ycGhldXMubW9kdWxlLm9yYWNsZS5mZXRjaC52MQwTL29yYWNsZS9zbWFydC1mZXRjaAwMb3JhY2xlLmZldGNoNXIBAAAMHm1vcnBoZXVzLm1vZHVsZS5jb21wdXRlLnJ1bi52MQwQL2NvbXB1dGUvZXhlY3V0ZQwLY29tcHV0ZS5ydW41LgEAAAwcbW9ycGhldXMubW9kdWxlLmZlZWQucmVhZC52MQwML29yYWNsZS9mZWVkDAlmZWVkLnJlYWQ18gAAAAwfbW9ycGhldXMubW9kdWxlLmZlZWQucHVibGlzaC52MQwML29yYWNsZS9mZWVkDAxmZWVkLnB1Ymxpc2g1sAAAAAwibW9ycGhldXMubW9kdWxlLmlkZW50aXR5LnZlcmlmeS52MQwPL25lb2RpZC9yZXNvbHZlDA9pZGVudGl0eS52ZXJpZnk0ZQwhbW9ycGhldXMubW9kdWxlLmF1dG9tYXRpb24ucnVuLnYxDBMvYXV0b21hdGlvbi9leGVjdXRlDA5hdXRvbWF0aW9uLnJ1bjQbQEEtUQgwQEHmPxiEQEGb9mfOQEHmPxiEQFcAA3g0OxTOELcmBCIyQbfDiAMIenl4NbIAAAB6eXgTwAwWU3lzdGVtTW9kdWxlUmVnaXN0ZXJlZEGVAW9hQFcBAQwRaW52YWxpZCBtb2R1bGUgaWQAQHg0IXg0RsFFU4tQQZJd6DFwaAuXJgd4ND8iCGg3AAAiAkBX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").AsSerializable<Neo.SmartContract.NefFile>();

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
