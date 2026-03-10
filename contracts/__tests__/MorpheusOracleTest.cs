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
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "BigInteger", "RequestFee");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "BigInteger", "FeeCreditOf");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "BigInteger", "AccruedRequestFees");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "SetOracleEncryptionKey");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "SetOracleVerificationPublicKey");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "SetRequestFee");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "WithdrawAccruedFees");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "void", "OnNEP17Payment");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "BigInteger", "Request");
            ContractSourceAssertions.AssertHasPublicStaticMethod(code, "BigInteger", "QueueAutomationRequest");
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
            Assert.Contains("RequestFeeUpdated", code);
            Assert.Contains("RequestFeeDeposited", code);
            Assert.Contains("AccruedFeesWithdrawn", code);
            Assert.Contains("GAS.Transfer", code);
            Assert.Contains("FULFILLMENT_SIGNATURE_DOMAIN", code);
            Assert.Contains("ComputeFulfillmentDigest", code);
        }
    }
}
