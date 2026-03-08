using Xunit;

namespace MorpheusOracle.Contracts.Tests
{
    public class MorpheusDataFeedTest
    {
        [Fact]
        public void MorpheusDataFeedExposesExpectedApi()
        {
            string code = ContractSourceAssertions.ReadSource(
                "contracts",
                "MorpheusDataFeed",
                "MorpheusDataFeed.cs");

            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "UpdateFeed");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "FeedRecord", "GetLatest");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "SetUpdater");
            Assert.Contains("FeedUpdated", code);
        }
    }
}
