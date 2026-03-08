using Xunit;

namespace MorpheusOracle.Contracts.Tests
{
    public class OracleCallbackConsumerTest
    {
        [Fact]
        public void ConsumerExposesExpectedCallbackApi()
        {
            string code = ContractSourceAssertions.ReadSource(
                "contracts",
                "OracleCallbackConsumer",
                "OracleCallbackConsumer.cs");

            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "SetOracle");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "OnOracleResult");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "object[]", "GetCallback");
            Assert.Contains("OracleCallbackReceived", code);
        }
    }
}
