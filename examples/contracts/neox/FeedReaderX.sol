// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMorpheusDataFeedX {
    struct FeedRecord {
        string pair;
        uint256 roundId;
        uint256 price;
        uint256 timestamp;
        bytes32 attestationHash;
        uint256 sourceSetId;
    }

    function getLatest(string calldata pair) external view returns (FeedRecord memory);
    function getPairCount() external view returns (uint256);
    function getPairByIndex(uint256 index) external view returns (string memory);
}

contract FeedReaderX {
    IMorpheusDataFeedX public immutable feed;

    constructor(address feedAddress) {
        feed = IMorpheusDataFeedX(feedAddress);
    }

    function getNeoUsdFromTwelveData() external view returns (uint256 price, uint256 timestamp, bytes32 attestationHash) {
        IMorpheusDataFeedX.FeedRecord memory record = feed.getLatest("TWELVEDATA:NEO-USD");
        return (record.price, record.timestamp, record.attestationHash);
    }

    function getAllPairs() external view returns (string[] memory pairs) {
        uint256 count = feed.getPairCount();
        pairs = new string[](count);
        for (uint256 i = 0; i < count; i += 1) {
            pairs[i] = feed.getPairByIndex(i);
        }
    }
}
