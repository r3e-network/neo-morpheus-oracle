using System.Collections.Generic;
using System.Numerics;
using System.Reflection;
using Neo;
using Neo.Network.P2P.Payloads;
using Neo.SmartContract.Testing;
using Neo.Wallets;
using Xunit;
using Kernel = Neo.SmartContract.Testing.MorpheusOracle;

namespace MorpheusOracle.Contracts.Tests
{
    /// <summary>
    /// VM-level coverage for the request fee-accounting lifecycle (submit -> expire).
    ///
    /// Unlike the source-text assertions in <see cref="MorpheusOracleTest"/>, these
    /// tests deploy the compiled NEF into an emulated Neo VM and exercise real
    /// storage, GAS transfers, witness checks and Runtime.Time.  That is required to
    /// catch fee-math regressions: the expiry refund used to credit the *current*
    /// configured fee and increment the sponsor credit unconditionally while only
    /// decrementing the accrued pool when it still held enough, which both
    /// over-refunded after a fee change and could leave fee-credit liabilities
    /// exceeding the GAS the contract actually holds.
    ///
    /// The deployed contract is the generated artifact under Generated/ (produced by
    /// `nccs MorpheusOracle.csproj --generate-artifacts Source`).  Regenerate it when
    /// the contract changes.
    /// </summary>
    public class MorpheusOracleFeeAccountingTests
    {
        private const string AppId = "demo.app";
        private const string ModuleId = "oracle.fetch"; // seeded as an active built-in module at deploy
        private const long DefaultFee = 1_000_000;       // DEFAULT_REQUEST_FEE

        // KernelRequest field indices in the serialized struct returned by GetRequest.
        private const int StatusIndex = 8;   // KernelRequestStatus { Pending=0, Succeeded=1, Failed=2 }
        private const int FeePaidIndex = 14; // BigInteger FeePaid (recorded at submission)

        private sealed record Harness(TestEngine Engine, Kernel Contract, UInt160 Owner, UInt160 Requester);

        private static Harness Deploy()
        {
            // ProtocolSettings.Default has no standby committee, which makes the
            // genesis (and therefore the GAS supply) un-mintable, so seed a 1-key
            // committee.  That key's account (engine.Sender) holds the genesis GAS.
            byte[] priv = new byte[32];
            priv[31] = 1;
            ProtocolSettings settings = ProtocolSettings.Default with
            {
                StandbyCommittee = new[] { new KeyPair(priv).PublicKey },
                ValidatorsCount = 1,
            };

            TestEngine engine = new(settings, true);
            // Default per-invocation gas limit is 20 GAS; deploying the kernel and
            // seeding its built-in modules needs more, so raise it generously.
            engine.Fee = 10_000 * 100_000_000L; // 10,000 GAS
            UInt160 owner = engine.Sender;          // genesis GAS holder
            engine.SetTransactionSigners(owner);    // deployer => admin (set in _deploy)

            Kernel contract = engine.Deploy<Kernel>(Kernel.Nef, Kernel.Manifest, null);

            // _deploy records the deploying sender as admin; the expiry path is
            // admin-gated, so this assumption must hold for the tests below.
            Assert.Equal(owner, contract.Admin);

            return new Harness(engine, contract, owner, TestEngine.GetNewSigner().Account);
        }

        private static ulong BlockTimeMs(TestEngine engine) =>
            (ulong)engine.PersistingBlock.Timestamp.TotalMilliseconds;

        // PersistingBlock.Timestamp is read-only in the testing API; the supported
        // way to move Runtime.Time forward is to mutate the underlying block header.
        private static void SetBlockTimeMs(TestEngine engine, ulong ms)
        {
            object persistingBlock = engine.PersistingBlock;
            Block block = (Block)persistingBlock.GetType()
                .GetField("UnderlyingBlock", BindingFlags.NonPublic | BindingFlags.Instance)!
                .GetValue(persistingBlock)!;
            block.Header.Timestamp = ms;
        }

        private static void AdvancePastTtl(Harness h)
        {
            ulong ttl = (ulong)h.Contract.RequestTTL!.Value;
            SetBlockTimeMs(h.Engine, BlockTimeMs(h.Engine) + ttl + 1_000);
        }

        // Registers an app whose fee payer (sponsor) is the owner and grants the
        // seeded module, after prepaying the owner's fee credit with real GAS.
        private static void Bootstrap(Harness h, BigInteger deposit)
        {
            h.Engine.SetTransactionSigners(h.Owner);

            // Sending GAS to the kernel with no data credits the sender itself.
            bool? funded = h.Engine.Native.GAS.Transfer(h.Owner, h.Contract.Hash, deposit, null);
            Assert.True(funded == true);
            Assert.Equal(deposit, h.Contract.FeeCreditOf(h.Owner)!.Value);

            h.Contract.RegisterMiniApp(AppId, h.Owner, h.Owner, null, "ipfs://meta", "deadbeef");
            h.Contract.GrantModuleToMiniApp(AppId, ModuleId);
        }

        // Submits as a distinct requester so the fee is drawn from the sponsor
        // (owner) credit, exactly the path that the expiry refund reverses.
        private static BigInteger Submit(Harness h)
        {
            h.Engine.SetTransactionSigners(h.Requester);
            return h.Contract.SubmitMiniAppRequest(AppId, ModuleId, "fetch", new byte[] { 1, 2, 3 })!.Value;
        }

        private static void Expire(Harness h, BigInteger requestId)
        {
            h.Engine.SetTransactionSigners(h.Owner);
            h.Contract.ExpireStaleRequest(requestId);
        }

        private static BigInteger RequestField(Harness h, BigInteger requestId, int index)
        {
            IList<object> req = h.Contract.GetRequest(requestId)!;
            return (BigInteger)req[index];
        }

        // Core invariant the fix protects: outstanding fee-credit liabilities must
        // never exceed the GAS the contract actually holds.  Only the owner carries
        // credit in these tests, so its credit plus the accrued pool is the full
        // liability.
        private static void AssertSolvent(Harness h)
        {
            BigInteger gas = h.Engine.Native.GAS.BalanceOf(h.Contract.Hash)!.Value;
            BigInteger liabilities = h.Contract.FeeCreditOf(h.Owner)!.Value + h.Contract.AccruedRequestFees!.Value;
            Assert.True(gas >= liabilities, $"under-collateralized: gas={gas} < liabilities={liabilities}");
        }

        [Fact]
        public void SubmitThenExpire_RefundsExactFee_AndKeepsAccruedSymmetric()
        {
            Harness h = Deploy();
            BigInteger deposit = 10 * DefaultFee;
            Bootstrap(h, deposit);

            BigInteger id = Submit(h);

            // Fee debited from the sponsor, mirrored into the accrued pool, and the
            // exact amount recorded on the request for a later symmetric refund.
            Assert.Equal(deposit - DefaultFee, h.Contract.FeeCreditOf(h.Owner)!.Value);
            Assert.Equal(new BigInteger(DefaultFee), h.Contract.AccruedRequestFees!.Value);
            Assert.Equal(new BigInteger(DefaultFee), RequestField(h, id, FeePaidIndex));
            Assert.Equal(BigInteger.Zero, RequestField(h, id, StatusIndex)); // Pending

            AdvancePastTtl(h);
            Expire(h, id);

            // Sponsor made whole; accrued returns to zero (credit and accrued moved
            // by the same amount).
            Assert.Equal(deposit, h.Contract.FeeCreditOf(h.Owner)!.Value);
            Assert.Equal(BigInteger.Zero, h.Contract.AccruedRequestFees!.Value);
            Assert.Equal(new BigInteger(2), RequestField(h, id, StatusIndex)); // Failed
            AssertSolvent(h);
        }

        [Fact]
        public void Expire_AfterFeeChange_RefundsFeePaid_NotCurrentFee()
        {
            Harness h = Deploy();
            BigInteger deposit = 10 * DefaultFee;
            Bootstrap(h, deposit);

            BigInteger id = Submit(h); // pays DefaultFee (1,000,000)
            Assert.Equal(deposit - DefaultFee, h.Contract.FeeCreditOf(h.Owner)!.Value);

            // Admin raises the fee 5x AFTER submission but before expiry.
            h.Engine.SetTransactionSigners(h.Owner);
            h.Contract.SetRequestFee(5 * DefaultFee);
            Assert.Equal(new BigInteger(5 * DefaultFee), h.Contract.SystemRequestFee!.Value);

            AdvancePastTtl(h);
            Expire(h, id);

            // Refund must equal the 1,000,000 actually paid, NOT the current
            // 5,000,000.  The pre-fix code refunded SystemRequestFee(), inflating the
            // sponsor credit to deposit + 4,000,000 and leaving 1,000,000 stuck in
            // the accrued pool.
            Assert.Equal(deposit, h.Contract.FeeCreditOf(h.Owner)!.Value);
            Assert.Equal(BigInteger.Zero, h.Contract.AccruedRequestFees!.Value);
            AssertSolvent(h);
        }

        [Fact]
        public void Expire_AfterAccruedFullyWithdrawn_DoesNotRefundUnbackedCredit()
        {
            Harness h = Deploy();
            BigInteger deposit = 10 * DefaultFee;
            Bootstrap(h, deposit);

            BigInteger id = Submit(h);
            Assert.Equal(new BigInteger(DefaultFee), h.Contract.AccruedRequestFees!.Value);

            // Admin withdraws the full accrued fee (as revenue) before expiry: the
            // GAS backing that fee has now left the contract.
            h.Engine.SetTransactionSigners(h.Owner);
            h.Contract.WithdrawAccruedFees(h.Owner, DefaultFee);
            Assert.Equal(BigInteger.Zero, h.Contract.AccruedRequestFees!.Value);
            Assert.Equal(deposit - DefaultFee, h.Engine.Native.GAS.BalanceOf(h.Contract.Hash)!.Value);

            AdvancePastTtl(h);
            Expire(h, id);

            // The accrued pool is empty, so the refund is clamped to 0 and the
            // sponsor credit is left untouched.  The pre-fix code blindly added the
            // fee back, producing credit (deposit) the contract could no longer back
            // with GAS (deposit - fee).
            Assert.Equal(deposit - DefaultFee, h.Contract.FeeCreditOf(h.Owner)!.Value);
            Assert.Equal(BigInteger.Zero, h.Contract.AccruedRequestFees!.Value);
            AssertSolvent(h);
        }

        [Fact]
        public void Expire_WithPartiallyWithdrawnAccrued_RefundsOnlyBackedPortion()
        {
            Harness h = Deploy();
            BigInteger deposit = 10 * DefaultFee;
            Bootstrap(h, deposit);

            BigInteger id1 = Submit(h);
            Submit(h); // second pending request, also paid by the sponsor
            Assert.Equal(deposit - 2 * DefaultFee, h.Contract.FeeCreditOf(h.Owner)!.Value);
            Assert.Equal(new BigInteger(2 * DefaultFee), h.Contract.AccruedRequestFees!.Value);

            // Withdraw 1.5x the per-request fee, leaving only 0.5x backed in the pool.
            BigInteger withdraw = 3 * DefaultFee / 2; // 1,500,000
            h.Engine.SetTransactionSigners(h.Owner);
            h.Contract.WithdrawAccruedFees(h.Owner, withdraw);
            Assert.Equal(new BigInteger(DefaultFee / 2), h.Contract.AccruedRequestFees!.Value); // 500,000

            AdvancePastTtl(h);
            Expire(h, id1); // FeePaid = 1,000,000 but only 500,000 remains accrued

            // Refund is clamped to the 500,000 still backed; credit and accrued move
            // together so the contract stays solvent.
            Assert.Equal(deposit - 2 * DefaultFee + DefaultFee / 2, h.Contract.FeeCreditOf(h.Owner)!.Value);
            Assert.Equal(BigInteger.Zero, h.Contract.AccruedRequestFees!.Value);
            AssertSolvent(h);
        }

        // Behavioral coverage for the fulfillment signature path: the off-chain
        // oracle signs ComputeFulfillmentDigest with the runtime verifier key, and
        // FulfillRequest must recompute the identical digest and accept the secp256r1
        // signature. This pins the exact digest byte layout that the relayer's
        // buildFulfillmentDigestBytes must reproduce; a divergence here would mean a
        // signature mismatch and a stalled oracle.
        [Fact]
        public void FulfillRequest_VerifiesSignatureOverDigest_AndMarksSucceeded()
        {
            Harness h = Deploy();
            Bootstrap(h, 10 * DefaultFee);
            BigInteger id = Submit(h); // appId=demo.app, moduleId=oracle.fetch, operation="fetch"
            Assert.Equal(BigInteger.Zero, RequestField(h, id, StatusIndex)); // Pending

            byte[] priv = new byte[32];
            priv[31] = 7;
            KeyPair verifier = new KeyPair(priv);

            h.Engine.SetTransactionSigners(h.Owner); // admin sets verifier + updater
            h.Contract.SetRuntimeVerificationPublicKey(verifier.PublicKey);
            h.Contract.SetUpdater(h.Owner);          // owner submits the fulfill tx (updater witness)

            byte[] result = new byte[] { 0xAA, 0xBB, 0xCC };
            string error = "";
            byte[] scriptHashLe = h.Contract.Hash.GetSpan().ToArray(); // (ByteString)Runtime.ExecutingScriptHash (LE)
            uint network = ProtocolSettings.Default.Network;        // == Runtime.GetNetwork() in the engine
            byte[] digest = ComputeFulfillmentDigest(
                id, AppId, ModuleId, "fetch", true, result, error, scriptHashLe, network);
            byte[] signature = Neo.Cryptography.Crypto.Sign(
                digest, verifier.PrivateKey, Neo.Cryptography.ECC.ECCurve.Secp256r1);

            h.Engine.SetTransactionSigners(h.Owner);
            h.Contract.FulfillRequest(id, true, result, error, signature);

            Assert.Equal(BigInteger.One, RequestField(h, id, StatusIndex)); // Succeeded
        }

        // C# replica of the contract's ComputeFulfillmentDigest (and the relayer's
        // buildFulfillmentDigestBytes). If FulfillRequest above accepts a signature
        // over this, the contract computes the identical bytes.
        private static byte[] ComputeFulfillmentDigest(
            BigInteger requestId, string appId, string moduleId, string operation,
            bool success, byte[] result, string error, byte[] scriptHashLe, uint network)
        {
            static byte[] Sha(byte[] b)
            {
                using var sha = System.Security.Cryptography.SHA256.Create();
                return sha.ComputeHash(b);
            }
            var payload = new List<byte>();
            payload.AddRange(System.Text.Encoding.ASCII.GetBytes("miniapp-os-fulfillment-v1"));
            payload.AddRange(ToUInt256BE(requestId));
            payload.AddRange(Sha(System.Text.Encoding.UTF8.GetBytes(appId)));
            payload.AddRange(Sha(System.Text.Encoding.UTF8.GetBytes(moduleId)));
            payload.AddRange(Sha(System.Text.Encoding.UTF8.GetBytes(operation)));
            payload.Add(success ? (byte)0x01 : (byte)0x00);
            payload.AddRange(Sha(result ?? System.Array.Empty<byte>()));
            payload.AddRange(Sha(System.Text.Encoding.UTF8.GetBytes(error ?? "")));
            payload.AddRange(scriptHashLe);
            payload.Add((byte)(network & 0xFF));
            payload.Add((byte)((network >> 8) & 0xFF));
            payload.Add((byte)((network >> 16) & 0xFF));
            payload.Add((byte)((network >> 24) & 0xFF));
            return Sha(payload.ToArray());
        }

        // Mirrors the contract's ToUInt256Bytes: big-endian 32-byte encoding.
        private static byte[] ToUInt256BE(BigInteger value)
        {
            byte[] raw = value.ToByteArray(); // little-endian, two's complement
            byte[] outp = new byte[32];
            for (int i = 0; i < raw.Length && i < 32; i++) outp[31 - i] = raw[i];
            return outp;
        }
    }
}
