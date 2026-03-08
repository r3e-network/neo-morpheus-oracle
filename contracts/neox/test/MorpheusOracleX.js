const { expect } = require("chai");

describe("MorpheusOracleX", function () {
  it("stores requests and fulfills callbacks", async function () {
    const [admin, updater, requester] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("MorpheusOracleX");
    const Consumer = await ethers.getContractFactory("OracleCallbackConsumerX");

    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    const consumer = await Consumer.deploy();
    await consumer.waitForDeployment();

    await oracle.addAllowedCallback(await consumer.getAddress());
    await consumer.setOracle(await oracle.getAddress());
    await oracle.setUpdater(await updater.getAddress());

    await oracle.connect(requester).request("oracle", "0x1234", await consumer.getAddress(), "onOracleResult");
    await oracle.connect(updater).fulfillRequest(1, true, "0xabcd", "");

    const stored = await oracle.requests(1);
    expect(stored.success).to.equal(true);
    const callback = await consumer.callbacks(1);
    expect(callback.success).to.equal(true);
  });
});
