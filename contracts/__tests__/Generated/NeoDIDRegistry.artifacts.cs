using Neo.Cryptography.ECC;
using Neo.Extensions;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Numerics;

#pragma warning disable CS0067

namespace Neo.SmartContract.Testing;

public abstract class NeoDIDRegistry(Neo.SmartContract.Testing.SmartContractInitialize initialize) : Neo.SmartContract.Testing.SmartContract(initialize), IContractInfo
{
    #region Compiled data

    public static Neo.SmartContract.Manifest.ContractManifest Manifest => Neo.SmartContract.Manifest.ContractManifest.Parse(@"{""name"":""NeoDIDRegistry"",""groups"":[],""features"":{},""supportedstandards"":[],""abi"":{""methods"":[{""name"":""_deploy"",""parameters"":[{""name"":""data"",""type"":""Any""},{""name"":""update"",""type"":""Boolean""}],""returntype"":""Void"",""offset"":0,""safe"":false},{""name"":""admin"",""parameters"":[],""returntype"":""Hash160"",""offset"":45,""safe"":true},{""name"":""verifier"",""parameters"":[],""returntype"":""PublicKey"",""offset"":76,""safe"":true},{""name"":""setAdmin"",""parameters"":[{""name"":""newAdmin"",""type"":""Hash160""}],""returntype"":""Void"",""offset"":135,""safe"":false},{""name"":""setVerifier"",""parameters"":[{""name"":""publicKey"",""type"":""PublicKey""}],""returntype"":""Void"",""offset"":315,""safe"":false},{""name"":""update"",""parameters"":[{""name"":""nefFile"",""type"":""ByteArray""},{""name"":""manifest"",""type"":""String""}],""returntype"":""Void"",""offset"":425,""safe"":false},{""name"":""registerBinding"",""parameters"":[{""name"":""vaultAccount"",""type"":""Hash160""},{""name"":""provider"",""type"":""String""},{""name"":""claimType"",""type"":""String""},{""name"":""claimValue"",""type"":""String""},{""name"":""masterNullifier"",""type"":""ByteArray""},{""name"":""metadataHash"",""type"":""ByteArray""},{""name"":""verificationSignature"",""type"":""ByteArray""}],""returntype"":""Void"",""offset"":444,""safe"":false},{""name"":""revokeBinding"",""parameters"":[{""name"":""vaultAccount"",""type"":""Hash160""},{""name"":""provider"",""type"":""String""},{""name"":""claimType"",""type"":""String""}],""returntype"":""Void"",""offset"":1878,""safe"":false},{""name"":""getBinding"",""parameters"":[{""name"":""vaultAccount"",""type"":""Hash160""},{""name"":""provider"",""type"":""String""},{""name"":""claimType"",""type"":""String""}],""returntype"":""Array"",""offset"":1029,""safe"":true},{""name"":""isMasterNullifierUsed"",""parameters"":[{""name"":""masterNullifier"",""type"":""ByteArray""}],""returntype"":""Boolean"",""offset"":965,""safe"":true},{""name"":""isActionNullifierUsed"",""parameters"":[{""name"":""actionNullifier"",""type"":""ByteArray""}],""returntype"":""Boolean"",""offset"":2131,""safe"":true},{""name"":""useActionTicket"",""parameters"":[{""name"":""disposableAccount"",""type"":""Hash160""},{""name"":""actionId"",""type"":""String""},{""name"":""actionNullifier"",""type"":""ByteArray""},{""name"":""verificationSignature"",""type"":""ByteArray""}],""returntype"":""Boolean"",""offset"":2181,""safe"":false},{""name"":""_initialize"",""parameters"":[],""returntype"":""Void"",""offset"":2504,""safe"":false}],""events"":[{""name"":""BindingRegistered"",""parameters"":[{""name"":""vaultAccount"",""type"":""Hash160""},{""name"":""provider"",""type"":""String""},{""name"":""claimType"",""type"":""String""},{""name"":""claimValue"",""type"":""String""},{""name"":""masterNullifier"",""type"":""ByteArray""},{""name"":""metadataHash"",""type"":""ByteArray""}]},{""name"":""BindingRevoked"",""parameters"":[{""name"":""vaultAccount"",""type"":""Hash160""},{""name"":""provider"",""type"":""String""},{""name"":""claimType"",""type"":""String""},{""name"":""masterNullifier"",""type"":""ByteArray""}]},{""name"":""ActionTicketUsed"",""parameters"":[{""name"":""disposableAccount"",""type"":""Hash160""},{""name"":""actionId"",""type"":""String""},{""name"":""actionNullifier"",""type"":""ByteArray""}]},{""name"":""AdminChanged"",""parameters"":[{""name"":""oldAdmin"",""type"":""Hash160""},{""name"":""newAdmin"",""type"":""Hash160""}]},{""name"":""VerifierChanged"",""parameters"":[{""name"":""oldVerifier"",""type"":""PublicKey""},{""name"":""newVerifier"",""type"":""PublicKey""}]}]},""permissions"":[{""contract"":""0x726cb6e0cd8628a1350a611384688911ab75f51b"",""methods"":[""sha256"",""verifyWithECDsa""]},{""contract"":""0xacce6fd80d44e1796aa0c2c625e9e4e0ce39efc0"",""methods"":[""deserialize"",""serialize""]},{""contract"":""0xfffdc93764dbaddd97c48f252a53ea4643faa3fd"",""methods"":[""update""]}],""trusts"":[],""extra"":{""Author"":""Morpheus Oracle"",""Version"":""1.0.0"",""Description"":""Independent NeoDID binding and action-ticket registry"",""nef"":{""optimization"":""Basic""}}}");

    /// <summary>
    /// Optimization: "Basic"
    /// </summary>
    public static Neo.SmartContract.NefFile Nef => Convert.FromBase64String(@"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").AsSerializable<Neo.SmartContract.NefFile>();

    #endregion

    #region Events

    public delegate void delActionTicketUsed(UInt160? disposableAccount, string? actionId, byte[]? actionNullifier);

    [DisplayName("ActionTicketUsed")]
    public event delActionTicketUsed? OnActionTicketUsed;

    public delegate void delAdminChanged(UInt160? oldAdmin, UInt160? newAdmin);

    [DisplayName("AdminChanged")]
    public event delAdminChanged? OnAdminChanged;

    public delegate void delBindingRegistered(UInt160? vaultAccount, string? provider, string? claimType, string? claimValue, byte[]? masterNullifier, byte[]? metadataHash);

    [DisplayName("BindingRegistered")]
    public event delBindingRegistered? OnBindingRegistered;

    public delegate void delBindingRevoked(UInt160? vaultAccount, string? provider, string? claimType, byte[]? masterNullifier);

    [DisplayName("BindingRevoked")]
    public event delBindingRevoked? OnBindingRevoked;

    public delegate void delVerifierChanged(ECPoint? oldVerifier, ECPoint? newVerifier);

    [DisplayName("VerifierChanged")]
    public event delVerifierChanged? OnVerifierChanged;

    #endregion

    #region Properties

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract UInt160? Admin { [DisplayName("admin")] get; }

    /// <summary>
    /// Safe property
    /// </summary>
    public abstract ECPoint? Verifier { [DisplayName("verifier")] get; }

    #endregion

    #region Safe methods

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("getBinding")]
    public abstract IList<object>? GetBinding(UInt160? vaultAccount, string? provider, string? claimType);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("isActionNullifierUsed")]
    public abstract bool? IsActionNullifierUsed(byte[]? actionNullifier);

    /// <summary>
    /// Safe method
    /// </summary>
    [DisplayName("isMasterNullifierUsed")]
    public abstract bool? IsMasterNullifierUsed(byte[]? masterNullifier);

    #endregion

    #region Unsafe methods

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("registerBinding")]
    public abstract void RegisterBinding(UInt160? vaultAccount, string? provider, string? claimType, string? claimValue, byte[]? masterNullifier, byte[]? metadataHash, byte[]? verificationSignature);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("revokeBinding")]
    public abstract void RevokeBinding(UInt160? vaultAccount, string? provider, string? claimType);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setAdmin")]
    public abstract void SetAdmin(UInt160? newAdmin);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("setVerifier")]
    public abstract void SetVerifier(ECPoint? publicKey);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("update")]
    public abstract void Update(byte[]? nefFile, string? manifest);

    /// <summary>
    /// Unsafe method
    /// </summary>
    [DisplayName("useActionTicket")]
    public abstract bool? UseActionTicket(UInt160? disposableAccount, string? actionId, byte[]? actionNullifier, byte[]? verificationSignature);

    #endregion
}
