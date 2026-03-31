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

            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "UInt160", "Kernel");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "UInt160", "Oracle");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "SetKernel");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "SetOracle");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "OnMiniAppResult");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "OnOracleResult");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "CallbackRecord", "GetCallbackRecord");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "object[]", "GetCallback");
            Assert.Contains("MiniAppResultReceived", code);
            Assert.Contains("KernelChanged", code);
        }
    }
}
