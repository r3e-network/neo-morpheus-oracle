const { expect } = require("chai");

describe("MorpheusDataFeedX", function () {
  it("returns a default record with the requested pair when missing", async function () {
    const Feed = await ethers.getContractFactory("MorpheusDataFeedX");
    const feed = await Feed.deploy();
    await feed.waitForDeployment();

    const latest = await feed.getLatest("NEO-USD");
    expect(latest.pair).to.equal("NEO-USD");
    expect(latest.roundId).to.equal(0n);
  });

  it("updates and reads latest feed", async function () {
    const [admin, updater] = await ethers.getSigners();
    const Feed = await ethers.getContractFactory("MorpheusDataFeedX");
    const feed = await Feed.deploy();
    await feed.waitForDeployment();
    await feed.setUpdater(await updater.getAddress());
    await feed.connect(updater).updateFeed("NEO-USD", 1, 123456789n, 1000, ethers.ZeroHash, 0);
    const latest = await feed.getLatest("NEO-USD");
    expect(latest.roundId).to.equal(1n);
    expect(latest.price).to.equal(123456789n);
  });
});
