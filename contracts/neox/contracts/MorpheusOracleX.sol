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
    uint256 private constant DEFAULT_REQUEST_FEE = 0.01 ether;
    string private constant FULFILLMENT_SIGNATURE_DOMAIN = "morpheus-fulfillment-v2";

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
    address public oracleVerifier;
    string public oracleEncryptionAlgorithm;
    string public oracleEncryptionPublicKey;
    uint256 public oracleEncryptionKeyVersion;
    uint256 public requestFee;
    uint256 public accruedFees;
    uint256 public totalRequests;
    uint256 public totalFulfilled;
    uint256 public requestCounter;
    mapping(address => uint256) public feeCredits;

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
    event OracleVerifierChanged(address indexed oldVerifier, address indexed newVerifier);
    event OracleEncryptionKeyUpdated(uint256 indexed version, string algorithm, string publicKey);
    event RequestFeeUpdated(uint256 indexed oldFee, uint256 indexed newFee);
    event RequestFeePaid(address indexed requester, uint256 indexed requestId, uint256 amount);
    event RequestFeeDeposited(address indexed payer, address indexed beneficiary, uint256 amount, uint256 creditBalance);
    event AccruedFeesWithdrawn(address indexed to, uint256 amount);

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
        requestFee = DEFAULT_REQUEST_FEE;
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

    function setOracleVerifier(address newVerifier) external onlyAdmin {
        require(newVerifier != address(0), "invalid verifier");
        address oldVerifier = oracleVerifier;
        oracleVerifier = newVerifier;
        emit OracleVerifierChanged(oldVerifier, newVerifier);
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

    function setRequestFee(uint256 newFee) external onlyAdmin {
        require(newFee > 0, "invalid request fee");
        uint256 oldFee = requestFee;
        requestFee = newFee;
        emit RequestFeeUpdated(oldFee, newFee);
    }

    function withdrawAccruedFees(address payable to, uint256 amount) external onlyAdmin {
        require(to != address(0), "invalid recipient");
        require(amount > 0, "invalid amount");
        require(accruedFees >= amount, "insufficient accrued fees");
        accruedFees -= amount;
        (bool sent, ) = to.call{ value: amount }("");
        require(sent, "fee transfer failed");
        emit AccruedFeesWithdrawn(to, amount);
    }

    function depositFeeCredit(address beneficiary) external payable {
        require(beneficiary != address(0), "invalid beneficiary");
        require(msg.value > 0, "invalid amount");
        feeCredits[beneficiary] += msg.value;
        emit RequestFeeDeposited(msg.sender, beneficiary, msg.value, feeCredits[beneficiary]);
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

    function request(string calldata requestType, bytes calldata payload, address callbackContract, string calldata callbackMethod) external payable returns (uint256 requestId) {
        requestId = _request(msg.sender, requestType, payload, callbackContract, callbackMethod, msg.value);
    }

    function queueAutomationRequest(address requester, string calldata requestType, bytes calldata payload, address callbackContract, string calldata callbackMethod) external onlyUpdater returns (uint256 requestId) {
        require(requester != address(0), "requester required");
        requestId = _request(requester, requestType, payload, callbackContract, callbackMethod, 0);
    }

    function _request(address requester, string calldata requestType, bytes calldata payload, address callbackContract, string calldata callbackMethod, uint256 paidFee) internal returns (uint256 requestId) {
        require(bytes(requestType).length > 0, "request type required");
        require(bytes(requestType).length <= MAX_REQUEST_TYPE_LENGTH, "request type too long");
        require(callbackContract != address(0), "callback required");
        require(bytes(callbackMethod).length > 0, "callback method required");
        require(bytes(callbackMethod).length <= MAX_CALLBACK_METHOD_LENGTH, "callback method too long");
        require(payload.length <= MAX_PAYLOAD_LENGTH, "payload too large");
        require(allowedCallbacks[callbackContract], "callback not allowed");
        require(keccak256(bytes(callbackMethod)) == keccak256(bytes("onOracleResult")), "unsupported callback method");
        _consumeRequestFee(requester, callbackContract, paidFee);

        requestId = ++requestCounter;
        requests[requestId] = OracleRequest({
            id: requestId,
            requestType: requestType,
            payload: payload,
            callbackContract: callbackContract,
            callbackMethod: callbackMethod,
            requester: requester,
            status: OracleRequestStatus.Pending,
            createdAt: uint64(block.timestamp),
            fulfilledAt: 0,
            success: false,
            result: "",
            error: ""
        });

        totalRequests += 1;
        typeRequests[keccak256(bytes(requestType))] += 1;
        emit RequestFeePaid(requester, requestId, requestFee);
        emit OracleRequested(requestId, requestType, requester, callbackContract, callbackMethod, payload);
    }

    function fulfillRequest(uint256 requestId, bool success, bytes calldata result, string calldata error, bytes calldata verificationSignature) external onlyUpdater {
        OracleRequest storage req = requests[requestId];
        require(req.id != 0, "request not found");
        require(req.status == OracleRequestStatus.Pending, "already fulfilled");
        require(result.length <= MAX_RESULT_LENGTH, "result too large");
        require(bytes(error).length <= MAX_ERROR_LENGTH, "error too large");
        require(oracleVerifier != address(0), "oracle verifier not set");
        bytes32 fulfillmentDigest = _computeFulfillmentDigest(requestId, req.requestType, success, result, error);
        require(_recoverFulfillmentSigner(fulfillmentDigest, verificationSignature) == oracleVerifier, "invalid verification signature");

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

    function _computeFulfillmentDigest(
        uint256 requestId,
        string memory requestType,
        bool success,
        bytes memory result,
        string memory error
    ) internal pure returns (bytes32) {
        return sha256(
            abi.encodePacked(
                bytes(FULFILLMENT_SIGNATURE_DOMAIN),
                bytes32(requestId),
                sha256(bytes(requestType)),
                success ? bytes1(0x01) : bytes1(0x00),
                sha256(result),
                sha256(bytes(error))
            )
        );
    }

    function _recoverFulfillmentSigner(bytes32 fulfillmentDigest, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "invalid verification signature");

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "invalid verification signature");

        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", fulfillmentDigest));
        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0), "invalid verification signature");
        return recovered;
    }

    function _consumeRequestFee(address requester, address callbackContract, uint256 paidFee) internal {
        if (paidFee == requestFee) {
            accruedFees += paidFee;
            return;
        }

        require(paidFee == 0, "incorrect request fee");
        address feePayer = feeCredits[callbackContract] >= requestFee ? callbackContract : requester;
        require(feeCredits[feePayer] >= requestFee, "request fee not paid");
        feeCredits[feePayer] -= requestFee;
        accruedFees += requestFee;
    }

    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits += 1;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
