// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StageEscrow} from "./StageEscrow.sol";
import {RetroRound} from "./RetroRound.sol";
import {IProjectApprovals} from "./interfaces/IProjectApprovals.sol";

/// @notice Shared project registry and contract factories; never holds campaign funds.
/// The protocol admin manages shared safety settings, not project or round reviews.
contract Rung is Ownable2Step, ReentrancyGuard, IProjectApprovals {
    using SafeERC20 for IERC20;

    struct Project {
        address builder;
        string name;
        string metadataURI;
        bytes32 metadataHash;
        address latestStage;
        uint256 stageNumber;
    }

    Project[] private projects;
    address[] public rounds;
    mapping(address => bool) public allowedAsset;
    mapping(address => uint256) public stageProject;
    mapping(uint256 => bool) public verified;
    bool public creationPaused;

    event ProjectCreated(
        uint256 indexed projectId, address indexed builder, string name, string uri, bytes32 contentHash
    );
    event StageCreated(
        uint256 indexed projectId,
        uint256 indexed stageNumber,
        address indexed stage,
        address builder,
        address asset,
        uint256 goal,
        uint64 deadline
    );
    event ProjectVerified(uint256 indexed projectId, address indexed stage);
    event RoundCreated(
        uint256 indexed roundId,
        address indexed round,
        address indexed creator,
        address reviewer,
        address asset,
        uint256 budget
    );
    event AssetAllowed(address indexed asset, bool allowed);
    event CreationPaused(bool paused);

    error InvalidInput();
    error Unauthorized();
    error PreviousStageIncomplete();
    error Paused();

    constructor(address protocolAdmin_) Ownable(protocolAdmin_) {
        allowedAsset[address(0)] = true;
        projects.push();
    }

    function createProject(string calldata name, string calldata uri, bytes32 contentHash)
        external
        returns (uint256 id)
    {
        if (creationPaused) revert Paused();
        if (bytes(name).length == 0 || bytes(name).length > 100 || bytes(uri).length == 0 || contentHash == bytes32(0)) {
            revert InvalidInput();
        }
        id = projects.length;
        projects.push(
            Project({
                builder: msg.sender,
                name: name,
                metadataURI: uri,
                metadataHash: contentHash,
                latestStage: address(0),
                stageNumber: 0
            })
        );
        emit ProjectCreated(id, msg.sender, name, uri, contentHash);
    }

    function openStage(
        uint256 id,
        address asset,
        uint256 goal,
        uint64 deadline,
        uint64 deliveryDeadline,
        string calldata uri,
        bytes32 contentHash
    ) external returns (address stage) {
        if (creationPaused) revert Paused();
        if (id == 0 || id >= projects.length || projects[id].builder != msg.sender) revert Unauthorized();
        if (
            !allowedAsset[asset] || goal == 0 || deadline < block.timestamp + 1 days
                || deadline > block.timestamp + 90 days || deliveryDeadline <= deadline
                || deliveryDeadline > deadline + 365 days || bytes(uri).length == 0 || contentHash == bytes32(0)
        ) revert InvalidInput();

        Project storage project = projects[id];
        if (project.latestStage == address(0)) {
            project.stageNumber = 1;
        } else {
            StageEscrow previous = StageEscrow(project.latestStage);
            if (previous.approved()) project.stageNumber++;
            else if (!previous.isRefundable() && !previous.isRetryable()) revert PreviousStageIncomplete();
        }

        stage = address(
            new StageEscrow(msg.sender, id, asset, goal, deadline, deliveryDeadline, uri, contentHash)
        );
        project.latestStage = stage;
        stageProject[stage] = id;
        emit StageCreated(id, project.stageNumber, stage, msg.sender, asset, goal, deadline);
    }

    function recordApproval(uint256 id) external override {
        if (id == 0 || stageProject[msg.sender] != id) revert Unauthorized();
        verified[id] = true;
        emit ProjectVerified(id, msg.sender);
    }

    /// @notice Any organization can create and fund its own round.
    /// The creator owns the round and receives unallocated funds; reviewer is round-scoped.
    function createRound(
        address asset,
        uint256 budget,
        uint64 applicationDeadline,
        uint64 decisionDeadline,
        address reviewer,
        string calldata uri,
        bytes32 contentHash
    ) external payable nonReentrant returns (address round) {
        if (creationPaused) revert Paused();
        if (
            !allowedAsset[asset] || budget == 0 || reviewer == address(0) || reviewer == msg.sender
                || applicationDeadline < block.timestamp + 1 days || decisionDeadline <= applicationDeadline
                || decisionDeadline > applicationDeadline + 90 days || bytes(uri).length == 0
                || contentHash == bytes32(0)
        ) revert InvalidInput();
        if (msg.value != (asset == address(0) ? budget : 0)) revert InvalidInput();

        round = address(
            new RetroRound{value: msg.value}(
                msg.sender, reviewer, asset, budget, applicationDeadline, decisionDeadline, uri, contentHash
            )
        );
        if (asset != address(0)) {
            uint256 beforeBalance = IERC20(asset).balanceOf(round);
            IERC20(asset).safeTransferFrom(msg.sender, round, budget);
            uint256 afterBalance = IERC20(asset).balanceOf(round);
            if (afterBalance < beforeBalance || afterBalance - beforeBalance != budget) revert InvalidInput();
        }
        rounds.push(round);
        emit RoundCreated(rounds.length - 1, round, msg.sender, reviewer, asset, budget);
    }

    function setAssetAllowed(address asset, bool allowed) external onlyOwner {
        if (asset == address(0) || (allowed && asset.code.length == 0)) revert InvalidInput();
        allowedAsset[asset] = allowed;
        emit AssetAllowed(asset, allowed);
    }

    function setCreationPaused(bool paused) external onlyOwner {
        creationPaused = paused;
        emit CreationPaused(paused);
    }

    function renounceOwnership() public view override onlyOwner {
        revert InvalidInput();
    }

    function projectCount() external view returns (uint256) {
        return projects.length - 1;
    }

    function roundCount() external view returns (uint256) {
        return rounds.length;
    }

    function getProject(uint256 id) external view returns (Project memory) {
        return projects[id];
    }

    function projectOwner(uint256 id) external view returns (address) {
        return projects[id].builder;
    }
}
