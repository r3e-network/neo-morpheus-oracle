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

    public static Neo.SmartContract.Manifest.ContractManifest Manifest => Neo.SmartContract.Manifest.ContractManifest.Parse(@"{""name"":""MorpheusOracle"",""groups"":[],""features"":{},""supportedstandards"":[],""abi"":{""methods"":[{""name"":""_deploy"",""parameters"":[{""name"":""data"",""type"":""Any""},{""name"":""update"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":0,""safe"":false},{""name"":""admin"",""parameters"":[],""returntype"":""Hash160"",""offset"":891,""safe"":true},{""name"":""updater"",""parameters"":[],""returntype"":""Hash160"",""offset"":916,""safe"":true},{""name"":""runtimeEncryptionAlgorithm"",""parameters"":[],""returntype"":""String"",""offset"":941,""safe"":true},{""name"":""runtimeEncryptionPublicKey"",""parameters"":[],""returntype"":""String"",""offset"":957,""safe"":true},{""name"":""runtimeEncryptionKeyVersion"",""parameters"":[],""returntype"":""Integer"",""offset"":972,""safe"":true},{""name"":""runtimeVerificationPublicKey"",""parameters"":[],""returntype"":""PublicKey"",""offset"":1010,""safe"":true},{""name"":""oracleEncryptionAlgorithm"",""parameters"":[],""returntype"":""String"",""offset"":1070,""safe"":true},{""name"":""oracleEncryptionPublicKey"",""parameters"":[],""returntype"":""String"",""offset"":1076,""safe"":true},{""name"":""oracleEncryptionKeyVersion"",""parameters"":[],""returntype"":""Integer"",""offset"":1079,""safe"":true},{""name"":""oracleVerificationPublicKey"",""parameters"":[],""returntype"":""PublicKey"",""offset"":1082,""safe"":true},{""name"":""systemRequestFee"",""parameters"":[],""returntype"":""Integer"",""offset"":1085,""safe"":true},{""name"":""requestFee"",""parameters"":[],""returntype"":""Integer"",""offset"":1126,""safe"":true},{""name"":""requestTTL"",""parameters"":[],""returntype"":""Integer"",""offset"":1129,""safe"":true},{""name"":""feeCreditOf"",""parameters"":[{""name"":""requester"",""type"":""Hash160""}],""returntype"":""Integer"",""offset"":1171,""safe"":true},{""name"":""accruedRequestFees"",""parameters"":[],""returntype"":""Integer"",""offset"":1278,""safe"":true},{""name"":""reservedRequestFees"",""parameters"":[],""returntype"":""Integer"",""offset"":1316,""safe"":true},{""name"":""withdrawableFees"",""parameters"":[],""returntype"":""Integer"",""offset"":1354,""safe"":true},{""name"":""getMiniAppCount"",""parameters"":[],""returntype"":""Integer"",""offset"":1441,""safe"":true},{""name"":""getSystemModuleCount"",""parameters"":[],""returntype"":""Integer"",""offset"":796,""safe"":true},{""name"":""getMiniAppIdByIndex"",""parameters"":[{""name"":""index"",""type"":""Integer""}],""returntype"":""String"",""offset"":1479,""safe"":true},{""name"":""getSystemModuleIdByIndex"",""parameters"":[{""name"":""index"",""type"":""Integer""}],""returntype"":""String"",""offset"":1542,""safe"":true},{""name"":""getAllMiniAppIds"",""parameters"":[],""returntype"":""Array"",""offset"":1598,""safe"":true},{""name"":""getAllSystemModuleIds"",""parameters"":[],""returntype"":""Array"",""offset"":1705,""safe"":true},{""name"":""getMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Array"",""offset"":1812,""safe"":true},{""name"":""getSystemModule"",""parameters"":[{""name"":""moduleId"",""type"":""String""}],""returntype"":""Array"",""offset"":560,""safe"":true},{""name"":""isModuleGrantedToMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}],""returntype"":""Boolean"",""offset"":1907,""safe"":true},{""name"":""getMiniAppRequestCount"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Integer"",""offset"":2046,""safe"":true},{""name"":""getMiniAppFulfilledCount"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Integer"",""offset"":2119,""safe"":true},{""name"":""getTotalRequests"",""parameters"":[],""returntype"":""Integer"",""offset"":2192,""safe"":true},{""name"":""getTotalFulfilled"",""parameters"":[],""returntype"":""Integer"",""offset"":2230,""safe"":true},{""name"":""getRequest"",""parameters"":[{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Array"",""offset"":2268,""safe"":true},{""name"":""getInboxItem"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Array"",""offset"":2335,""safe"":true},{""name"":""getMiniAppState"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""}],""returntype"":""ByteArray"",""offset"":2446,""safe"":true},{""name"":""isSponsorshipGated"",""parameters"":[{""name"":""appId"",""type"":""String""}],""returntype"":""Boolean"",""offset"":2597,""safe"":true},{""name"":""isSponsoredRequesterAllowed"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""}],""returntype"":""Boolean"",""offset"":2652,""safe"":true},{""name"":""getSponsoredRequesterCap"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""}],""returntype"":""Integer"",""offset"":2761,""safe"":true},{""name"":""getSponsoredRequesterSpent"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""}],""returntype"":""Integer"",""offset"":2865,""safe"":true},{""name"":""setAdmin"",""parameters"":[{""name"":""newAdmin"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":2972,""safe"":false},{""name"":""setUpdater"",""parameters"":[{""name"":""updater"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":3138,""safe"":false},{""name"":""setRuntimeEncryptionKey"",""parameters"":[{""name"":""algorithm"",""type"":""String""},{""name"":""publicKey"",""type"":""String""}],""returntype"":""Void"",""offset"":3229,""safe"":false},{""name"":""setOracleEncryptionKey"",""parameters"":[{""name"":""algorithm"",""type"":""String""},{""name"":""publicKey"",""type"":""String""}],""returntype"":""Void"",""offset"":3453,""safe"":false},{""name"":""setRuntimeVerificationPublicKey"",""parameters"":[{""name"":""publicKey"",""type"":""PublicKey""}],""returntype"":""Void"",""offset"":3464,""safe"":false},{""name"":""setOracleVerificationPublicKey"",""parameters"":[{""name"":""publicKey"",""type"":""PublicKey""}],""returntype"":""Void"",""offset"":3585,""safe"":false},{""name"":""setRequestFee"",""parameters"":[{""name"":""amount"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3592,""safe"":false},{""name"":""withdrawAccruedFees"",""parameters"":[{""name"":""to"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3674,""safe"":false},{""name"":""setRequestTTL"",""parameters"":[{""name"":""ttlMs"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3909,""safe"":false},{""name"":""expireStaleRequest"",""parameters"":[{""name"":""requestId"",""type"":""Integer""}],""returntype"":""Void"",""offset"":3993,""safe"":false},{""name"":""registerSystemModule"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""}],""returntype"":""Void"",""offset"":4815,""safe"":false},{""name"":""configureSystemModule"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""},{""name"":""active"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":5044,""safe"":false},{""name"":""registerMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""appAdmin"",""type"":""Hash160""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""metadataUri"",""type"":""String""},{""name"":""metadataHash"",""type"":""String""}],""returntype"":""Void"",""offset"":5138,""safe"":false},{""name"":""configureMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""metadataUri"",""type"":""String""},{""name"":""metadataHash"",""type"":""String""},{""name"":""active"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":6177,""safe"":false},{""name"":""setSponsoredRequesterAllowed"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""allowed"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":6406,""safe"":false},{""name"":""setSponsoredRequesterCap"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""cap"",""type"":""Integer""}],""returntype"":""Void"",""offset"":6582,""safe"":false},{""name"":""grantModuleToMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}],""returntype"":""Void"",""offset"":6756,""safe"":false},{""name"":""revokeModuleFromMiniApp"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}],""returntype"":""Void"",""offset"":6902,""safe"":false},{""name"":""putMiniAppState"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""},{""name"":""value"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":7003,""safe"":false},{""name"":""putMiniAppStateBatch"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKeys"",""type"":""Array""},{""name"":""values"",""type"":""Array""}],""returntype"":""Void"",""offset"":7270,""safe"":false},{""name"":""deleteMiniAppState"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":7542,""safe"":false},{""name"":""submitMiniAppRequest"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":7618,""safe"":false},{""name"":""submitMiniAppRequestFromIntegration"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":8692,""safe"":false},{""name"":""requestFromCallback"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""callbackMethod"",""type"":""String""}],""returntype"":""Integer"",""offset"":8864,""safe"":false},{""name"":""queueSystemRequest"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""}],""returntype"":""Integer"",""offset"":9499,""safe"":false},{""name"":""queueAutomationRequest"",""parameters"":[{""name"":""requester"",""type"":""Hash160""},{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""callbackMethod"",""type"":""String""}],""returntype"":""Integer"",""offset"":9637,""safe"":false},{""name"":""request"",""parameters"":[{""name"":""requestType"",""type"":""String""},{""name"":""payload"",""type"":""ByteArray""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""callbackMethod"",""type"":""String""}],""returntype"":""Integer"",""offset"":9783,""safe"":false},{""name"":""onNEP17Payment"",""parameters"":[{""name"":""from"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""},{""name"":""data"",""type"":""Any""}],""returntype"":""Void"",""offset"":9928,""safe"":false},{""name"":""fulfillRequest"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""success"",""type"":""Boolean""},{""name"":""result"",""type"":""ByteArray""},{""name"":""error"",""type"":""String""},{""name"":""verificationSignature"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":10408,""safe"":false},{""name"":""update"",""parameters"":[{""name"":""nefFile"",""type"":""ByteArray""},{""name"":""manifest"",""type"":""String""}],""returntype"":""Void"",""offset"":11714,""safe"":false},{""name"":""rebuildIndexes"",""parameters"":[{""name"":""startIndex"",""type"":""Integer""},{""name"":""count"",""type"":""Integer""}],""returntype"":""Void"",""offset"":11733,""safe"":false},{""name"":""_initialize"",""parameters"":[],""returntype"":""Void"",""offset"":11932,""safe"":false}],""events"":[{""name"":""MiniAppRegistered"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""admin"",""type"":""Hash160""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""}]},{""name"":""MiniAppUpdated"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""admin"",""type"":""Hash160""},{""name"":""feePayer"",""type"":""Hash160""},{""name"":""callbackContract"",""type"":""Hash160""},{""name"":""active"",""type"":""Boolean""}]},{""name"":""SystemModuleRegistered"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""}]},{""name"":""SystemModuleUpdated"",""parameters"":[{""name"":""moduleId"",""type"":""String""},{""name"":""endpoint"",""type"":""String""},{""name"":""schemaHash"",""type"":""String""},{""name"":""active"",""type"":""Boolean""}]},{""name"":""MiniAppCapabilityGranted"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}]},{""name"":""MiniAppCapabilityRevoked"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""}]},{""name"":""MiniAppRequestQueued"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""sponsor"",""type"":""Hash160""},{""name"":""payload"",""type"":""ByteArray""}]},{""name"":""MiniAppRequestCompleted"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""appId"",""type"":""String""},{""name"":""moduleId"",""type"":""String""},{""name"":""operation"",""type"":""String""},{""name"":""success"",""type"":""Boolean""},{""name"":""resultHash"",""type"":""ByteArray""},{""name"":""resultSize"",""type"":""Integer""},{""name"":""error"",""type"":""String""}]},{""name"":""MiniAppInboxStored"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requestId"",""type"":""Integer""},{""name"":""requester"",""type"":""Hash160""},{""name"":""success"",""type"":""Boolean""}]},{""name"":""MiniAppStateChanged"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""stateKey"",""type"":""ByteArray""},{""name"":""valueSize"",""type"":""Integer""}]},{""name"":""AdminChanged"",""parameters"":[{""name"":""oldAdmin"",""type"":""Hash160""},{""name"":""newAdmin"",""type"":""Hash160""}]},{""name"":""UpdaterChanged"",""parameters"":[{""name"":""oldUpdater"",""type"":""Hash160""},{""name"":""newUpdater"",""type"":""Hash160""}]},{""name"":""RuntimeEncryptionKeyUpdated"",""parameters"":[{""name"":""version"",""type"":""Integer""},{""name"":""algorithm"",""type"":""String""},{""name"":""publicKey"",""type"":""String""}]},{""name"":""RuntimeVerifierUpdated"",""parameters"":[{""name"":""oldVerifier"",""type"":""PublicKey""},{""name"":""newVerifier"",""type"":""PublicKey""}]},{""name"":""RequestFeeUpdated"",""parameters"":[{""name"":""oldFee"",""type"":""Integer""},{""name"":""newFee"",""type"":""Integer""}]},{""name"":""RequestFeeDeposited"",""parameters"":[{""name"":""from"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""},{""name"":""creditBalance"",""type"":""Integer""}]},{""name"":""AccruedFeesWithdrawn"",""parameters"":[{""name"":""to"",""type"":""Hash160""},{""name"":""amount"",""type"":""Integer""}]},{""name"":""RequestExpired"",""parameters"":[{""name"":""requestId"",""type"":""Integer""},{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""sponsor"",""type"":""Hash160""},{""name"":""refundAmount"",""type"":""Integer""}]},{""name"":""RequestTTLUpdated"",""parameters"":[{""name"":""oldTTL"",""type"":""Integer""},{""name"":""newTTL"",""type"":""Integer""}]},{""name"":""SponsoredRequesterAllowed"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""allowed"",""type"":""Boolean""}]},{""name"":""SponsoredRequesterCapUpdated"",""parameters"":[{""name"":""appId"",""type"":""String""},{""name"":""requester"",""type"":""Hash160""},{""name"":""cap"",""type"":""Integer""}]}]},""permissions"":[{""contract"":""0x726cb6e0cd8628a1350a611384688911ab75f51b"",""methods"":[""sha256"",""verifyWithECDsa""]},{""contract"":""0xacce6fd80d44e1796aa0c2c625e9e4e0ce39efc0"",""methods"":[""deserialize"",""serialize""]},{""contract"":""0xd2a4cff31913016155e38e474a2c06d08be276cf"",""methods"":[""transfer""]},{""contract"":""0xfffdc93764dbaddd97c48f252a53ea4643faa3fd"",""methods"":[""update""]},{""contract"":""*"",""methods"":[""onMiniAppResult"",""onOracleResult""]}],""trusts"":[],""extra"":{""Author"":""Morpheus Oracle"",""Version"":""2.0.0"",""Description"":""MiniApp OS kernel with shared IO, registration, and callback orchestration"",""nef"":{""optimization"":""Basic""}}}");

    /// <summary>
    /// Optimization: "Basic"
    /// </summary>
    public static Neo.SmartContract.NefFile Nef => Convert.FromBase64String(@"TkVGM05lby5Db21waWxlci5DU2hhcnAgMy45LjErNWZhOTU2NmU1MTY1ZWRlMjE2NWE5YmUxZjRhMDEyMGMxNzYuLi4AAAbA7znO4OTpJcbCoGp54UQN2G/OrAtkZXNlcmlhbGl6ZQEAAQ/A7znO4OTpJcbCoGp54UQN2G/OrAlzZXJpYWxpemUBAAEPG/V1qxGJaIQTYQo1oSiGzeC2bHIGc2hhMjU2AQABD8924ovQBixKR47jVWEBExnzz6TSCHRyYW5zZmVyBAABDxv1dasRiWiEE2EKNaEohs3gtmxyD3ZlcmlmeVdpdGhFQ0RzYQQAAQ/9o/pDRupTKiWPxJfdrdtkN8n9/wZ1cGRhdGUDAAAPAAD9ly9XAQJ5Jgcj0gEAAEEtUQgwcGgTzlhBm/ZnzkHmPxiEEFlBm/ZnzkHmPxiEAkBCDwBaQZv2Z85B5j8YhAwfbW9ycGhldXMubW9kdWxlLm9yYWNsZS5mZXRjaC52MQwTL29yYWNsZS9zbWFydC1mZXRjaAwMb3JhY2xlLmZldGNoNXIBAAAMHm1vcnBoZXVzLm1vZHVsZS5jb21wdXRlLnJ1bi52MQwQL2NvbXB1dGUvZXhlY3V0ZQwLY29tcHV0ZS5ydW41LgEAAAwcbW9ycGhldXMubW9kdWxlLmZlZWQucmVhZC52MQwML29yYWNsZS9mZWVkDAlmZWVkLnJlYWQ18gAAAAwfbW9ycGhldXMubW9kdWxlLmZlZWQucHVibGlzaC52MQwML29yYWNsZS9mZWVkDAxmZWVkLnB1Ymxpc2g1sAAAAAwibW9ycGhldXMubW9kdWxlLmlkZW50aXR5LnZlcmlmeS52MQwPL25lb2RpZC9yZXNvbHZlDA9pZGVudGl0eS52ZXJpZnk0ZQwhbW9ycGhldXMubW9kdWxlLmF1dG9tYXRpb24ucnVuLnYxDBMvYXV0b21hdGlvbi9leGVjdXRlDA5hdXRvbWF0aW9uLnJ1bjQbQEEtUQgwQEHmPxiEQEGb9mfOQEHmPxiEQFcAA3g0OxTOELcmBCIyQbfDiAMIenl4NbIAAAB6eXgTwAwWU3lzdGVtTW9kdWxlUmVnaXN0ZXJlZEGVAW9hQFcBAQwRaW52YWxpZCBtb2R1bGUgaWQAQHg0IXg0RsFFU4tQQZJd6DFwaAuXJgd4ND8iCGg3AAAiAkBX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").AsSerializable<Neo.SmartContract.NefFile>();

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
