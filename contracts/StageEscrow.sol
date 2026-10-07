// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IProjectApprovals} from "./interfaces/IProjectApprovals.sol";

/// @notice An isolated, all-or-nothing raise for one deliverable, reviewed by its backers.
contract StageEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum ReviewState {
        None,
        Submitted,
        ChangesRequested,
        Approved
    }

    uint64 public constant REVIEW_WINDOW = 7 days;

    address public immutable registry;
    address public immutable builder;
    address public immutable asset;
    uint256 public immutable projectId;
    uint256 public immutable goal;
    uint64 public immutable deadline;
    uint64 public immutable deliveryDeadline;
    string public termsURI;
    bytes32 public immutable termsHash;

    uint256 public raised;
    bool public claimed;
    bool public cancelled;
    ReviewState public reviewState;
    uint64 public submittedAt;
    uint64 public rejectedAt;
    uint256 public evidenceRound;
    uint256 public approvalWeight;
    uint256 public rejectionWeight;
    uint256 public participationWeight;
    uint256 public voterCount;
    string public evidenceURI;
    bytes32 public evidenceHash;
    string public reviewReason;

    mapping(address => uint256) public contributions;
    mapping(address => uint256) private voteRound;

    event Contributed(address indexed backer, uint256 amount);
    event Refunded(address indexed backer, uint256 amount);
    event FundsClaimed(uint256 amount);
    event Cancelled(string reason);
    event EvidenceSubmitted(string uri, bytes32 contentHash, uint256 indexed evidenceRound);
    event VoteCast(address indexed backer, uint256 indexed evidenceRound, bool approve, uint256 weight);
    event Reviewed(bool approved, string reason);
    event CommunityReviewFinalized(
        uint256 indexed evidenceRound,
        bool approved,
        bool quorumReached,
        uint256 approvalWeight,
        uint256 rejectionWeight,
        uint256 participationWeight,
        uint256 voterCount
    );

    error InvalidState();
    error Unauthorized();
    error InvalidAmount();
    error InvalidEvidence();
    error InvalidInput();
    error TransferFailed();

    constructor(
        address builder_,
        uint256 projectId_,
        address asset_,
        uint256 goal_,
        uint64 deadline_,
        uint64 deliveryDeadline_,
        string memory termsURI_,
        bytes32 termsHash_
    ) {
        if (builder_ == address(0)) revert InvalidInput();
        registry = msg.sender;
        builder = builder_;
        projectId = projectId_;
        asset = asset_;
        goal = goal_;
        deadline = deadline_;
        deliveryDeadline = deliveryDeadline_;
        termsURI = termsURI_;
        termsHash = termsHash_;
    }

    function contribute(uint256 amount) external payable nonReentrant {
        if (cancelled || claimed || block.timestamp >= deadline) revert InvalidState();
        if (msg.sender == builder) revert Unauthorized();
        if (amount == 0 || amount > goal - raised) revert InvalidAmount();
        if (asset == address(0)) {
            if (msg.value != amount) revert InvalidAmount();
        } else {
            if (msg.value != 0) revert InvalidAmount();
            uint256 beforeBalance = IERC20(asset).balanceOf(address(this));
            IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
            uint256 afterBalance = IERC20(asset).balanceOf(address(this));
            if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) revert InvalidAmount();
        }
        raised += amount;
        contributions[msg.sender] += amount;
        emit Contributed(msg.sender, amount);
    }

    function isRefundable() public view returns (bool) {
        return
            !claimed
                && (cancelled || (block.timestamp >= deadline && raised < goal) || block.timestamp > deliveryDeadline);
    }

    /// @notice An unapproved, claimed stage can be retried after delivery expires.
    /// Submitted votes must first be finalized; underfunded/unclaimed stages use refunds.
    function isRetryable() public view returns (bool) {
        return claimed && block.timestamp > deliveryDeadline
            && (reviewState == ReviewState.None || reviewState == ReviewState.ChangesRequested);
    }

    function refund() external nonReentrant {
        if (!isRefundable()) revert InvalidState();
        uint256 amount = contributions[msg.sender];
        if (amount == 0) revert InvalidAmount();
        contributions[msg.sender] = 0;
        _send(msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }

    function claimFunds() external nonReentrant {
        if (msg.sender != builder) revert Unauthorized();
        if (claimed || cancelled || raised != goal || block.timestamp > deliveryDeadline) revert InvalidState();
        claimed = true;
        _send(builder, raised);
        emit FundsClaimed(raised);
    }

    function cancel(string calldata reason) external {
        if (msg.sender != builder) revert Unauthorized();
        if (claimed || cancelled) revert InvalidState();
        if (bytes(reason).length == 0) revert InvalidEvidence();
        cancelled = true;
        emit Cancelled(reason);
    }

    function submitEvidence(string calldata uri, bytes32 contentHash) external {
        if (msg.sender != builder) revert Unauthorized();
        if (
            !claimed || block.timestamp > deliveryDeadline
                || (reviewState != ReviewState.None && reviewState != ReviewState.ChangesRequested)
        ) revert InvalidState();
        if (bytes(uri).length == 0 || contentHash == bytes32(0)) revert InvalidEvidence();

        evidenceURI = uri;
        evidenceHash = contentHash;
        submittedAt = uint64(block.timestamp);
        evidenceRound++;
        approvalWeight = 0;
        rejectionWeight = 0;
        participationWeight = 0;
        voterCount = 0;
        reviewReason = "";
        reviewState = ReviewState.Submitted;
        emit EvidenceSubmitted(uri, contentHash, evidenceRound);
    }

    /// @notice Backers vote in proportion to their contribution for this stage.
    function castVote(bool approve) external {
        if (reviewState != ReviewState.Submitted || block.timestamp > submittedAt + REVIEW_WINDOW) {
            revert InvalidState();
        }
        uint256 weight = contributions[msg.sender];
        if (weight == 0 || msg.sender == builder) revert Unauthorized();
        if (voteRound[msg.sender] == evidenceRound) revert InvalidState();

        voteRound[msg.sender] = evidenceRound;
        participationWeight += weight;
        voterCount++;
        if (approve) approvalWeight += weight;
        else rejectionWeight += weight;
        emit VoteCast(msg.sender, evidenceRound, approve, weight);
    }

    /// @notice Anyone can finalize after the seven-day window; low turnout fails closed.
    function finalizeReview() external nonReentrant {
        if (reviewState != ReviewState.Submitted || block.timestamp <= submittedAt + REVIEW_WINDOW) {
            revert InvalidState();
        }
        uint256 quorum = raised / 2 + raised % 2;
        bool quorumReached = participationWeight >= quorum;
        bool approved_ = quorumReached && approvalWeight > rejectionWeight;
        reviewState = approved_ ? ReviewState.Approved : ReviewState.ChangesRequested;
        reviewReason = !quorumReached
            ? "Community review did not reach quorum."
            : approved_ ? "Approved by the contributing community." : "The community requested changes.";

        if (approved_) IProjectApprovals(registry).recordApproval(projectId);
        else rejectedAt = uint64(block.timestamp);

        emit Reviewed(approved_, reviewReason);
        emit CommunityReviewFinalized(
            evidenceRound,
            approved_,
            quorumReached,
            approvalWeight,
            rejectionWeight,
            participationWeight,
            voterCount
        );
    }

    function hasVoted(address backer) external view returns (bool) {
        return evidenceRound != 0 && voteRound[backer] == evidenceRound;
    }

    function approved() external view returns (bool) {
        return reviewState == ReviewState.Approved;
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
