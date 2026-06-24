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

    public static Neo.SmartContract.Manifest.ContractManifest Manifest => Neo.SmartContract.Manifest.ContractManifest.Parse(@"{""name"":""MorpheusOracle"",""groups"":[],""features"":{},""supportedstandards"":[],""abi"":{""methods"":[{""name"":""_deploy"",""parameters"":[{""name"":""data"",""type"":""Any""},{""name"":""update"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":0,""safe"":false},{""name"":""admin"",""parameters"":[],""returntype"":""Hash160"",""offset"":893,""safe"":true},{""name"":""updater"",""parameters"":[],""returntype"":""Hash160"",""offset"":918,""safe"":true},{""name"":""runtimeEncryptionAlgorithm"",""parameters"":[],""returntype"":""String"",""offset"":943,""safe"":true},{""name"":""runtimeEncryptionPublicKey"",""parameters"":[],""returntype"":""String"",""offset"":959,""safe"":true},{""name"":""runtimeEncryptionKeyVersion"",""parameters"":[],""returntype"":""Integer"",""offset"":974,""safe"":true},{""name"":""runtimeVerificationPublicKey"",""parameters"":[],""returntype"":""PublicKey"",""offset"":1012,""safe"":true},{""name"":""oracleEncryptionAlgorithm"",""parameters"":[],""returntype"":""String"",""offset"":1072,""safe"":true},{""name"":""oracleEncryptionPublicKey"",""parameters"":[],""returntype"":""String"",""offset"":1078,""safe"":true},{""name"":""oracleEncryptionKeyVersion"",""parameters"":[],""returntype"":""Integer"",""offset"":1081,""safe"":true},{""name"":""oracleVerificationPublicKey"",""parameters"":[],""returntype"":""PublicKey"",""offset"":1084,""safe"":true},{""name"":""systemRequestFee"",""parameters"":[],""returntype"":""Integer"",""offset"":1087,""safe"":true},{""name"":""requestFee"",""parameters"":[],""returntype"":""Integer"",""offset"":1128,""safe"":true},{""name"":""requestTTL"",""parameters"":[],""returntype"":""Integer"",""offset"":1131,""safe"":true},{""name"":""feeCreditOf"",""parameters"":[{""name"":""requester"",""type"":""Hash160""}],""returntype"":""Integer"",""offset"":1173,""safe"":true},{""name"":""accruedRequestFees"",""parameters"":[],""returntype"":""Integer"",""offset"":1280,""safe"":true},{""name"":""reservedRequestFees"",""parameters"":[],""returntype"":""Integer"",""offset"":1318,""safe"":true},{""name"":""withdrawableFees"",""parameters"":[],""returntype"":""Integer"",""offset"":1356,""safe"":true},{""name"":""getMiniAppCount"",""parameters"":[],""returntype"":""Integer"",""offset"":1443,""safe"":true},{""name"":""getSystemModuleCount"",""parameters"":[],""returntype"":""Integer"",""offset"":798,""safe"":true},{""name"":""getMiniAppIdByIndex"",""parameters"":[{""name"":""index"",""type"":""Integer""}],""returntype"":""String"",""offset"":1481,""safe"":true},{""name"":""getSystemModuleIdByIndex"",""parameters"":[{""name"":""index"",""type"":""Integer""}],""returntype"":""String"",""offset"":1544,""safe"":true},{""name"":""getAllMiniAppIds"",""parameters"":[],""returntype"":""Array"",""offset"":1600,""safe"":true},{""name"":""getAllSystemModuleIds"",""parameters"":[],""returntype"":""Array"",""offset"":1707,""safe"":true},{""name"":""getMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Array"",""offset"":1814,""safe"":true},{""name"":""getSystemModule"",""parameters"":[{""name"":""moduleId"",""type"":""String""}],""returntype"":""Array"",""offset"":560,""safe"":true},{""name"":""isModuleGrantedToMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}],""returntype"":""Boolean"",""offset"":1909,""safe"":true},{""name"":""getMiniAppRequestCount"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Integer"",""offset"":2048,""safe"":true},{""name"":""getMiniAppFulfilledCount"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Integer"",""offset"":2121,""safe"":true},{""name"":""getTotalRequests"",""parameters"":[],""returntype"":""Integer"",""offset"":2194,""safe"":true},{""name"":""getTotalFulfilled"",""parameters"":[],""returntype"":""Integer"",""offset"":2232,""safe"":true},{""name"":""getRequest"",""parameters"":[{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Array"",""offset"":2270,""safe"":true},{""name"":""getInboxItem"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Array"",""offset"":2337,""safe"":true},{""name"":""getMiniAppState"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""}],""returntype"":""ByteArray"",""offset"":2448,""safe"":true},{""name"":""isSponsorshipGated"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Boolean"",""offset"":2599,""safe"":true},{""name"":""isSponsoredRequesterAllowed"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""}],""returntype"":""Boolean"",""offset"":2654,""safe"":true},{""name"":""getSponsoredRequesterCap"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""}],""returntype"":""Integer"",""offset"":2763,""safe"":true},{""name"":""getSponsoredRequesterSpent"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""}],""returntype"":""Integer"",""offset"":2867,""safe"":true},{""name"":""setAdmin"",""parameters"":[{""name"":""newAdmin"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":2974,""safe"":false},{""name"":""setUpdater"",""parameters"":[{""name"":""updater"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":3140,""safe"":false},{""name"":""setRuntimeEncryptionKey"",""parameters"":[{""name"":""algorithm"",""type"":""String""},{""name"":""publicKey"",""type"":""String""}],""returntype"":""Void"",""offset"":3231,""safe"":false},{""name"":""setOracleEncryptionKey"",""parameters"":[{""name"":""algorithm"",""type"":""String""},{""name"":""publicKey"",""type"":""String""}],""returntype"":""Void"",""offset"":3455,""safe"":false},{""name"":""setRuntimeVerificationPublicKey"",""parameters"":[{""name"":""publicKey"",""type"":""PublicKey""}],""returntype"":""Void"",""offset"":3466,""safe"":false},{""name"":""setOracleVerificationPublicKey"",""parameters"":[{""name"":""publicKey"",""type"":""PublicKey""}],""returntype"":""Void"",""offset"":3587,""safe"":false},{""name"":""setRequestFee"",""parameters"":[{""name"":""amount"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3594,""safe"":false},{""name"":""withdrawAccruedFees"",""parameters"":[{""name"":""to"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3676,""safe"":false},{""name"":""setRequestTTL"",""parameters"":[{""name"":""ttlMs"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3911,""safe"":false},{""name"":""expireStaleRequest"",""parameters"":[{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3995,""safe"":false},{""name"":""registerSystemModule"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""}],""returntype"":""Void"",""offset"":4636,""safe"":false},{""name"":""configureSystemModule"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""},{""name"":""active"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":4865,""safe"":false},{""name"":""registerMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""appAdmin"",""type"":""Hash160""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""metadataUri"",""type"":""String""},{""name"":""metadataHash"",""type"":""String""}],""returntype"":""Void"",""offset"":4959,""safe"":false},{""name"":""configureMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""metadataUri"",""type"":""String""},{""name"":""metadataHash"",""type"":""String""},{""name"":""active"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":6002,""safe"":false},{""name"":""setSponsoredRequesterAllowed"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""allowed"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":6231,""safe"":false},{""name"":""setSponsoredRequesterCap"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""cap"",""type"":""Integer""}],""returntype"":""Void"",""offset"":6407,""safe"":false},{""name"":""grantModuleToMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}],""returntype"":""Void"",""offset"":6581,""safe"":false},{""name"":""revokeModuleFromMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}],""returntype"":""Void"",""offset"":6727,""safe"":false},{""name"":""putMiniAppState"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""},{""name"":""value"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":6828,""safe"":false},{""name"":""putMiniAppStateBatch"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKeys"",""type"":""Array""},{""name"":""values"",""type"":""Array""}],""returntype"":""Void"",""offset"":7095,""safe"":false},{""name"":""deleteMiniAppState"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":7367,""safe"":false},{""name"":""submitMiniAppRequest"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":7443,""safe"":false},{""name"":""submitMiniAppRequestFromIntegration"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":8517,""safe"":false},{""name"":""requestFromCallback"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""callbackMethod"",""type"":""String""}],""returntype"":""Integer"",""offset"":8689,""safe"":false},{""name"":""queueSystemRequest"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":9324,""safe"":false},{""name"":""queueAutomationRequest"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""callbackMethod"",""type"":""String""}],""returntype"":""Integer"",""offset"":9462,""safe"":false},{""name"":""request"",""parameters"":[{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""callbackMethod"",""type"":""String""}],""returntype"":""Integer"",""offset"":9608,""safe"":false},{""name"":""onNEP17Payment"",""parameters"":[{""name"":""from"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""},{""name"":""data"",""type"":""Any""}],""returntype"":""Void"",""offset"":9753,""safe"":false},{""name"":""fulfillRequest"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""success"",""type"":""Boolean""},{""name"":""result"",""type"":""ByteArray""},{""name"":""error"",""type"":""String""},{""name"":""verificationSignature"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":10233,""safe"":false},{""name"":""update"",""parameters"":[{""name"":""nefFile"",""type"":""ByteArray""},{""name"":""manifest"",""type"":""String""}],""returntype"":""Void"",""offset"":11539,""safe"":false},{""name"":""rebuildIndexes"",""parameters"":[{""name"":""startIndex"",""type"":""Integer""},{""name"":""count"",""type"":""Integer""}],""returntype"":""Void"",""offset"":11558,""safe"":false},{""name"":""_initialize"",""parameters"":[],""returntype"":""Void"",""offset"":11757,""safe"":false}],""events"":[{""name"":""MiniAppRegistered"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""admin"",""type"":""Hash160""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""}]},{""name"":""MiniAppUpdated"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""admin"",""type"":""Hash160""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""active"",""type"":""Boolean""}]},{""name"":""SystemModuleRegistered"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""}]},{""name"":""SystemModuleUpdated"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""},{""name"":""active"",""type"":""Boolean""}]},{""name"":""MiniAppCapabilityGranted"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}]},{""name"":""MiniAppCapabilityRevoked"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}]},{""name"":""MiniAppRequestQueued"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""sponsor"",""type"":""Hash160""},{""name"":""payload"",""type"":""ByteArray""}]},{""name"":""MiniAppRequestCompleted"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""success"",""type"":""Boolean""},{""name"":""resultHash"",""type"":""ByteArray""},{""name"":""resultSize"",""type"":""Integer""},{""name"":""error"",""type"":""String""}]},{""name"":""MiniAppInboxStored"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requestId"",""type"":""Integer""},{""name"":""requester"",""type"":""Hash160""},{""name"":""success"",""type"":""Boolean""}]},{""name"":""MiniAppStateChanged"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""},{""name"":""valueSize"",""type"":""Integer""}]},{""name"":""AdminChanged"",""parameters"":[{""name"":""oldAdmin"",""type"":""Hash160""},{""name"":""newAdmin"",""type"":""Hash160""}]},{""name"":""UpdaterChanged"",""parameters"":[{""name"":""oldUpdater"",""type"":""Hash160""},{""name"":""newUpdater"",""type"":""Hash160""}]},{""name"":""RuntimeEncryptionKeyUpdated"",""parameters"":[{""name"":""version"",""type"":""Integer""},{""name"":""algorithm"",""type"":""String""},{""name"":""publicKey"",""type"":""String""}]},{""name"":""RuntimeVerifierUpdated"",""parameters"":[{""name"":""oldVerifier"",""type"":""PublicKey""},{""name"":""newVerifier"",""type"":""PublicKey""}]},{""name"":""RequestFeeUpdated"",""parameters"":[{""name"":""oldFee"",""type"":""Integer""},{""name"":""newFee"",""type"":""Integer""}]},{""name"":""RequestFeeDeposited"",""parameters"":[{""name"":""from"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""},{""name"":""creditBalance"",""type"":""Integer""}]},{""name"":""AccruedFeesWithdrawn"",""parameters"":[{""name"":""to"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""}]},{""name"":""RequestExpired"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""sponsor"",""type"":""Hash160""},{""name"":""refundAmount"",""type"":""Integer""}]},{""name"":""RequestTTLUpdated"",""parameters"":[{""name"":""oldTTL"",""type"":""Integer""},{""name"":""newTTL"",""type"":""Integer""}]},{""name"":""SponsoredRequesterAllowed"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""allowed"",""type"":""Boolean""}]},{""name"":""SponsoredRequesterCapUpdated"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""cap"",""type"":""Integer""}]}]},""permissions"":[{""contract"":""0x726cb6e0cd8628a1350a611384688911ab75f51b"",""methods"":[""sha256"",""verifyWithECDsa""]},{""contract"":""0xacce6fd80d44e1796aa0c2c625e9e4e0ce39efc0"",""methods"":[""deserialize"",""serialize""]},{""contract"":""0xd2a4cff31913016155e38e474a2c06d08be276cf"",""methods"":[""transfer""]},{""contract"":""0xfffdc93764dbaddd97c48f252a53ea4643faa3fd"",""methods"":[""update""]},{""contract"":""*"",""methods"":[""onMiniAppResult"",""onOracleResult""]}],""trusts"":[],""extra"":{""Author"":""Morpheus Oracle"",""Version"":""2.0.0"",""Description"":""MiniApp OS kernel with shared IO, registration, and callback orchestration"",""nef"":{""optimization"":""Basic""}}}");

    /// <summary>
    /// Optimization: "Basic"
    /// </summary>
    public static Neo.SmartContract.NefFile Nef => Convert.FromBase64String(@"TkVGM05lby5Db21waWxlci5DU2hhcnAgMy45LjErNWZhOTU2NmU1MTY1ZWRlMjE2NWE5YmUxZjRhMDEyMGMxNzYuLi4AAAbA7znO4OTpJcbCoGp54UQN2G/OrAtkZXNlcmlhbGl6ZQEAAQ/A7znO4OTpJcbCoGp54UQN2G/OrAlzZXJpYWxpemUBAAEPG/V1qxGJaIQTYQo1oSiGzeC2bHIGc2hhMjU2AQABD8924ovQBixKR47jVWEBExnzz6TSCHRyYW5zZmVyBAABDxv1dasRiWiEE2EKNaEohs3gtmxyD3ZlcmlmeVdpdGhFQ0RzYQQAAQ/9o/pDRupTKiWPxJfdrdtkN8n9/wZ1cGRhdGUDAAAPAAD96C5XAQJ5Jgcj0gEAAEEtUQgwcGgTzlhBm/ZnzkHmPxiEEFlBm/ZnzkHmPxiEAkBCDwBaQZv2Z85B5j8YhAwfbW9ycGhldXMubW9kdWxlLm9yYWNsZS5mZXRjaC52MQwTL29yYWNsZS9zbWFydC1mZXRjaAwMb3JhY2xlLmZldGNoNXIBAAAMHm1vcnBoZXVzLm1vZHVsZS5jb21wdXRlLnJ1bi52MQwQL2NvbXB1dGUvZXhlY3V0ZQwLY29tcHV0ZS5ydW41LgEAAAwcbW9ycGhldXMubW9kdWxlLmZlZWQucmVhZC52MQwML29yYWNsZS9mZWVkDAlmZWVkLnJlYWQ18gAAAAwfbW9ycGhldXMubW9kdWxlLmZlZWQucHVibGlzaC52MQwML29yYWNsZS9mZWVkDAxmZWVkLnB1Ymxpc2g1sAAAAAwibW9ycGhldXMubW9kdWxlLmlkZW50aXR5LnZlcmlmeS52MQwPL25lb2RpZC9yZXNvbHZlDA9pZGVudGl0eS52ZXJpZnk0ZQwhbW9ycGhldXMubW9kdWxlLmF1dG9tYXRpb24ucnVuLnYxDBMvYXV0b21hdGlvbi9leGVjdXRlDA5hdXRvbWF0aW9uLnJ1bjQbQEEtUQgwQEHmPxiEQEGb9mfOQEHmPxiEQFcAA3g0OxTOELcmBCIyQbfDiAMIenl4NbIAAAB6eXgTwAwWU3lzdGVtTW9kdWxlUmVnaXN0ZXJlZEGVAW9hQFcBAQwRaW52YWxpZCBtb2R1bGUgaWQAQHg0IXg0RsFFU4tQQZJd6DFwaAuXJgd4ND8iCGg3AAAiAkBX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").AsSerializable<Neo.SmartContract.NefFile>();

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

    public delegate void delSponsoredRequesterAllowed(string? appId, UInt160? requester, bool? allowed);

    [DisplayName("SponsoredRequesterAllowed")]
    public event delSponsoredRequesterAllowed? OnSponsoredRequesterAllowed;

    public delegate void delSponsoredRequesterCapUpdated(string? appId, UInt160? requester, BigInteger? cap);

    [DisplayName("SponsoredRequesterCapUpdated")]
    public event delSponsoredRequesterCapUpdated? OnSponsoredRequesterCapUpdated;

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
    [DisplayName("getSponsoredRequesterCap")]
    public abstract BigInteger? GetSponsoredRequesterCap(string? appId, UInt160? requester);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getSponsoredRequesterSpent")]
    public abstract BigInteger? GetSponsoredRequesterSpent(string? appId, UInt160? requester);

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

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("isSponsoredRequesterAllowed")]
    public abstract bool? IsSponsoredRequesterAllowed(string? appId, UInt160? requester);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("isSponsorshipGated")]
    public abstract bool? IsSponsorshipGated(string? appId);

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
    [DisplayName("setSponsoredRequesterAllowed")]
    public abstract void SetSponsoredRequesterAllowed(string? appId, UInt160? requester, bool? allowed);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setSponsoredRequesterCap")]
    public abstract void SetSponsoredRequesterCap(string? appId, UInt160? requester, BigInteger? cap);

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
