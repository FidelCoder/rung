// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Rung} from "../Rung.sol";
import {StageEscrow} from "../StageEscrow.sol";
import {RetroRound} from "../RetroRound.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function deal(address, uint256) external;
    function warp(uint256) external;
    function bound(uint256, uint256, uint256) external pure returns (uint256);
    function expectRevert() external;
}

contract Token is ERC20 {
    constructor() ERC20("Test token", "TEST") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract TaxToken is Token {
    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = amount / 10;
            super._update(from, address(0), fee);
            amount -= fee;
        }
        super._update(from, to, amount);
    }
}

contract RungTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant BUILDER = address(0xB01);
    address private constant BACKER = address(0xD01);
    address private constant OTHER_BACKER = address(0xD02);
    address private constant ORGANIZATION = address(0xE01);
    address private constant ORG_REVIEWER = address(0xC01);
    bytes32 private constant HASH = keccak256("evidence");

    Rung private rung;
    StageEscrow private stage;
    uint256 private projectId;

    receive() external payable {}

    function setUp() public {
        vm.deal(address(this), 1_000 ether);
        vm.deal(BUILDER, 100 ether);
        vm.deal(BACKER, 100 ether);
        vm.deal(OTHER_BACKER, 100 ether);
        vm.deal(ORGANIZATION, 100 ether);
        rung = new Rung(address(this));
        vm.prank(BUILDER);
        projectId = rung.createProject("Open tools", "ipfs://project", HASH);
        stage = _open(address(0), 10 ether);
    }

    function _open(address asset, uint256 goal) private returns (StageEscrow) {
        vm.prank(BUILDER);
        return StageEscrow(
            rung.openStage(
                projectId,
                asset,
                goal,
                uint64(block.timestamp + 2 days),
                uint64(block.timestamp + 30 days),
                "ipfs://terms",
                HASH
            )
        );
    }

    function _fund(StageEscrow target) private {
        vm.prank(BACKER);
        target.contribute{value: 6 ether}(6 ether);
        vm.prank(OTHER_BACKER);
        target.contribute{value: 4 ether}(4 ether);
    }

    function _claimAndSubmit(StageEscrow target) private {
        vm.prank(BUILDER);
        target.claimFunds();
        vm.prank(BUILDER);
        target.submitEvidence("ipfs://proof", HASH);
    }

    function _approve(StageEscrow target) private {
        _fund(target);
        _claimAndSubmit(target);
        vm.prank(BACKER);
        target.castVote(true);
        vm.prank(OTHER_BACKER);
        target.castVote(true);
        vm.warp(uint256(target.submittedAt()) + target.REVIEW_WINDOW() + 1);
        target.finalizeReview();
    }

    function _createRound(address creator, address reviewer, address asset, uint256 budget)
        private
        returns (RetroRound)
    {
        uint64 appDeadline = uint64(block.timestamp + 2 days);
        uint64 decisionDeadline = uint64(block.timestamp + 10 days);
        if (asset == address(0)) {
            vm.prank(creator);
            return RetroRound(
                rung.createRound{value: budget}(
                    asset, budget, appDeadline, decisionDeadline, reviewer, "ipfs://rules", HASH
                )
            );
        }
        vm.prank(creator);
        return RetroRound(
            rung.createRound(asset, budget, appDeadline, decisionDeadline, reviewer, "ipfs://rules", HASH)
        );
    }

    function testBuilderOwnsProjectAndCommunityApprovalUnlocksNextStage() public {
        _fund(stage);
        vm.prank(BUILDER);
        stage.claimFunds();
        vm.prank(BUILDER);
        stage.submitEvidence("ipfs://proof", HASH);
        vm.prank(BACKER);
        stage.castVote(true);
        vm.prank(OTHER_BACKER);
        stage.castVote(true);
        vm.warp(uint256(stage.submittedAt()) + stage.REVIEW_WINDOW() + 1);
        stage.finalizeReview();

        require(BUILDER.balance == 110 ether);
        require(rung.verified(projectId));
        StageEscrow next = _open(address(0), 5 ether);
        require(address(next) != address(stage));
        require(rung.getProject(projectId).stageNumber == 2);
    }

    function testOnlyBuilderCanCreateProjectAndOpenItsStages() public {
        vm.prank(address(0xF01));
        vm.expectRevert();
        rung.openStage(projectId, address(0), 1 ether, uint64(block.timestamp + 2 days), uint64(block.timestamp + 5 days), "ipfs://t", HASH);

        vm.prank(BUILDER);
        vm.expectRevert();
        rung.createProject("", "ipfs://project", HASH);
        vm.prank(BUILDER);
        vm.expectRevert();
        rung.createProject("name", "", HASH);
        vm.prank(BUILDER);
        vm.expectRevert();
        rung.createProject("name", "ipfs://project", bytes32(0));

        require(rung.projectOwner(projectId) == BUILDER);
    }

    function testBuilderCannotFundOwnStageOrOverfund() public {
        vm.prank(BUILDER);
        vm.expectRevert();
        stage.contribute{value: 1 ether}(1 ether);
        vm.prank(BACKER);
        vm.expectRevert();
        stage.contribute{value: 11 ether}(11 ether);
        vm.prank(BACKER);
        vm.expectRevert();
        stage.contribute{value: 0}(0);
        vm.prank(BACKER);
        vm.expectRevert();
        stage.contribute{value: 1 ether}(2 ether);
    }

    function testUnderfundedStageRefundsAndAllowsRetry() public {
        vm.prank(BACKER);
        stage.contribute{value: 3 ether}(3 ether);
        vm.warp(stage.deadline());
        require(stage.isRefundable());
        uint256 beforeBalance = BACKER.balance;
        vm.prank(BACKER);
        stage.refund();
        require(BACKER.balance == beforeBalance + 3 ether);
        vm.prank(BACKER);
        vm.expectRevert();
        stage.refund();
        StageEscrow retry = _open(address(0), 5 ether);
        require(rung.getProject(projectId).stageNumber == 1);
        require(address(retry) != address(stage));
    }

    function testSuccessfulRaiseCannotBeRefundedAndClaimIsOneWay() public {
        _fund(stage);
        vm.prank(BACKER);
        vm.expectRevert();
        stage.refund();
        vm.prank(BUILDER);
        stage.claimFunds();
        require(stage.claimed() && address(stage).balance == 0);
        vm.prank(BACKER);
        vm.expectRevert();
        stage.refund();
    }

    function testBuilderCanCancelBeforeClaimAndBackersRefund() public {
        vm.prank(BACKER);
        stage.contribute{value: 4 ether}(4 ether);
        vm.prank(OTHER_BACKER);
        stage.contribute{value: 6 ether}(6 ether);
        vm.prank(BUILDER);
        stage.cancel("Work plan changed before funds were claimed");
        require(stage.isRefundable());
        vm.prank(BACKER);
        stage.refund();
        vm.prank(OTHER_BACKER);
        stage.refund();
        require(address(stage).balance == 0);
    }

    function testOnlyBuilderClaimsAndClaimAfterDeliveryWindowFails() public {
        _fund(stage);
        vm.prank(OTHER_BACKER);
        vm.expectRevert();
        stage.claimFunds();
        vm.warp(uint256(stage.deliveryDeadline()) + 1);
        vm.prank(BUILDER);
        vm.expectRevert();
        stage.claimFunds();
        vm.prank(BACKER);
        stage.refund();
        vm.prank(OTHER_BACKER);
        stage.refund();
        require(address(stage).balance == 0);
    }

    function testEvidenceOnlyBuilderAfterClaimAndRequiresValidReferences() public {
        vm.prank(BUILDER);
        vm.expectRevert();
        stage.submitEvidence("ipfs://proof", HASH);
        _fund(stage);
        vm.prank(BUILDER);
        stage.claimFunds();
        vm.prank(OTHER_BACKER);
        vm.expectRevert();
        stage.submitEvidence("ipfs://proof", HASH);
        vm.prank(BUILDER);
        vm.expectRevert();
        stage.submitEvidence("", HASH);
        vm.prank(BUILDER);
        vm.expectRevert();
        stage.submitEvidence("ipfs://proof", bytes32(0));
        vm.prank(BUILDER);
        stage.submitEvidence("ipfs://proof", HASH);
        require(stage.reviewState() == StageEscrow.ReviewState.Submitted);
    }

    function testOnlyBackersVoteOnceAndCannotVoteAfterWindow() public {
        _fund(stage);
        _claimAndSubmit(stage);
        vm.prank(BUILDER);
        vm.expectRevert();
        stage.castVote(true);
        vm.prank(address(0xF01));
        vm.expectRevert();
        stage.castVote(true);

        vm.prank(BACKER);
        stage.castVote(true);
        require(stage.approvalWeight() == 6 ether);
        require(stage.participationWeight() == 6 ether);
        require(stage.hasVoted(BACKER));
        vm.prank(BACKER);
        vm.expectRevert();
        stage.castVote(false);

        vm.warp(uint256(stage.submittedAt()) + stage.REVIEW_WINDOW() + 1);
        vm.prank(OTHER_BACKER);
        vm.expectRevert();
        stage.castVote(true);
        stage.finalizeReview();
        require(stage.reviewState() == StageEscrow.ReviewState.Approved);
    }

    function testCommunityApprovalRequiresHalfTurnoutAndStrictMajority() public {
        _fund(stage);
        _claimAndSubmit(stage);
        vm.prank(OTHER_BACKER);
        stage.castVote(true);
        vm.warp(uint256(stage.submittedAt()) + stage.REVIEW_WINDOW() + 1);
        stage.finalizeReview();
        require(stage.reviewState() == StageEscrow.ReviewState.ChangesRequested);
        require(!rung.verified(projectId));

        vm.prank(BUILDER);
        stage.submitEvidence("ipfs://revised", keccak256("revised"));
        vm.prank(BACKER);
        stage.castVote(false);
        vm.prank(OTHER_BACKER);
        stage.castVote(true);
        vm.warp(uint256(stage.submittedAt()) + stage.REVIEW_WINDOW() + 1);
        stage.finalizeReview();
        require(stage.reviewState() == StageEscrow.ReviewState.ChangesRequested);
        require(stage.participationWeight() == 10 ether);
        require(stage.approvalWeight() == 4 ether && stage.rejectionWeight() == 6 ether);
    }

    function testRevisedEvidenceStartsANewCommunityVote() public {
        _fund(stage);
        _claimAndSubmit(stage);
        uint256 firstRound = stage.evidenceRound();
        vm.prank(BACKER);
        stage.castVote(false);
        vm.prank(OTHER_BACKER);
        stage.castVote(false);
        vm.warp(uint256(stage.submittedAt()) + stage.REVIEW_WINDOW() + 1);
        stage.finalizeReview();
        require(stage.reviewState() == StageEscrow.ReviewState.ChangesRequested);

        vm.prank(BUILDER);
        stage.submitEvidence("ipfs://revised", keccak256("revised"));
        require(stage.evidenceRound() == firstRound + 1);
        require(stage.approvalWeight() == 0 && stage.rejectionWeight() == 0);
        require(!stage.hasVoted(BACKER));
        vm.prank(BACKER);
        stage.castVote(true);
        vm.prank(OTHER_BACKER);
        stage.castVote(true);
        vm.warp(uint256(stage.submittedAt()) + stage.REVIEW_WINDOW() + 1);
        stage.finalizeReview();
        require(stage.approved() && rung.verified(projectId));
    }

    function testFinalizeRequiresReviewWindowAndOnlyOneFinalization() public {
        _fund(stage);
        _claimAndSubmit(stage);
        vm.expectRevert();
        stage.finalizeReview();
        vm.prank(BACKER);
        stage.castVote(true);
        vm.prank(OTHER_BACKER);
        stage.castVote(true);
        vm.warp(uint256(stage.submittedAt()) + stage.REVIEW_WINDOW());
        vm.expectRevert();
        stage.finalizeReview();
        vm.warp(block.timestamp + 1);
        stage.finalizeReview();
        vm.expectRevert();
        stage.finalizeReview();
    }

    function testProjectCannotOpenNextStageBeforeApprovalOrRefund() public {
        vm.prank(BUILDER);
        vm.expectRevert();
        rung.openStage(projectId, address(0), 1 ether, uint64(block.timestamp + 2 days), uint64(block.timestamp + 30 days), "ipfs://terms", HASH);
        _approve(stage);
        StageEscrow next = _open(address(0), 5 ether);
        require(address(next) != address(stage));
        require(rung.getProject(projectId).stageNumber == 2);
    }

    function testClaimedStageCanBeRetriedAfterCommunityRequestsChangesAndDeliveryExpires() public {
        _fund(stage);
        _claimAndSubmit(stage);
        vm.prank(BACKER);
        stage.castVote(false);
        vm.prank(OTHER_BACKER);
        stage.castVote(false);
        vm.warp(uint256(stage.submittedAt()) + stage.REVIEW_WINDOW() + 1);
        stage.finalizeReview();
        require(stage.reviewState() == StageEscrow.ReviewState.ChangesRequested);
        vm.expectRevert();
        _open(address(0), 5 ether);

        vm.warp(uint256(stage.deliveryDeadline()) + 1);
        require(stage.isRetryable());
        StageEscrow retry = _open(address(0), 5 ether);
        require(address(retry) != address(stage));
        require(rung.getProject(projectId).stageNumber == 1);
    }

    function testOnlyProtocolAdminControlsSharedSafetySettings() public {
        vm.prank(OTHER_BACKER);
        vm.expectRevert();
        rung.setCreationPaused(true);
        rung.setCreationPaused(true);
        require(rung.creationPaused());
        vm.prank(BUILDER);
        vm.expectRevert();
        rung.createProject("Paused", "ipfs://paused", HASH);
        rung.setCreationPaused(false);
        vm.expectRevert();
        rung.renounceOwnership();
        require(rung.owner() == address(this));
    }

    function testAssetAllowlistIsProtocolAdminOnlyAndRejectsEOAs() public {
        Token token = new Token();
        vm.prank(OTHER_BACKER);
        vm.expectRevert();
        rung.setAssetAllowed(address(token), true);
        vm.expectRevert();
        rung.setAssetAllowed(address(0x1234), true);
        vm.expectRevert();
        rung.setAssetAllowed(address(0), true);
        rung.setAssetAllowed(address(token), true);
        require(rung.allowedAsset(address(token)) && rung.allowedAsset(address(0)));
        rung.setAssetAllowed(address(token), false);
        require(!rung.allowedAsset(address(token)));
    }

    function testTokenContributionsUseExactBalanceDelta() public {
        Token token = new Token();
        rung.setAssetAllowed(address(token), true);
        vm.prank(BUILDER);
        stage.cancel("Use approved test token");
        StageEscrow tokenStage = _open(address(token), 100 ether);
        token.mint(BACKER, 100 ether);
        vm.prank(BACKER);
        token.approve(address(tokenStage), 100 ether);
        vm.prank(BACKER);
        tokenStage.contribute(100 ether);
        require(tokenStage.raised() == 100 ether && token.balanceOf(address(tokenStage)) == 100 ether);
    }

    function testFeeOnTransferTokenContributionReverts() public {
        TaxToken token = new TaxToken();
        rung.setAssetAllowed(address(token), true);
        vm.prank(BUILDER);
        stage.cancel("Use approved test token");
        StageEscrow tokenStage = _open(address(token), 100 ether);
        token.mint(BACKER, 100 ether);
        vm.prank(BACKER);
        token.approve(address(tokenStage), 100 ether);
        vm.prank(BACKER);
        vm.expectRevert();
        tokenStage.contribute(100 ether);
        require(tokenStage.raised() == 0);
    }

    function testAnyOrganizationCanCreateAndOwnItsRetroRound() public {
        RetroRound round = _createRound(ORGANIZATION, ORG_REVIEWER, address(0), 10 ether);
        require(round.roundOwner() == ORGANIZATION);
        require(round.treasury() == ORGANIZATION);
        require(round.reviewer() == ORG_REVIEWER);
        require(address(round).balance == 10 ether);
        require(rung.roundCount() == 1 && rung.rounds(0) == address(round));
    }

    function testOrganizationReviewerIsScopedToItsRound() public {
        address secondOrg = address(0xE02);
        address secondReviewer = address(0xC02);
        vm.deal(secondOrg, 10 ether);
        RetroRound first = _createRound(ORGANIZATION, ORG_REVIEWER, address(0), 1 ether);
        RetroRound second = _createRound(secondOrg, secondReviewer, address(0), 1 ether);
        require(first.reviewer() == ORG_REVIEWER);
        require(second.reviewer() == secondReviewer);
        require(first.roundOwner() == ORGANIZATION && second.roundOwner() == secondOrg);
    }

    function testRoundRejectsSelfReviewBadBudgetAndBadDeadlines() public {
        uint64 appDeadline = uint64(block.timestamp + 2 days);
        uint64 decisionDeadline = uint64(block.timestamp + 10 days);
        vm.prank(ORGANIZATION);
        vm.expectRevert();
        rung.createRound{value: 1 ether}(address(0), 1 ether, appDeadline, decisionDeadline, ORGANIZATION, "ipfs://rules", HASH);
        vm.prank(ORGANIZATION);
        vm.expectRevert();
        rung.createRound{value: 1 ether}(address(0), 1 ether, appDeadline, decisionDeadline, address(0), "ipfs://rules", HASH);
        vm.prank(ORGANIZATION);
        vm.expectRevert();
        rung.createRound{value: 1 ether}(address(0), 0, appDeadline, decisionDeadline, ORG_REVIEWER, "ipfs://rules", HASH);
        vm.prank(ORGANIZATION);
        vm.expectRevert();
        rung.createRound{value: 1 ether}(address(0), 1 ether, uint64(block.timestamp + 1 days - 1), decisionDeadline, ORG_REVIEWER, "ipfs://rules", HASH);
        vm.prank(ORGANIZATION);
        vm.expectRevert();
        rung.createRound{value: 1 ether}(address(0), 1 ether, appDeadline, appDeadline, ORG_REVIEWER, "ipfs://rules", HASH);
        vm.prank(ORGANIZATION);
        vm.expectRevert();
        rung.createRound{value: 1 ether}(address(0), 1 ether, appDeadline, uint64(appDeadline + 90 days + 1), ORG_REVIEWER, "ipfs://rules", HASH);
        vm.prank(ORGANIZATION);
        vm.expectRevert();
        rung.createRound{value: 1 ether - 1}(address(0), 1 ether, appDeadline, decisionDeadline, ORG_REVIEWER, "ipfs://rules", HASH);
    }

    function testRoundCreatorCannotAwardAndReviewerCannotClaimRemainder() public {
        _approve(stage);
        RetroRound round = _createRound(ORGANIZATION, ORG_REVIEWER, address(0), 10 ether);
        vm.prank(BUILDER);
        round.submitApplication(projectId, "ipfs://application", HASH);
        vm.warp(round.applicationDeadline());
        vm.prank(ORGANIZATION);
        vm.expectRevert();
        round.setAward(0, 5 ether, "Not the assigned reviewer");
        vm.prank(ORG_REVIEWER);
        round.setAward(0, 5 ether, "Impact validated");
        vm.prank(ORG_REVIEWER);
        round.finalize();
        vm.prank(ORG_REVIEWER);
        vm.expectRevert();
        round.claimRemainder();
        vm.prank(ORGANIZATION);
        round.claimRemainder();
        require(ORGANIZATION.balance == 95 ether);
    }

    function testVerifiedProjectBuilderCanApplyOnlyOnce() public {
        _approve(stage);
        RetroRound round = _createRound(ORGANIZATION, ORG_REVIEWER, address(0), 3 ether);
        vm.prank(OTHER_BACKER);
        vm.expectRevert();
        round.submitApplication(projectId, "ipfs://application", HASH);
        vm.prank(BUILDER);
        round.submitApplication(projectId, "ipfs://application", HASH);
        vm.prank(BUILDER);
        vm.expectRevert();
        round.submitApplication(projectId, "ipfs://duplicate", HASH);
    }

    function testRoundReviewerCannotApplyToTheirOwnRound() public {
        _approve(stage);
        RetroRound round = _createRound(ORGANIZATION, BUILDER, address(0), 3 ether);
        vm.prank(BUILDER);
        vm.expectRevert();
        round.submitApplication(projectId, "ipfs://application", HASH);
    }

    function testRoundAwardsCannotExceedBudgetAndClaimsAreOneWay() public {
        _approve(stage);
        RetroRound round = _createRound(ORGANIZATION, ORG_REVIEWER, address(0), 3 ether);
        vm.prank(BUILDER);
        round.submitApplication(projectId, "ipfs://application", HASH);
        vm.warp(round.applicationDeadline());
        vm.prank(ORG_REVIEWER);
        vm.expectRevert();
        round.setAward(0, 4 ether, "Over budget");
        vm.prank(ORG_REVIEWER);
        round.setAward(0, 2 ether, "Impact validated");
        vm.warp(round.applicationDeadline());
        vm.prank(ORG_REVIEWER);
        round.finalize();
        uint256 beforeBalance = BUILDER.balance;
        vm.prank(BUILDER);
        round.claim(0);
        require(BUILDER.balance == beforeBalance + 2 ether);
        vm.prank(BUILDER);
        vm.expectRevert();
        round.claim(0);
    }

    function testExpiredUnfinalizedRoundReturnsBudgetToCreator() public {
        RetroRound round = _createRound(ORGANIZATION, ORG_REVIEWER, address(0), 2 ether);
        vm.warp(uint256(round.decisionDeadline()) + 1);
        round.cancelExpired();
        uint256 beforeBalance = ORGANIZATION.balance;
        vm.prank(ORGANIZATION);
        round.claimRemainder();
        require(ORGANIZATION.balance == beforeBalance + 2 ether);
    }

    function testRoundTokenBudgetMovesFromOrganizationAndRejectsTaxTokens() public {
        Token token = new Token();
        rung.setAssetAllowed(address(token), true);
        token.mint(ORGANIZATION, 5 ether);
        vm.prank(ORGANIZATION);
        token.approve(address(rung), 5 ether);
        RetroRound round = _createRound(ORGANIZATION, ORG_REVIEWER, address(token), 5 ether);
        require(token.balanceOf(address(round)) == 5 ether);

        TaxToken taxed = new TaxToken();
        rung.setAssetAllowed(address(taxed), true);
        taxed.mint(ORGANIZATION, 5 ether);
        vm.prank(ORGANIZATION);
        taxed.approve(address(rung), 5 ether);
        vm.prank(ORGANIZATION);
        vm.expectRevert();
        rung.createRound(address(taxed), 5 ether, uint64(block.timestamp + 2 days), uint64(block.timestamp + 10 days), ORG_REVIEWER, "ipfs://rules", HASH);
    }

    function testFuzzUnderfundedRefundReturnsExactlyContribution(uint96 rawAmount) public {
        uint256 amount_ = uint256(rawAmount) % (10 ether - 1) + 1;
        vm.prank(BACKER);
        stage.contribute{value: amount_}(amount_);
        vm.warp(stage.deadline());
        uint256 beforeBalance = BACKER.balance;
        vm.prank(BACKER);
        stage.refund();
        require(BACKER.balance == beforeBalance + amount_);
        require(address(stage).balance == 0);
    }
}
