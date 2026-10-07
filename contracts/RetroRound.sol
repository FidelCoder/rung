// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IProjects {
    function projectOwner(uint256 id) external view returns (address);
    function verified(uint256 id) external view returns (bool);
}

/// @notice A fully funded retro round owned by its creator with a round-scoped reviewer.
contract RetroRound is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Application {
        uint256 projectId;
        address recipient;
        string evidenceURI;
        bytes32 evidenceHash;
        uint256 award;
        bool claimed;
        string reason;
    }

    address public immutable registry;
    address public immutable roundOwner;
    address public immutable reviewer;
    address public immutable treasury;
    address public immutable asset;
    uint256 public immutable budget;
    uint64 public immutable applicationDeadline;
    uint64 public immutable decisionDeadline;
    string public rulesURI;
    bytes32 public immutable rulesHash;
    uint256 public allocated;
    bool public finalized;
    bool public cancelled;
    bool public remainderClaimed;
    Application[] private applications;
    mapping(uint256 => bool) public applied;

    event Applied(
        uint256 indexed applicationId,
        uint256 indexed projectId,
        address indexed recipient,
        string uri,
        bytes32 contentHash
    );
    event AwardSet(uint256 indexed applicationId, uint256 amount, string reason);
    event Finalized(uint256 allocated);
    event Cancelled();
    event AwardClaimed(uint256 indexed applicationId, address indexed recipient, uint256 amount);
    event RemainderClaimed(uint256 amount);
    error InvalidState();
    error Unauthorized();
    error InvalidAmount();
    error InvalidApplication();
    error TransferFailed();

    constructor(
        address owner_,
        address reviewer_,
        address asset_,
        uint256 budget_,
        uint64 applicationDeadline_,
        uint64 decisionDeadline_,
        string memory rulesURI_,
        bytes32 rulesHash_
    ) payable {
        if (owner_ == address(0) || reviewer_ == address(0) || owner_ == reviewer_) revert InvalidAmount();
        registry = msg.sender;
        roundOwner = owner_;
        reviewer = reviewer_;
        treasury = owner_;
        asset = asset_;
        budget = budget_;
        applicationDeadline = applicationDeadline_;
        decisionDeadline = decisionDeadline_;
        rulesURI = rulesURI_;
        rulesHash = rulesHash_;
        if (msg.value != (asset_ == address(0) ? budget_ : 0)) revert InvalidAmount();
    }

    function submitApplication(uint256 projectId, string calldata uri, bytes32 contentHash) external {
        if (block.timestamp >= applicationDeadline || finalized || cancelled) revert InvalidState();
        if (IProjects(registry).projectOwner(projectId) != msg.sender || !IProjects(registry).verified(projectId)) {
            revert Unauthorized();
        }
        if (msg.sender == reviewer) revert Unauthorized();
        if (applied[projectId] || bytes(uri).length == 0 || contentHash == bytes32(0)) revert InvalidApplication();
        applied[projectId] = true;
        uint256 id = applications.length;
        applications.push(
            Application({
                projectId: projectId,
                recipient: msg.sender,
                evidenceURI: uri,
                evidenceHash: contentHash,
                award: 0,
                claimed: false,
                reason: ""
            })
        );
        emit Applied(id, projectId, msg.sender, uri, contentHash);
    }

    function setAward(uint256 id, uint256 amount, string calldata reason) external {
        if (msg.sender != reviewer) revert Unauthorized();
        if (block.timestamp < applicationDeadline || block.timestamp > decisionDeadline || finalized || cancelled) {
            revert InvalidState();
        }
        if (id >= applications.length || bytes(reason).length == 0) revert InvalidApplication();
        uint256 next = allocated - applications[id].award + amount;
        if (next > budget) revert InvalidAmount();
        allocated = next;
        applications[id].award = amount;
        applications[id].reason = reason;
        emit AwardSet(id, amount, reason);
    }

    function finalize() external {
        if (msg.sender != reviewer) revert Unauthorized();
        if (block.timestamp < applicationDeadline || block.timestamp > decisionDeadline || finalized || cancelled) {
            revert InvalidState();
        }
        finalized = true;
        emit Finalized(allocated);
    }

    /// @notice If a reviewer never finalizes, anyone can unlock the budget for its owner.
    function cancelExpired() external {
        if (block.timestamp <= decisionDeadline || finalized || cancelled) revert InvalidState();
        cancelled = true;
        emit Cancelled();
    }

    function claim(uint256 id) external nonReentrant {
        if (!finalized || cancelled) revert InvalidState();
        if (id >= applications.length) revert InvalidApplication();
        Application storage entry = applications[id];
        if (msg.sender != entry.recipient) revert Unauthorized();
        if (entry.claimed || entry.award == 0) revert InvalidAmount();
        entry.claimed = true;
        _send(entry.recipient, entry.award);
        emit AwardClaimed(id, entry.recipient, entry.award);
    }

    function claimRemainder() external nonReentrant {
        if (msg.sender != treasury) revert Unauthorized();
        if ((!finalized && !cancelled) || remainderClaimed) revert InvalidState();
        remainderClaimed = true;
        uint256 amount = cancelled ? budget : budget - allocated;
        if (amount > 0) _send(treasury, amount);
        emit RemainderClaimed(amount);
    }

    function applicationCount() external view returns (uint256) {
        return applications.length;
    }

    function getApplication(uint256 id) external view returns (Application memory) {
        return applications[id];
    }

    function _send(address recipient, uint256 amount) private {
        if (asset != address(0)) {
            IERC20(asset).safeTransfer(recipient, amount);
        } else {
            (bool success,) = recipient.call{value: amount}("");
            if (!success) revert TransferFailed();
        }
    }
}
