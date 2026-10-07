// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface DeploymentVm {
    function envAddress(string calldata key) external returns (address);
    function envUint(string calldata key) external returns (uint256);
    function getCode(string calldata artifactPath) external returns (bytes memory creationCode);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract Deploy {
    DeploymentVm constant vm = DeploymentVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 constant BOHR_TESTNET_CHAIN_ID = 968;

    error WrongChain(uint256 actual, uint256 expected);
    error InvalidPrivateKey();
    error InvalidAdmin();
    error DeploymentFailed();

    function run() external returns (address rung) {
        if (block.chainid != BOHR_TESTNET_CHAIN_ID) {
            revert WrongChain(block.chainid, BOHR_TESTNET_CHAIN_ID);
        }

        address protocolAdmin = vm.envAddress("RUNG_ADMIN");
        uint256 privateKey = vm.envUint("RUNG_PRIVATE_KEY");
        if (privateKey == 0) revert InvalidPrivateKey();
        if (protocolAdmin == address(0)) revert InvalidAdmin();

        vm.startBroadcast(privateKey);
        bytes memory initCode = abi.encodePacked(vm.getCode("Rung.sol:Rung"), abi.encode(protocolAdmin));
        assembly ("memory-safe") {
            rung := create(0, add(initCode, 0x20), mload(initCode))
        }
        vm.stopBroadcast();
        if (rung == address(0)) revert DeploymentFailed();
    }
}
