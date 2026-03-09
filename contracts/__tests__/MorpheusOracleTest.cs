using Xunit;

namespace MorpheusOracle.Contracts.Tests
{
    public class MorpheusOracleTest
    {
        [Fact]
        public void MorpheusOracleExposesExpectedApi()
        {
            string code = ContractSourceAssertions.ReadSource(
                "contracts",
                "MorpheusOracle",
                "MorpheusOracle.cs");

            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "string", "OracleEncryptionAlgorithm");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "string", "OracleEncryptionPublicKey");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "BigInteger", "OracleEncryptionKeyVersion");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "ECPoint", "OracleVerificationPublicKey");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "SetOracleEncryptionKey");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "SetOracleVerificationPublicKey");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "BigInteger", "Request");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "FulfillRequest");
        }

        [Fact]
        public void MorpheusOracleDefinesOracleEvents()
        {
            string code = ContractSourceAssertions.ReadSource(
                "contracts",
                "MorpheusOracle",
                "MorpheusOracle.cs");

            Assert.Contains("OracleRequestedHandler", code);
            Assert.Contains("OracleFulfilledHandler", code);
            Assert.Contains("[DisplayName(\"MorpheusOracle\")]", code);
            Assert.Contains("[DisplayName(\"OracleEncryptionKeyUpdated\")]", code);
            Assert.Contains("[DisplayName(\"OracleVerifierUpdated\")]", code);
        }
    }
}
