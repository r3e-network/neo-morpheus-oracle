const { expect } = require("chai");

describe("MorpheusOracleX", function () {
  function computeFulfillmentDigest(requestId, requestType, success, result, error) {
    return ethers.sha256(ethers.concat([
      ethers.toUtf8Bytes("morpheus-fulfillment-v2"),
      ethers.zeroPadValue(ethers.toBeHex(requestId), 32),
      ethers.getBytes(ethers.sha256(ethers.toUtf8Bytes(requestType))),
      success ? "0x01" : "0x00",
      ethers.getBytes(ethers.sha256(result)),
      ethers.getBytes(ethers.sha256(ethers.toUtf8Bytes(error))),
    ]));
  }

  it("rejects oversized request metadata and oracle key inputs", async function () {
    const [admin, requester] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("MorpheusOracleX");
    const Consumer = await ethers.getContractFactory("OracleCallbackConsumerX");

    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    const consumer = await Consumer.deploy();
    await consumer.waitForDeployment();
    const requestFee = await oracle.requestFee();

    await oracle.addAllowedCallback(await consumer.getAddress());

    await expect(
      oracle.setOracleEncryptionKey("a".repeat(65), "pk")
    ).to.be.revertedWith("algorithm too long");
    await expect(
      oracle.setOracleEncryptionKey("RSA", "p".repeat(2049))
    ).to.be.revertedWith("public key too long");
    await expect(
      oracle.connect(requester).request("x".repeat(65), "0x1234", await consumer.getAddress(), "onOracleResult", { value: requestFee })
    ).to.be.revertedWith("request type too long");
    await expect(
      oracle.connect(requester).request("oracle", "0x1234", await consumer.getAddress(), "m".repeat(65), { value: requestFee })
    ).to.be.revertedWith("callback method too long");
    await expect(
      oracle.connect(requester).request("oracle", `0x${"11".repeat(4097)}`, await consumer.getAddress(), "onOracleResult", { value: requestFee })
    ).to.be.revertedWith("payload too large");
  });

  it("requires the exact request fee and allows fee withdrawal", async function () {
    const [admin, requester] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("MorpheusOracleX");
    const Consumer = await ethers.getContractFactory("OracleCallbackConsumerX");

    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    const consumer = await Consumer.deploy();
    await consumer.waitForDeployment();

    await oracle.addAllowedCallback(await consumer.getAddress());
    const requestFee = await oracle.requestFee();

    await expect(
      oracle.connect(requester).request("oracle", "0x1234", await consumer.getAddress(), "onOracleResult")
    ).to.be.revertedWith("request fee not paid");

    await expect(
      oracle.connect(requester).request("oracle", "0x1234", await consumer.getAddress(), "onOracleResult", { value: requestFee - 1n })
    ).to.be.revertedWith("incorrect request fee");

    await oracle.connect(requester).request("oracle", "0x1234", await consumer.getAddress(), "onOracleResult", { value: requestFee });
    expect(await oracle.accruedFees()).to.equal(requestFee);

    await expect(
      oracle.withdrawAccruedFees(ethers.ZeroAddress, requestFee)
    ).to.be.revertedWith("invalid recipient");

    await expect(
      oracle.connect(requester).withdrawAccruedFees(await requester.getAddress(), requestFee)
    ).to.be.revertedWith("admin only");

    await expect(
      oracle.withdrawAccruedFees(await admin.getAddress(), requestFee + 1n)
    ).to.be.revertedWith("insufficient accrued fees");

    const before = await ethers.provider.getBalance(await admin.getAddress());
    const tx = await oracle.withdrawAccruedFees(await admin.getAddress(), requestFee);
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;
    const after = await ethers.provider.getBalance(await admin.getAddress());
    expect(await oracle.accruedFees()).to.equal(0n);
    expect(after).to.equal(before + requestFee - gasCost);
  });

  it("supports prepaid fee credits and updater-queued automation requests", async function () {
    const [admin, updater, requester] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("MorpheusOracleX");
    const Consumer = await ethers.getContractFactory("OracleCallbackConsumerX");

    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    const consumer = await Consumer.deploy();
    await consumer.waitForDeployment();

    await oracle.addAllowedCallback(await consumer.getAddress());
    await oracle.setUpdater(await updater.getAddress());
    const requestFee = await oracle.requestFee();

    await expect(
      oracle.connect(updater).queueAutomationRequest(await requester.getAddress(), "oracle", "0x1234", await consumer.getAddress(), "onOracleResult")
    ).to.be.revertedWith("request fee not paid");

    await oracle.connect(requester).depositFeeCredit(await requester.getAddress(), { value: requestFee });
    expect(await oracle.feeCredits(await requester.getAddress())).to.equal(requestFee);

    await oracle.connect(updater).queueAutomationRequest(await requester.getAddress(), "oracle", "0x1234", await consumer.getAddress(), "onOracleResult");
    const stored = await oracle.requests(1);
    expect(stored.requester).to.equal(await requester.getAddress());
    expect(stored.requestType).to.equal("oracle");
    expect(await oracle.feeCredits(await requester.getAddress())).to.equal(0n);
  });

  it("stores requests and fulfills callbacks", async function () {
    const [admin, updater, requester, verifier] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("MorpheusOracleX");
    const Consumer = await ethers.getContractFactory("OracleCallbackConsumerX");

    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    const consumer = await Consumer.deploy();
    await consumer.waitForDeployment();

    await oracle.addAllowedCallback(await consumer.getAddress());
    await consumer.setOracle(await oracle.getAddress());
    await oracle.setUpdater(await updater.getAddress());
    await oracle.setOracleVerifier(await verifier.getAddress());
    const requestFee = await oracle.requestFee();

    await oracle.connect(requester).request("oracle", "0x1234", await consumer.getAddress(), "onOracleResult", { value: requestFee });
    const result = "0xabcd";
    const digest = computeFulfillmentDigest(1n, "oracle", true, result, "");
    const signature = await verifier.signMessage(ethers.getBytes(digest));
    await oracle.connect(updater).fulfillRequest(1, true, result, "", signature);

    const stored = await oracle.requests(1);
    expect(stored.success).to.equal(true);
    const callback = await consumer.callbacks(1);
    expect(callback.success).to.equal(true);
  });

  it("rejects invalid worker verification signatures", async function () {
    const [admin, updater, requester, verifier, attacker] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("MorpheusOracleX");
    const Consumer = await ethers.getContractFactory("OracleCallbackConsumerX");

    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    const consumer = await Consumer.deploy();
    await consumer.waitForDeployment();

    await oracle.addAllowedCallback(await consumer.getAddress());
    await consumer.setOracle(await oracle.getAddress());
    await oracle.setUpdater(await updater.getAddress());
    await oracle.setOracleVerifier(await verifier.getAddress());
    const requestFee = await oracle.requestFee();

    await oracle.connect(requester).request("oracle", "0x1234", await consumer.getAddress(), "onOracleResult", { value: requestFee });
    const result = "0xabcd";
    const digest = computeFulfillmentDigest(1n, "oracle", true, result, "");
    const badSignature = await attacker.signMessage(ethers.getBytes(digest));

    await expect(
      oracle.connect(updater).fulfillRequest(1, true, result, "", badSignature)
    ).to.be.revertedWith("invalid verification signature");
  });

  it("rejects signatures if success or error are tampered after signing", async function () {
    const [admin, updater, requester, verifier] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("MorpheusOracleX");
    const Consumer = await ethers.getContractFactory("OracleCallbackConsumerX");

    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    const consumer = await Consumer.deploy();
    await consumer.waitForDeployment();

    await oracle.addAllowedCallback(await consumer.getAddress());
    await consumer.setOracle(await oracle.getAddress());
    await oracle.setUpdater(await updater.getAddress());
    await oracle.setOracleVerifier(await verifier.getAddress());
    const requestFee = await oracle.requestFee();

    await oracle.connect(requester).request("oracle", "0x1234", await consumer.getAddress(), "onOracleResult", { value: requestFee });
    const result = "0xabcd";
    const digest = computeFulfillmentDigest(1n, "oracle", true, result, "");
    const signature = await verifier.signMessage(ethers.getBytes(digest));

    await expect(
      oracle.connect(updater).fulfillRequest(1, false, result, "tampered", signature)
    ).to.be.revertedWith("invalid verification signature");
  });
});
