using System;
using System.Collections.Generic;
using System.Numerics;
using System.Text;
using Neo;
using Neo.Cryptography.ECC;
using Neo.SmartContract.Testing;
using Neo.Wallets;
using Xunit;
using DataFeed = Neo.SmartContract.Testing.MorpheusDataFeed;

namespace MorpheusOracle.Contracts.Tests
{
    /// <summary>
    /// VM-level coverage for the optional on-chain price-signature check (C1). The
    /// feed keeps its original updater-witness gate; once an admin registers a
    /// verification key, a write that carries a signature must additionally verify
    /// against the canonical price message (symbol|price|timestamp|round).
    ///
    /// The verification must stay inert until a key is registered: with no key the
    /// witness-only writes behave exactly as before, and even after a key is
    /// registered the original 6-parameter UpdateFeed path (which carries no
    /// signature) keeps working so existing publishers are not broken.
    ///
    /// Same harness pattern as <see cref="MorpheusDataFeedEngineTests"/> and
    /// <see cref="NeoDIDRegistryEngineTests"/>. The deployed contract is the
    /// generated artifact under Generated/ (produced by
    /// `nccs MorpheusDataFeed.csproj --generate-artifacts Source`). Regenerate it
    /// when the contract changes.
    /// </summary>
    public class MorpheusDataFeedSignatureTests
    {
        private const string Pair = "BTC-USD";

        private const int RoundIdIndex = 1;
        private const int PriceIndex = 2;
        private const int TimestampIndex = 3;

        private sealed record Harness(TestEngine Engine, DataFeed Contract, UInt160 Admin, UInt160 Updater, KeyPair Signer);

        private static Harness Deploy()
        {
            // ProtocolSettings.Default has no standby committee, which makes the
            // genesis un-mintable, so seed a 1-key committee (same pattern as the
            // other engine harnesses).
            byte[] priv = new byte[32];
            priv[31] = 1;
            ProtocolSettings settings = ProtocolSettings.Default with
            {
                StandbyCommittee = new[] { new KeyPair(priv).PublicKey },
                ValidatorsCount = 1,
            };

            TestEngine engine = new(settings, true);
            engine.Fee = 1_000 * 100_000_000L;
            UInt160 admin = engine.Sender;
            engine.SetTransactionSigners(admin); // deployer => admin (set in _deploy)

            DataFeed contract = engine.Deploy<DataFeed>(DataFeed.Nef, DataFeed.Manifest, null);
            Assert.Equal(admin, contract.Admin);

            UInt160 updater = TestEngine.GetNewSigner().Account;
            contract.SetUpdater(updater);
            Assert.Equal(updater, contract.Updater);

            // Off-chain price signer. Distinct from admin and updater so the tests
            // prove the signature is an independent second factor.
            byte[] signerPriv = new byte[32];
            signerPriv[31] = 7;
            KeyPair signer = new KeyPair(signerPriv);

            return new Harness(engine, contract, admin, updater, signer);
        }

        private static void AssertReverts(Action action, string messageFragment)
        {
            Exception ex = Assert.ThrowsAny<Exception>(action);
            Assert.Contains(messageFragment, ex.ToString());
        }

        // Canonical price message the contract verifies signatures over:
        // symbol|price|timestamp|round, ASCII-encoded. Must match BuildFeedMessage
        // in the contract exactly.
        private static byte[] FeedMessage(string pair, BigInteger price, BigInteger timestamp, BigInteger roundId)
        {
            string message = $"{pair}|{price}|{timestamp}|{roundId}";
            return Encoding.ASCII.GetBytes(message);
        }

        // Crypto.Sign on this platform occasionally emits an invalid signature for
        // a given nonce; Neo's managed verifier (the same one CryptoLib.VerifyWithECDsa
        // uses in-VM) rejects those deterministically. Re-sign until the signature
        // round-trips locally so a locally verified signature is guaranteed to verify
        // in-contract and the suite stays deterministic. Same approach as the NeoDID
        // engine tests.
        private static byte[] Sign(KeyPair signer, byte[] message)
        {
            for (int attempt = 0; attempt < 16; attempt++)
            {
                byte[] signature = Neo.Cryptography.Crypto.Sign(
                    message, signer.PrivateKey, ECCurve.Secp256r1);
                if (Neo.Cryptography.Crypto.VerifySignature(message, signature, signer.PublicKey))
                    return signature;
            }
            throw new InvalidOperationException("could not produce a locally verifiable signature");
        }

        private static BigInteger Field(Harness h, int index)
        {
            IList<object> record = h.Contract.GetLatest(Pair)!;
            return (BigInteger)record[index];
        }

        private static void AssertLatest(Harness h, BigInteger roundId, BigInteger price, BigInteger timestamp)
        {
            Assert.Equal(roundId, Field(h, RoundIdIndex));
            Assert.Equal(price, Field(h, PriceIndex));
            Assert.Equal(timestamp, Field(h, TimestampIndex));
        }

        [Fact]
        public void VerificationKey_IsUnsetByDefault_AndWritesStayWitnessOnly()
        {
            Harness h = Deploy();

            // No key registered: the verification path is inert.
            Assert.Null(h.Contract.OracleVerificationKey);

            // The plain (unsigned) updater write succeeds exactly as before.
            h.Engine.SetTransactionSigners(h.Updater);
            h.Contract.UpdateFeed(Pair, 1, 50_000, 1_000, Array.Empty<byte>(), 1);
            AssertLatest(h, 1, 50_000, 1_000);

            // A signed write with no key registered also succeeds — the signature is
            // simply ignored (even a bogus one), preserving the original behavior.
            h.Contract.UpdateFeedSigned(Pair, 2, 51_000, 1_001, Array.Empty<byte>(), 1, new byte[] { 0xAA, 0xBB });
            AssertLatest(h, 2, 51_000, 1_001);
        }

        [Fact]
        public void SetOracleVerificationKey_IsAdminGated()
        {
            Harness h = Deploy();

            // The updater (a different role) cannot register the verification key.
            h.Engine.SetTransactionSigners(h.Updater);
            AssertReverts(() => h.Contract.SetOracleVerificationKey(h.Signer.PublicKey), "unauthorized");

            // The admin can, and it is then readable.
            h.Engine.SetTransactionSigners(h.Admin);
            h.Contract.SetOracleVerificationKey(h.Signer.PublicKey);
            Assert.Equal(h.Signer.PublicKey, h.Contract.OracleVerificationKey);
        }

        [Fact]
        public void UpdateFeedSigned_WithRegisteredKey_AcceptsAValidSignature()
        {
            Harness h = Deploy();

            h.Engine.SetTransactionSigners(h.Admin);
            h.Contract.SetOracleVerificationKey(h.Signer.PublicKey);

            BigInteger roundId = 1;
            BigInteger price = 50_000;
            BigInteger timestamp = 1_000;
            byte[] signature = Sign(h.Signer, FeedMessage(Pair, price, timestamp, roundId));

            h.Engine.SetTransactionSigners(h.Updater);
            h.Contract.UpdateFeedSigned(Pair, roundId, price, timestamp, Array.Empty<byte>(), 1, signature);
            AssertLatest(h, roundId, price, timestamp);
        }

        [Fact]
        public void UpdateFeedSigned_WithRegisteredKey_RejectsAMismatchedSignature()
        {
            Harness h = Deploy();

            h.Engine.SetTransactionSigners(h.Admin);
            h.Contract.SetOracleVerificationKey(h.Signer.PublicKey);

            // A signature over a DIFFERENT price must not transfer to the submitted
            // arguments: a leaked updater witness alone can no longer anchor an
            // arbitrary value.
            byte[] signatureOverOtherPrice = Sign(h.Signer, FeedMessage(Pair, 99_999, 1_000, 1));

            h.Engine.SetTransactionSigners(h.Updater);
            AssertReverts(
                () => h.Contract.UpdateFeedSigned(Pair, 1, 50_000, 1_000, Array.Empty<byte>(), 1, signatureOverOtherPrice),
                "invalid feed signature");

            // A signature from a DIFFERENT key is also rejected.
            byte[] otherPriv = new byte[32];
            otherPriv[31] = 8;
            KeyPair otherSigner = new KeyPair(otherPriv);
            byte[] foreignSignature = Sign(otherSigner, FeedMessage(Pair, 50_000, 1_000, 1));
            AssertReverts(
                () => h.Contract.UpdateFeedSigned(Pair, 1, 50_000, 1_000, Array.Empty<byte>(), 1, foreignSignature),
                "invalid feed signature");

            // The feed was never written by the rejected attempts.
            Assert.Equal(BigInteger.Zero, h.Contract.PairCount);
        }

        [Fact]
        public void UpdateFeed_StaysWitnessOnly_EvenAfterKeyIsRegistered()
        {
            Harness h = Deploy();

            h.Engine.SetTransactionSigners(h.Admin);
            h.Contract.SetOracleVerificationKey(h.Signer.PublicKey);

            // The original 6-parameter UpdateFeed carries no signature, so the
            // verification path stays inert for it: existing publishers keep working.
            h.Engine.SetTransactionSigners(h.Updater);
            h.Contract.UpdateFeed(Pair, 1, 50_000, 1_000, Array.Empty<byte>(), 1);
            AssertLatest(h, 1, 50_000, 1_000);

            // UpdateFeedSigned with an empty signature is likewise inert (only a
            // non-empty signature triggers verification).
            h.Contract.UpdateFeedSigned(Pair, 2, 51_000, 1_001, Array.Empty<byte>(), 1, Array.Empty<byte>());
            AssertLatest(h, 2, 51_000, 1_001);
        }

        [Fact]
        public void ClearOracleVerificationKey_RevertsToWitnessOnly()
        {
            Harness h = Deploy();

            h.Engine.SetTransactionSigners(h.Admin);
            h.Contract.SetOracleVerificationKey(h.Signer.PublicKey);
            Assert.Equal(h.Signer.PublicKey, h.Contract.OracleVerificationKey);

            // While the key is registered, a signed write with a mismatched signature
            // is rejected.
            h.Engine.SetTransactionSigners(h.Updater);
            byte[] badSignature = Sign(h.Signer, FeedMessage(Pair, 1, 1, 1));
            AssertReverts(
                () => h.Contract.UpdateFeedSigned(Pair, 1, 50_000, 1_000, Array.Empty<byte>(), 1, badSignature),
                "invalid feed signature");

            // Clearing the key (admin-only) reverts to witness-only behavior.
            h.Engine.SetTransactionSigners(h.Updater);
            AssertReverts(() => h.Contract.ClearOracleVerificationKey(), "unauthorized");

            h.Engine.SetTransactionSigners(h.Admin);
            h.Contract.ClearOracleVerificationKey();
            Assert.Null(h.Contract.OracleVerificationKey);

            // The same previously-rejected signed write now succeeds: verification is
            // inert again.
            h.Engine.SetTransactionSigners(h.Updater);
            h.Contract.UpdateFeedSigned(Pair, 1, 50_000, 1_000, Array.Empty<byte>(), 1, badSignature);
            AssertLatest(h, 1, 50_000, 1_000);
        }
    }
}
