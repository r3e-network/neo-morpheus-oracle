// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMorpheusOracleX {
    function requestFee() external view returns (uint256);
    function depositFeeCredit(address beneficiary) external payable;
    function request(
        string calldata requestType,
        bytes calldata payload,
        address callbackContract,
        string calldata callbackMethod
    ) external payable returns (uint256 requestId);
}

contract UserConsumerX {
    IMorpheusOracleX public immutable oracle;

    struct OracleResult {
        string requestType;
        bool success;
        bytes result;
        string error;
    }

    mapping(uint256 => OracleResult) public callbacks;

    event OracleCallbackReceived(uint256 indexed requestId, string requestType, bool success, string error);

    receive() external payable {}

    constructor(address oracleAddress) {
        require(oracleAddress != address(0), "invalid oracle");
        oracle = IMorpheusOracleX(oracleAddress);
    }

    function requestRaw(string calldata requestType, bytes calldata payload) external payable returns (uint256 requestId) {
        uint256 fee = oracle.requestFee();
        require(msg.value == fee, "incorrect request fee");
        requestId = _requestRawWithFee(requestType, payload, msg.value);
    }

    function requestRawSponsored(string calldata requestType, bytes calldata payload) external returns (uint256 requestId) {
        uint256 fee = oracle.requestFee();
        require(address(this).balance >= fee, "insufficient contract fee balance");
        requestId = _requestRawWithFee(requestType, payload, fee);
    }

    function requestBuiltinProviderPrice() external payable returns (uint256 requestId) {
        uint256 fee = oracle.requestFee();
        require(msg.value == fee, "incorrect request fee");
        bytes memory payload = abi.encodePacked(
            "{\"provider\":\"twelvedata\",\"symbol\":\"NEO-USD\",\"json_path\":\"price\",\"target_chain\":\"neo_x\"}"
        );
        requestId = oracle.request{ value: msg.value }("privacy_oracle", payload, address(this), "onOracleResult");
    }

    function requestBuiltinProviderPriceSponsored() external returns (uint256 requestId) {
        bytes memory payload = abi.encodePacked(
            "{\"provider\":\"twelvedata\",\"symbol\":\"NEO-USD\",\"json_path\":\"price\",\"target_chain\":\"neo_x\"}"
        );
        requestId = _requestRawWithFee("privacy_oracle", payload, oracle.requestFee());
    }

    function requestBuiltinCompute(string calldata encryptedPayload) external payable returns (uint256 requestId) {
        uint256 fee = oracle.requestFee();
        require(msg.value == fee, "incorrect request fee");
        bytes memory payload = abi.encodePacked(
            "{\"encrypted_payload\":\"",
            encryptedPayload,
            "\"}"
        );
        requestId = oracle.request{ value: msg.value }("compute", payload, address(this), "onOracleResult");
    }

    function requestBuiltinComputeSponsored(string calldata encryptedPayload) external returns (uint256 requestId) {
        bytes memory payload = abi.encodePacked(
            "{\"encrypted_payload\":\"",
            encryptedPayload,
            "\"}"
        );
        requestId = _requestRawWithFee("compute", payload, oracle.requestFee());
    }

    function requestAutomationRegister(bytes calldata payload) external payable returns (uint256 requestId) {
        uint256 fee = oracle.requestFee();
        require(msg.value == fee, "incorrect request fee");
        requestId = oracle.request{ value: msg.value }("automation_register", payload, address(this), "onOracleResult");
    }

    function requestAutomationCancel(bytes calldata payload) external payable returns (uint256 requestId) {
        uint256 fee = oracle.requestFee();
        require(msg.value == fee, "incorrect request fee");
        requestId = oracle.request{ value: msg.value }("automation_cancel", payload, address(this), "onOracleResult");
    }

    function depositOracleFeeCredit() external payable {
        require(msg.value > 0, "invalid amount");
        oracle.depositFeeCredit{ value: msg.value }(address(this));
    }

    function contractFeeBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function _requestRawWithFee(string memory requestType, bytes memory payload, uint256 fee) internal returns (uint256 requestId) {
        requestId = oracle.request{ value: fee }(requestType, payload, address(this), "onOracleResult");
    }

    function onOracleResult(
        uint256 requestId,
        string calldata requestType,
        bool success,
        bytes calldata result,
        string calldata error
    ) external {
        require(msg.sender == address(oracle), "oracle only");
        callbacks[requestId] = OracleResult({
            requestType: requestType,
            success: success,
            result: result,
            error: error
        });
        emit OracleCallbackReceived(requestId, requestType, success, error);
    }

    function getCallback(uint256 requestId) external view returns (OracleResult memory) {
        return callbacks[requestId];
    }
}
