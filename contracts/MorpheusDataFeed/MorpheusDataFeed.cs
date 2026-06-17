using System.ComponentModel;
using System.Numerics;
using Neo;
using Neo.SmartContract;
using Neo.SmartContract.Framework;
using Neo.SmartContract.Framework.Attributes;
using Neo.SmartContract.Framework.Native;
using Neo.SmartContract.Framework.Services;

namespace MorpheusOracle.Contracts
{
    public delegate void FeedUpdatedHandler(string pair, BigInteger roundId, BigInteger price, BigInteger timestamp, ByteString attestationHash, BigInteger sourceSetId);
    public delegate void AdminChangedHandler(UInt160 oldAdmin, UInt160 newAdmin);
    public delegate void UpdaterChangedHandler(UInt160 oldUpdater, UInt160 newUpdater);
    public delegate void VerificationKeyChangedHandler(ECPoint oldKey, ECPoint newKey);

    /// <summary>
    /// On-chain synchronized storage for Morpheus shared numeric resources.
    /// </summary>
    /// <remarks>
    /// Price feeds remain the primary built-in use case, but the registry is intentionally generic
    /// enough for any operator-maintained numeric resource snapshots that multiple miniapps can
    /// compose over without deploying dedicated storage contracts.
    /// </remarks>
    [DisplayName("MorpheusDataFeed")]
    [ManifestExtra("Author", "Morpheus Oracle")]
    [ManifestExtra("Version", "2.0.0")]
    [ManifestExtra("Description", "Shared numeric resource registry for the Morpheus MiniApp OS")]
    public class MorpheusDataFeed : SmartContract
    {
        private static readonly byte[] PREFIX_ADMIN = new byte[] { 0x01 };
        private static readonly byte[] PREFIX_UPDATER = new byte[] { 0x02 };
        private static readonly byte[] PREFIX_FEED = new byte[] { 0x03 };
        private static readonly byte[] PREFIX_PAIR_INDEX = new byte[] { 0x04 };
        private static readonly byte[] PREFIX_PAIR_COUNT = new byte[] { 0x05 };
        private static readonly byte[] PREFIX_VERIFICATION_KEY = new byte[] { 0x06 };

        [DisplayName("FeedUpdated")]
        public static event FeedUpdatedHandler OnFeedUpdated;

        [DisplayName("AdminChanged")]
        public static event AdminChangedHandler OnAdminChanged;

        [DisplayName("UpdaterChanged")]
        public static event UpdaterChangedHandler OnUpdaterChanged;

        [DisplayName("VerificationKeyChanged")]
        public static event VerificationKeyChangedHandler OnVerificationKeyChanged;

        public struct FeedRecord
        {
            public string Pair;
            public BigInteger RoundId;
            public BigInteger Price;
            public BigInteger Timestamp;
            public ByteString AttestationHash;
            public BigInteger SourceSetId;
        }

        public static void _deploy(object data, bool update)
        {
            if (update) return;
            Transaction tx = Runtime.Transaction;
            Storage.Put(Storage.CurrentContext, PREFIX_ADMIN, tx.Sender);
        }

        [Safe]
        public static UInt160 Admin() => (UInt160)Storage.Get(Storage.CurrentContext, PREFIX_ADMIN);

        [Safe]
        public static UInt160 Updater() => (UInt160)Storage.Get(Storage.CurrentContext, PREFIX_UPDATER);

        /// <summary>
        /// The optional ECDSA public key used to verify off-chain price signatures.
        /// </summary>
        /// <remarks>
        /// Returns null when unset, which is the default. While unset every write is
        /// gated by the updater witness only (the original behavior). Once an admin
        /// registers a key, a write that carries a signature is additionally checked
        /// against this key, so a leaked updater witness alone no longer suffices to
        /// anchor an arbitrary price.
        /// </remarks>
        [Safe]
        public static ECPoint OracleVerificationKey()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_VERIFICATION_KEY);
            return raw == null ? null : (ECPoint)(byte[])raw;
        }

        private static void ValidateAdmin()
        {
            UInt160 admin = Admin();
            ExecutionEngine.Assert(admin != null && admin.IsValid, "admin not set");
            ExecutionEngine.Assert(Runtime.CheckWitness(admin), "unauthorized");
        }

        private static void ValidateUpdater()
        {
            UInt160 updater = Updater();
            ExecutionEngine.Assert(updater != null && updater.IsValid, "updater not set");
            ExecutionEngine.Assert(Runtime.CheckWitness(updater), "unauthorized");
        }

        public static void SetAdmin(UInt160 newAdmin)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(newAdmin != null && newAdmin.IsValid, "invalid admin");
            UInt160 oldAdmin = Admin();
            Storage.Put(Storage.CurrentContext, PREFIX_ADMIN, newAdmin);
            OnAdminChanged(oldAdmin, newAdmin);
        }

        public static void SetUpdater(UInt160 updater)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(updater != null && updater.IsValid, "invalid updater");
            UInt160 oldUpdater = Updater();
            Storage.Put(Storage.CurrentContext, PREFIX_UPDATER, updater);
            OnUpdaterChanged(oldUpdater, updater);
        }

        /// <summary>
        /// Registers (or rotates) the ECDSA public key used to verify off-chain price
        /// signatures. Admin-only. Registering a key opts the feed into signature
        /// verification for any signed write; until then writes stay updater-witness
        /// only.
        /// </summary>
        public static void SetOracleVerificationKey(ECPoint publicKey)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(publicKey != null && publicKey.IsValid, "invalid verification key");
            ECPoint oldKey = OracleVerificationKey();
            Storage.Put(Storage.CurrentContext, PREFIX_VERIFICATION_KEY, (byte[])publicKey);
            OnVerificationKeyChanged(oldKey, publicKey);
        }

        /// <summary>
        /// Clears the verification key, reverting the feed to updater-witness-only
        /// writes. Admin-only escape hatch (e.g. if the off-chain signer key is lost
        /// before a replacement is provisioned).
        /// </summary>
        public static void ClearOracleVerificationKey()
        {
            ValidateAdmin();
            ECPoint oldKey = OracleVerificationKey();
            Storage.Delete(Storage.CurrentContext, PREFIX_VERIFICATION_KEY);
            OnVerificationKeyChanged(oldKey, null);
        }

        private static StorageMap FeedMap() => new StorageMap(Storage.CurrentContext, PREFIX_FEED);
        private static StorageMap PairIndexMap() => new StorageMap(Storage.CurrentContext, PREFIX_PAIR_INDEX);

        [Safe]
        public static BigInteger GetPairCount()
        {
            ByteString raw = Storage.Get(Storage.CurrentContext, PREFIX_PAIR_COUNT);
            return raw == null ? 0 : (BigInteger)raw;
        }

        private static void IndexPairIfNeeded(string pair)
        {
            ByteString existing = FeedMap().Get(pair);
            if (existing != null) return;

            BigInteger count = GetPairCount();
            PairIndexMap().Put(count.ToByteArray(), pair);
            Storage.Put(Storage.CurrentContext, PREFIX_PAIR_COUNT, count + 1);
        }

        /// <summary>
        /// Canonical price message a signature is verified over: the symbol, price,
        /// timestamp, and round joined by '|' (e.g. "BTC-USD|5000000000|1700000000|7").
        /// The off-chain signer must reproduce these exact bytes when a verification
        /// key is registered.
        /// </summary>
        private static ByteString BuildFeedMessage(string pair, BigInteger price, BigInteger timestamp, BigInteger roundId)
        {
            ByteString message = Helper.Concat((ByteString)pair, (ByteString)"|");
            message = Helper.Concat(message, (ByteString)StdLib.Itoa(price, 10));
            message = Helper.Concat(message, (ByteString)"|");
            message = Helper.Concat(message, (ByteString)StdLib.Itoa(timestamp, 10));
            message = Helper.Concat(message, (ByteString)"|");
            message = Helper.Concat(message, (ByteString)StdLib.Itoa(roundId, 10));
            return message;
        }

        /// <summary>
        /// Optional second factor on top of the updater witness. Inert by default:
        /// only runs when an admin has registered a verification key AND the write
        /// carries a non-empty signature. When active it rejects the write unless the
        /// signature verifies over the canonical price message (symbol|price|timestamp|round).
        /// </summary>
        private static void VerifyFeedSignature(string pair, BigInteger roundId, BigInteger price, BigInteger timestamp, ByteString signature)
        {
            ECPoint verificationKey = OracleVerificationKey();
            if (verificationKey == null) return;
            if (signature == null || signature.Length == 0) return;

            ByteString message = BuildFeedMessage(pair, price, timestamp, roundId);
            ExecutionEngine.Assert(
                CryptoLib.VerifyWithECDsa(message, verificationKey, signature, NamedCurveHash.secp256r1SHA256),
                "invalid feed signature"
            );
        }

        private static void UpdateFeedInternal(string pair, BigInteger roundId, BigInteger price, BigInteger timestamp, ByteString attestationHash, BigInteger sourceSetId, ByteString signature)
        {
            ExecutionEngine.Assert(pair != null && pair.Length > 0, "pair required");
            ExecutionEngine.Assert(roundId >= 0, "invalid round");
            ExecutionEngine.Assert(price >= 0, "invalid price");
            ExecutionEngine.Assert(timestamp >= 0, "invalid timestamp");
            ExecutionEngine.Assert(sourceSetId >= 0, "invalid source set");
            ExecutionEngine.Assert(attestationHash == null || attestationHash.Length <= 32, "attestation hash too long");

            VerifyFeedSignature(pair, roundId, price, timestamp, signature);

            ByteString existingRaw = FeedMap().Get(pair);
            if (existingRaw != null)
            {
                FeedRecord existing = GetLatest(pair);
                ExecutionEngine.Assert(roundId > existing.RoundId, "stale round");
                ExecutionEngine.Assert(timestamp >= existing.Timestamp, "stale timestamp");
            }

            IndexPairIfNeeded(pair);

            FeedRecord record = new FeedRecord
            {
                Pair = pair,
                RoundId = roundId,
                Price = price,
                Timestamp = timestamp,
                AttestationHash = attestationHash ?? (ByteString)"",
                SourceSetId = sourceSetId
            };

            FeedMap().Put(pair, StdLib.Serialize(record));
            OnFeedUpdated(pair, roundId, price, timestamp, record.AttestationHash, sourceSetId);
        }

        [Safe]
        public static string GetPairByIndex(BigInteger index)
        {
            ExecutionEngine.Assert(index >= 0, "invalid index");
            ByteString raw = PairIndexMap().Get(index.ToByteArray());
            return raw == null ? "" : (string)raw;
        }

        [Safe]
        public static string[] GetAllPairs()
        {
            int count = (int)GetPairCount();
            string[] pairs = new string[count];
            for (int index = 0; index < count; index++)
            {
                pairs[index] = GetPairByIndex(index);
            }
            return pairs;
        }

        /// <summary>
        /// Writes or overwrites a single feed record.
        /// </summary>
        public static void UpdateFeed(string pair, BigInteger roundId, BigInteger price, BigInteger timestamp, ByteString attestationHash, BigInteger sourceSetId)
        {
            ValidateUpdater();
            UpdateFeedInternal(pair, roundId, price, timestamp, attestationHash, sourceSetId, null);
        }

        /// <summary>
        /// Writes a single feed record carrying an off-chain ECDSA signature over the
        /// canonical price message (symbol|price|timestamp|round). Behaves identically
        /// to <see cref="UpdateFeed"/> while no verification key is registered; once a
        /// key is registered the signature is required to verify against it. This is
        /// the backward-compatible signed write path: the original 6-parameter
        /// <see cref="UpdateFeed"/> ABI is unchanged so existing publishers keep working.
        /// </summary>
        public static void UpdateFeedSigned(string pair, BigInteger roundId, BigInteger price, BigInteger timestamp, ByteString attestationHash, BigInteger sourceSetId, ByteString signature)
        {
            ValidateUpdater();
            UpdateFeedInternal(pair, roundId, price, timestamp, attestationHash, sourceSetId, signature);
        }

        /// <summary>
        /// Audit fix (feed-stall recovery): admin-only forced feed write that BYPASSES the
        /// roundId/timestamp monotonicity guard in UpdateFeedInternal. That guard rejects
        /// stale/replayed updates, but a single bad publish (a far-future timestamp or an
        /// oversized roundId) would otherwise permanently reject every subsequent legitimate
        /// update and stall the feed. This admin-gated escape hatch resets a stalled feed to a
        /// sane round/timestamp. It is restricted to the admin so producers cannot abuse it to
        /// rewind/replay prices.
        /// </summary>
        public static void AdminResetFeed(string pair, BigInteger roundId, BigInteger price, BigInteger timestamp, ByteString attestationHash, BigInteger sourceSetId)
        {
            ValidateAdmin();
            ExecutionEngine.Assert(pair != null && pair.Length > 0, "pair required");
            ExecutionEngine.Assert(roundId >= 0, "invalid round");
            ExecutionEngine.Assert(price >= 0, "invalid price");
            ExecutionEngine.Assert(timestamp >= 0, "invalid timestamp");
            ExecutionEngine.Assert(sourceSetId >= 0, "invalid source set");
            ExecutionEngine.Assert(attestationHash == null || attestationHash.Length <= 32, "attestation hash too long");

            IndexPairIfNeeded(pair);
            FeedRecord record = new FeedRecord
            {
                Pair = pair,
                RoundId = roundId,
                Price = price,
                Timestamp = timestamp,
                AttestationHash = attestationHash ?? (ByteString)"",
                SourceSetId = sourceSetId
            };
            FeedMap().Put(pair, StdLib.Serialize(record));
            OnFeedUpdated(pair, roundId, price, timestamp, record.AttestationHash, sourceSetId);
        }

        /// <summary>
        /// Generic alias for shared numeric resources.
        /// </summary>
        public static void UpdateResource(string resourceId, BigInteger version, BigInteger value, BigInteger timestamp, ByteString attestationHash, BigInteger sourceSetId)
        {
            UpdateFeed(resourceId, version, value, timestamp, attestationHash, sourceSetId);
        }

        /// <summary>
        /// Batch writes multiple feed records in one transaction.
        /// </summary>
        public static void UpdateFeeds(string[] pairs, BigInteger[] roundIds, BigInteger[] prices, BigInteger[] timestamps, ByteString[] attestationHashes, BigInteger[] sourceSetIds)
        {
            ValidateUpdater();
            ExecutionEngine.Assert(pairs != null && pairs.Length > 0, "pairs required");
            ExecutionEngine.Assert(roundIds != null && roundIds.Length == pairs.Length, "roundIds length mismatch");
            ExecutionEngine.Assert(prices != null && prices.Length == pairs.Length, "prices length mismatch");
            ExecutionEngine.Assert(timestamps != null && timestamps.Length == pairs.Length, "timestamps length mismatch");
            ExecutionEngine.Assert(attestationHashes != null && attestationHashes.Length == pairs.Length, "attestationHashes length mismatch");
            ExecutionEngine.Assert(sourceSetIds != null && sourceSetIds.Length == pairs.Length, "sourceSetIds length mismatch");

            for (int index = 0; index < pairs.Length; index++)
            {
                UpdateFeedInternal(
                    pairs[index],
                    roundIds[index],
                    prices[index],
                    timestamps[index],
                    attestationHashes[index],
                    sourceSetIds[index],
                    null
                );
            }
        }

        /// <summary>
        /// Generic batch alias for shared numeric resources.
        /// </summary>
        public static void UpdateResources(string[] resourceIds, BigInteger[] versions, BigInteger[] values, BigInteger[] timestamps, ByteString[] attestationHashes, BigInteger[] sourceSetIds)
        {
            UpdateFeeds(resourceIds, versions, values, timestamps, attestationHashes, sourceSetIds);
        }

        [Safe]
        public static FeedRecord GetLatest(string pair)
        {
            ByteString raw = FeedMap().Get(pair);
            if (raw == null)
            {
                return new FeedRecord { Pair = pair, RoundId = 0, Price = 0, Timestamp = 0, AttestationHash = (ByteString)"", SourceSetId = 0 };
            }
            return (FeedRecord)StdLib.Deserialize(raw);
        }

        [Safe]
        public static FeedRecord GetResource(string resourceId)
        {
            return GetLatest(resourceId);
        }

        [Safe]
        public static FeedRecord[] GetAllFeedRecords()
        {
            string[] pairs = GetAllPairs();
            FeedRecord[] records = new FeedRecord[pairs.Length];
            for (int index = 0; index < pairs.Length; index++)
            {
                records[index] = GetLatest(pairs[index]);
            }
            return records;
        }

        [Safe]
        public static FeedRecord[] GetAllResources()
        {
            return GetAllFeedRecords();
        }

        public static void Update(ByteString nefFile, string manifest)
        {
            ValidateAdmin();
            ContractManagement.Update(nefFile, manifest, null);
        }
    }
}
