const { expect } = require("chai");

describe("OracleCallbackConsumerX", function () {
  it("stores callback results from configured oracle", async function () {
    const [admin, oracleSigner] = await ethers.getSigners();
    const Consumer = await ethers.getContractFactory("OracleCallbackConsumerX");
    const consumer = await Consumer.deploy();
    await consumer.waitForDeployment();
    await consumer.setOracle(await oracleSigner.getAddress());
    await consumer.connect(oracleSigner).onOracleResult(1, "oracle", true, "0x1234", "");
    const result = await consumer.callbacks(1);
    expect(result.success).to.equal(true);
    expect(result.requestType).to.equal("oracle");
  });
});
