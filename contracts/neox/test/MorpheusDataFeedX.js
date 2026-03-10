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
    await feed.connect(updater).updateFeed("NEO-USD", 1, 123456789n, 1000, ethers.ZeroHash, 1);
    await feed.connect(updater).updateFeed("BINANCE:NEO-USD", 2, 123556789n, 1015, ethers.ZeroHash, 2);

    const latest = await feed.getLatest("NEO-USD");
    expect(latest.roundId).to.equal(1n);
    expect(latest.price).to.equal(123456789n);

    expect(await feed.getPairCount()).to.equal(2n);
    expect(await feed.getPairByIndex(0)).to.equal("NEO-USD");
    expect(await feed.getPairByIndex(1)).to.equal("BINANCE:NEO-USD");
    expect(await feed.getAllPairs()).to.deep.equal(["NEO-USD", "BINANCE:NEO-USD"]);

    const records = await feed.getAllFeedRecords();
    expect(records).to.have.length(2);
    expect(records[1].pair).to.equal("BINANCE:NEO-USD");
    expect(records[1].sourceSetId).to.equal(2n);
  });

  it("updates multiple feed pairs in one batch", async function () {
    const [, updater] = await ethers.getSigners();
    const Feed = await ethers.getContractFactory("MorpheusDataFeedX");
    const feed = await Feed.deploy();
    await feed.waitForDeployment();
    await feed.setUpdater(await updater.getAddress());

    await feed.connect(updater).updateFeeds(
      ["TWELVEDATA:NEO-USD", "TWELVEDATA:GAS-USD"],
      [1, 2],
      [248, 555],
      [1000, 1001],
      [ethers.ZeroHash, ethers.ZeroHash],
      [1, 1],
    );

    const neo = await feed.getLatest("TWELVEDATA:NEO-USD");
    const gas = await feed.getLatest("TWELVEDATA:GAS-USD");
    expect(neo.price).to.equal(248n);
    expect(gas.price).to.equal(555n);
    expect(await feed.getPairCount()).to.equal(2n);
  });
});
