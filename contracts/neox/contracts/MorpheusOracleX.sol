// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOracleResultCallback {
    function onOracleResult(uint256 requestId, string calldata requestType, bool success, bytes calldata result, string calldata error) external;
}

contract MorpheusOracleX {
    enum OracleRequestStatus { Pending, Fulfilled, Failed }

    uint256 private constant MAX_REQUEST_TYPE_LENGTH = 64;
    uint256 private constant MAX_CALLBACK_METHOD_LENGTH = 64;
    uint256 private constant MAX_PAYLOAD_LENGTH = 4096;
    uint256 private constant MAX_RESULT_LENGTH = 4096;
    uint256 private constant MAX_ERROR_LENGTH = 256;
    uint256 private constant MAX_ORACLE_KEY_ALGO_LENGTH = 64;
    uint256 private constant MAX_ORACLE_KEY_LENGTH = 2048;

    struct OracleRequest {
        uint256 id;
        string requestType;
        bytes payload;
        address callbackContract;
        string callbackMethod;
        address requester;
        OracleRequestStatus status;
        uint64 createdAt;
        uint64 fulfilledAt;
        bool success;
        bytes result;
        string error;
    }

    address public admin;
    address public updater;
    string public oracleEncryptionAlgorithm;
    string public oracleEncryptionPublicKey;
    uint256 public oracleEncryptionKeyVersion;
    uint256 public totalRequests;
    uint256 public totalFulfilled;
    uint256 public requestCounter;

    mapping(address => bool) public allowedCallbacks;
    mapping(uint256 => OracleRequest) public requests;
    mapping(bytes32 => uint256) public typeRequests;
    mapping(bytes32 => uint256) public typeFulfilled;

    event OracleRequested(uint256 indexed requestId, string requestType, address indexed requester, address indexed callbackContract, string callbackMethod, bytes payload);
    event OracleFulfilled(uint256 indexed requestId, string requestType, bool success, bytes32 resultHash, uint256 resultSize, string error);
    event CallbackAdded(address indexed callbackContract);
    event CallbackRemoved(address indexed callbackContract);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event UpdaterChanged(address indexed oldUpdater, address indexed newUpdater);
    event OracleEncryptionKeyUpdated(uint256 indexed version, string algorithm, string publicKey);

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

    function setOracleEncryptionKey(string calldata algorithm, string calldata publicKey) external onlyAdmin {
        require(bytes(algorithm).length > 0, "algorithm required");
        require(bytes(publicKey).length > 0, "public key required");
        require(bytes(algorithm).length <= MAX_ORACLE_KEY_ALGO_LENGTH, "algorithm too long");
        require(bytes(publicKey).length <= MAX_ORACLE_KEY_LENGTH, "public key too long");
        oracleEncryptionAlgorithm = algorithm;
        oracleEncryptionPublicKey = publicKey;
        oracleEncryptionKeyVersion += 1;
        emit OracleEncryptionKeyUpdated(oracleEncryptionKeyVersion, algorithm, publicKey);
    }

    function addAllowedCallback(address callbackContract) external onlyAdmin {
        require(callbackContract != address(0), "invalid callback");
        allowedCallbacks[callbackContract] = true;
        emit CallbackAdded(callbackContract);
    }

    function removeAllowedCallback(address callbackContract) external onlyAdmin {
        delete allowedCallbacks[callbackContract];
        emit CallbackRemoved(callbackContract);
    }

    function request(string calldata requestType, bytes calldata payload, address callbackContract, string calldata callbackMethod) external returns (uint256 requestId) {
        require(bytes(requestType).length > 0, "request type required");
        require(bytes(requestType).length <= MAX_REQUEST_TYPE_LENGTH, "request type too long");
        require(callbackContract != address(0), "callback required");
        require(bytes(callbackMethod).length > 0, "callback method required");
        require(bytes(callbackMethod).length <= MAX_CALLBACK_METHOD_LENGTH, "callback method too long");
        require(payload.length <= MAX_PAYLOAD_LENGTH, "payload too large");
        require(allowedCallbacks[callbackContract], "callback not allowed");
        require(keccak256(bytes(callbackMethod)) == keccak256(bytes("onOracleResult")), "unsupported callback method");

        requestId = ++requestCounter;
        requests[requestId] = OracleRequest({
            id: requestId,
            requestType: requestType,
            payload: payload,
            callbackContract: callbackContract,
            callbackMethod: callbackMethod,
            requester: msg.sender,
            status: OracleRequestStatus.Pending,
            createdAt: uint64(block.timestamp),
            fulfilledAt: 0,
            success: false,
            result: "",
            error: ""
        });

        totalRequests += 1;
        typeRequests[keccak256(bytes(requestType))] += 1;
        emit OracleRequested(requestId, requestType, msg.sender, callbackContract, callbackMethod, payload);
    }

    function fulfillRequest(uint256 requestId, bool success, bytes calldata result, string calldata error) external onlyUpdater {
        OracleRequest storage req = requests[requestId];
        require(req.id != 0, "request not found");
        require(req.status == OracleRequestStatus.Pending, "already fulfilled");
        require(allowedCallbacks[req.callbackContract], "callback not allowed");
        require(result.length <= MAX_RESULT_LENGTH, "result too large");
        require(bytes(error).length <= MAX_ERROR_LENGTH, "error too large");

        req.status = success ? OracleRequestStatus.Fulfilled : OracleRequestStatus.Failed;
        req.fulfilledAt = uint64(block.timestamp);
        req.success = success;
        req.result = result;
        req.error = error;

        totalFulfilled += 1;
        typeFulfilled[keccak256(bytes(req.requestType))] += 1;

        try IOracleResultCallback(req.callbackContract).onOracleResult(requestId, req.requestType, success, result, error) {
        } catch {
            req.status = OracleRequestStatus.Failed;
            req.success = false;
            if (bytes(req.error).length == 0) {
                req.error = "callback execution failed";
            }
        }

        emit OracleFulfilled(requestId, req.requestType, req.success, sha256(req.result), req.result.length, req.error);
    }

    function getTypeRequests(string calldata requestType) external view returns (uint256) {
        return typeRequests[keccak256(bytes(requestType))];
    }

    function getTypeFulfilled(string calldata requestType) external view returns (uint256) {
        return typeFulfilled[keccak256(bytes(requestType))];
    }
}
