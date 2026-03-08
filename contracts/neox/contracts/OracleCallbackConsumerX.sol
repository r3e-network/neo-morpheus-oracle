// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract OracleCallbackConsumerX {
    address public admin;
    address public oracle;

    struct CallbackResult {
        string requestType;
        bool success;
        bytes result;
        string error;
    }

    mapping(uint256 => CallbackResult) public callbacks;

    event OracleCallbackReceived(uint256 indexed requestId, string requestType, bool success, string error);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event OracleChanged(address indexed oldOracle, address indexed newOracle);

    modifier onlyAdmin() {
        require(msg.sender == admin, "admin only");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "oracle only");
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

    function setOracle(address newOracle) external onlyAdmin {
        require(newOracle != address(0), "invalid oracle");
        address oldOracle = oracle;
        oracle = newOracle;
        emit OracleChanged(oldOracle, newOracle);
    }

    function onOracleResult(uint256 requestId, string calldata requestType, bool success, bytes calldata result, string calldata error) external onlyOracle {
        callbacks[requestId] = CallbackResult({ requestType: requestType, success: success, result: result, error: error });
        emit OracleCallbackReceived(requestId, requestType, success, error);
    }
}
