const { expect } = require("chai");

describe("MorpheusOracleX", function () {
  it("rejects oversized request metadata and oracle key inputs", async function () {
    const [admin, requester] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("MorpheusOracleX");
    const Consumer = await ethers.getContractFactory("OracleCallbackConsumerX");

    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    const consumer = await Consumer.deploy();
    await consumer.waitForDeployment();

    await oracle.addAllowedCallback(await consumer.getAddress());

    await expect(
      oracle.setOracleEncryptionKey("a".repeat(65), "pk")
    ).to.be.revertedWith("algorithm too long");
    await expect(
      oracle.setOracleEncryptionKey("RSA", "p".repeat(2049))
    ).to.be.revertedWith("public key too long");
    await expect(
      oracle.connect(requester).request("x".repeat(65), "0x1234", await consumer.getAddress(), "onOracleResult")
    ).to.be.revertedWith("request type too long");
    await expect(
      oracle.connect(requester).request("oracle", "0x1234", await consumer.getAddress(), "m".repeat(65))
    ).to.be.revertedWith("callback method too long");
    await expect(
      oracle.connect(requester).request("oracle", `0x${"11".repeat(4097)}`, await consumer.getAddress(), "onOracleResult")
    ).to.be.revertedWith("payload too large");
  });

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
