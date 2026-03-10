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

    [DisplayName("MorpheusDataFeed")]
    [ManifestExtra("Author", "Morpheus Oracle")]
    [ManifestExtra("Version", "1.0.0")]
    [ManifestExtra("Description", "Oracle-only datafeed contract for Morpheus Oracle")]
    public class MorpheusDataFeed : SmartContract
    {
        private static readonly byte[] PREFIX_ADMIN = new byte[] { 0x01 };
        private static readonly byte[] PREFIX_UPDATER = new byte[] { 0x02 };
        private static readonly byte[] PREFIX_FEED = new byte[] { 0x03 };
        private static readonly byte[] PREFIX_PAIR_INDEX = new byte[] { 0x04 };
        private static readonly byte[] PREFIX_PAIR_COUNT = new byte[] { 0x05 };

        [DisplayName("FeedUpdated")]
        public static event FeedUpdatedHandler OnFeedUpdated;

        [DisplayName("AdminChanged")]
        public static event AdminChangedHandler OnAdminChanged;

        [DisplayName("UpdaterChanged")]
        public static event UpdaterChangedHandler OnUpdaterChanged;

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

        private static void UpdateFeedInternal(string pair, BigInteger roundId, BigInteger price, BigInteger timestamp, ByteString attestationHash, BigInteger sourceSetId)
        {
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

        public static void UpdateFeed(string pair, BigInteger roundId, BigInteger price, BigInteger timestamp, ByteString attestationHash, BigInteger sourceSetId)
        {
            ValidateUpdater();
            UpdateFeedInternal(pair, roundId, price, timestamp, attestationHash, sourceSetId);
        }

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
                    sourceSetIds[index]
                );
            }
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

        public static void Update(ByteString nefFile, string manifest)
        {
            ValidateAdmin();
            ContractManagement.Update(nefFile, manifest, null);
        }
    }
}
