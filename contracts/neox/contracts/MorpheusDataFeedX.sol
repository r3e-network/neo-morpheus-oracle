// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MorpheusDataFeedX {
    address public admin;
    address public updater;

    struct FeedRecord {
        string pair;
        uint256 roundId;
        uint256 price;
        uint256 timestamp;
        bytes32 attestationHash;
        uint256 sourceSetId;
    }

    mapping(bytes32 => FeedRecord) private latestFeed;
    mapping(bytes32 => bool) private knownPairs;
    string[] private pairOrder;

    event FeedUpdated(string pair, uint256 roundId, uint256 price, uint256 timestamp, bytes32 attestationHash, uint256 sourceSetId);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event UpdaterChanged(address indexed oldUpdater, address indexed newUpdater);

    modifier onlyAdmin() {
        require(msg.sender == admin, "admin only");
        _;
    }

    modifier onlyUpdater() {
        require(msg.sender == updater, "updater only");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "invalid admin");
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminChanged(oldAdmin, newAdmin);
    }

    function setUpdater(address newUpdater) external onlyAdmin {
        require(newUpdater != address(0), "invalid updater");
        address oldUpdater = updater;
        updater = newUpdater;
        emit UpdaterChanged(oldUpdater, newUpdater);
    }

    function updateFeed(string calldata pair, uint256 roundId, uint256 price, uint256 timestamp, bytes32 attestationHash, uint256 sourceSetId) external onlyUpdater {
        require(bytes(pair).length > 0, "pair required");
        bytes32 key = keccak256(bytes(pair));
        if (!knownPairs[key]) {
            knownPairs[key] = true;
            pairOrder.push(pair);
        }
        latestFeed[key] = FeedRecord({
            pair: pair,
            roundId: roundId,
            price: price,
            timestamp: timestamp,
            attestationHash: attestationHash,
            sourceSetId: sourceSetId
        });
        emit FeedUpdated(pair, roundId, price, timestamp, attestationHash, sourceSetId);
    }

    function getLatest(string calldata pair) external view returns (FeedRecord memory) {
        FeedRecord memory record = latestFeed[keccak256(bytes(pair))];
        if (bytes(record.pair).length == 0) {
            return FeedRecord({
                pair: pair,
                roundId: 0,
                price: 0,
                timestamp: 0,
                attestationHash: bytes32(0),
                sourceSetId: 0
            });
        }
        return record;
    }

    function getPairCount() external view returns (uint256) {
        return pairOrder.length;
    }

    function getPairByIndex(uint256 index) external view returns (string memory) {
        require(index < pairOrder.length, "index out of bounds");
        return pairOrder[index];
    }

    function getAllPairs() external view returns (string[] memory) {
        return pairOrder;
    }

    function getAllFeedRecords() external view returns (FeedRecord[] memory) {
        FeedRecord[] memory records = new FeedRecord[](pairOrder.length);
        for (uint256 index = 0; index < pairOrder.length; index += 1) {
            records[index] = latestFeed[keccak256(bytes(pairOrder[index]))];
        }
        return records;
    }
}
