// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MorpheusOracleEVM
/// @notice EVM (Neo X) oracle kernel mirroring the Neo N3 MorpheusOracle request
/// lifecycle: miniapps (or their callback contracts) submit requests; an off-chain
/// relayer does the work and fulfils them. The fulfilment result is bound to the
/// request + this deployment by an oracle_verifier secp256k1 signature (ecrecover),
/// and the relayer's `updater` address sends the fulfil tx (gas + witness).
contract MorpheusOracleEVM {
    address public owner;
    address public updater;       // sends fulfilRequest (gas payer / witness)
    address public oracleVerifier; // ecrecover target for the result signature

    uint256 public requestFee;     // wei charged per request (0 = free)
    uint256 public accruedFees;
    uint256 private _nextRequestId = 1;

    enum Status { None, Pending, Succeeded, Failed }

    struct Request {
        uint256 id;
        string appId;
        string moduleId;
        string operation;
        bytes payload;
        address requester;
        address callbackContract;
        Status status;
        uint64 createdAt;
        uint64 fulfilledAt;
        bool success;
        bytes result;
        string error;
    }

    struct MiniApp { address admin; address callbackContract; bool active; bool exists; }

    mapping(uint256 => Request) private _requests;
    mapping(bytes32 => bool) private _modules;            // keccak(moduleId) => registered+active
    mapping(string => MiniApp) private _apps;             // appId => app
    mapping(address => string) private _appByCallback;    // callback contract => appId
    mapping(bytes32 => bool) private _grant;              // keccak(appId|moduleId) => granted

    event ModuleRegistered(string moduleId);
    event MiniAppRegistered(string appId, address admin, address callbackContract);
    event ModuleGranted(string appId, string moduleId);
    event RequestQueued(uint256 indexed requestId, string appId, string moduleId, string operation, address requester, address callbackContract, bytes payload);
    event RequestFulfilled(uint256 indexed requestId, bool success, bytes result, string error);
    event UpdaterChanged(address indexed previous, address indexed next);
    event OracleVerifierChanged(address indexed previous, address indexed next);

    error NotOwner();
    error NotUpdater();
    error NotAppAdmin();
    error UnknownModule();
    error ModuleNotGranted();
    error AppInactive();
    error AppExists();
    error AppNotFound();
    error RequestNotPending();
    error BadSignature();
    error FeeNotPaid();
    error OnlyCallbackContract();
    error ZeroAddress();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyUpdater() { if (msg.sender != updater && msg.sender != owner) revert NotUpdater(); _; }

    constructor(address updater_, address oracleVerifier_) {
        owner = msg.sender;
        updater = updater_ == address(0) ? msg.sender : updater_;
        oracleVerifier = oracleVerifier_ == address(0) ? msg.sender : oracleVerifier_;
    }

    // ── admin ──────────────────────────────────────────────────────────────
    function setUpdater(address next) external onlyOwner { if (next == address(0)) revert ZeroAddress(); emit UpdaterChanged(updater, next); updater = next; }
    function setOracleVerifier(address next) external onlyOwner { if (next == address(0)) revert ZeroAddress(); emit OracleVerifierChanged(oracleVerifier, next); oracleVerifier = next; }
    function setOwner(address next) external onlyOwner { if (next == address(0)) revert ZeroAddress(); owner = next; }
    function setRequestFee(uint256 amount) external onlyOwner { requestFee = amount; }
    function withdrawFees(address payable to, uint256 amount) external onlyOwner { require(amount <= accruedFees, "exceeds"); accruedFees -= amount; (bool ok,) = to.call{value: amount}(""); require(ok, "xfer"); }

    function registerModule(string calldata moduleId) external onlyOwner { _modules[keccak256(bytes(moduleId))] = true; emit ModuleRegistered(moduleId); }
    function setModuleActive(string calldata moduleId, bool active) external onlyOwner { _modules[keccak256(bytes(moduleId))] = active; }

    function registerMiniApp(string calldata appId, address admin, address callbackContract) external {
        if (msg.sender != owner && msg.sender != admin) revert NotAppAdmin();
        if (_apps[appId].exists) revert AppExists();
        _apps[appId] = MiniApp({ admin: admin, callbackContract: callbackContract, active: true, exists: true });
        if (callbackContract != address(0)) _appByCallback[callbackContract] = appId;
        emit MiniAppRegistered(appId, admin, callbackContract);
    }

    function grantModule(string calldata appId, string calldata moduleId) external {
        MiniApp storage a = _apps[appId];
        if (!a.exists) revert AppNotFound();
        if (msg.sender != owner && msg.sender != a.admin) revert NotAppAdmin();
        if (!_modules[keccak256(bytes(moduleId))]) revert UnknownModule();
        _grant[keccak256(abi.encodePacked(appId, "|", moduleId))] = true;
        emit ModuleGranted(appId, moduleId);
    }

    // ── request ────────────────────────────────────────────────────────────
    function submitRequest(string calldata appId, string calldata moduleId, string calldata operation, bytes calldata payload)
        external payable returns (uint256)
    {
        return _submit(msg.sender, appId, moduleId, operation, payload);
    }

    /// @notice Contract-mediated submission: a registered app's callback contract
    /// submits on behalf of a requester (the dice-game pattern).
    function requestFromCallback(address requester, string calldata operation, bytes calldata payload)
        external payable returns (uint256)
    {
        string memory appId = _appByCallback[msg.sender];
        MiniApp storage a = _apps[appId];
        if (!a.exists || a.callbackContract != msg.sender) revert OnlyCallbackContract();
        // moduleId == operation for the legacy callback path (relayer routes by operation)
        return _submit(requester, appId, operation, operation, payload);
    }

    function _submit(address requester, string memory appId, string memory moduleId, string memory operation, bytes memory payload)
        internal returns (uint256)
    {
        MiniApp storage a = _apps[appId];
        if (!a.exists) revert AppNotFound();
        if (!a.active) revert AppInactive();
        if (!_modules[keccak256(bytes(moduleId))]) revert UnknownModule();
        if (!_grant[keccak256(abi.encodePacked(appId, "|", moduleId))]) revert ModuleNotGranted();
        if (msg.value < requestFee) revert FeeNotPaid();
        if (requestFee > 0) accruedFees += requestFee;

        uint256 id = _nextRequestId++;
        _requests[id] = Request({
            id: id, appId: appId, moduleId: moduleId, operation: operation, payload: payload,
            requester: requester, callbackContract: a.callbackContract, status: Status.Pending,
            createdAt: uint64(block.timestamp), fulfilledAt: 0, success: false, result: "", error: ""
        });
        emit RequestQueued(id, appId, moduleId, operation, requester, a.callbackContract, payload);
        return id;
    }

    /// @notice Digest the relayer's oracle_verifier signs (bound to this contract + chain).
    function fulfillmentDigest(uint256 requestId, bool success, bytes memory result, string memory error_) public view returns (bytes32) {
        Request storage r = _requests[requestId];
        return keccak256(abi.encode(
            "morpheus-evm-fulfillment-v1", block.chainid, address(this),
            requestId, keccak256(bytes(r.appId)), keccak256(bytes(r.moduleId)), keccak256(bytes(r.operation)),
            success, keccak256(result), keccak256(bytes(error_))
        ));
    }

    function fulfillRequest(uint256 requestId, bool success, bytes calldata result, string calldata error_, bytes calldata signature)
        external onlyUpdater
    {
        Request storage r = _requests[requestId];
        if (r.status != Status.Pending) revert RequestNotPending();
        // verify the result is signed by the oracle verifier (ecrecover over the EIP-191 personal digest)
        bytes32 digest = fulfillmentDigest(requestId, success, result, error_);
        bytes32 ethSigned = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        if (_recover(ethSigned, signature) != oracleVerifier) revert BadSignature();

        r.status = success ? Status.Succeeded : Status.Failed;
        r.fulfilledAt = uint64(block.timestamp);
        r.success = success;
        r.result = result;
        r.error = error_;
        emit RequestFulfilled(requestId, success, result, error_);

        // best-effort callback (never reverts the fulfilment)
        if (r.callbackContract != address(0)) {
            bytes memory cd = abi.encodeWithSignature(
                "onOracleResult(uint256,string,bool,bytes,string)",
                requestId, r.operation, success, result, error_
            );
            (bool ok, ) = r.callbackContract.call(cd);
            ok; // ignored — inbox/result storage is canonical
        }
    }

    // ── reads ──────────────────────────────────────────────────────────────
    function getRequest(uint256 requestId) external view returns (Request memory) { return _requests[requestId]; }
    function totalRequests() external view returns (uint256) { return _nextRequestId - 1; }
    function isModuleGranted(string calldata appId, string calldata moduleId) external view returns (bool) { return _grant[keccak256(abi.encodePacked(appId, "|", moduleId))]; }
    function getMiniApp(string calldata appId) external view returns (MiniApp memory) { return _apps[appId]; }

    function _recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := mload(add(sig, 32)) s := mload(add(sig, 64)) v := byte(0, mload(add(sig, 96))) }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(hash, v, r, s);
    }
}
