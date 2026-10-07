// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IProjectApprovals {
    function recordApproval(uint256 projectId) external;
}
