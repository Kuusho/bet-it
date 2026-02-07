// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../src/BetItVault.sol";
import "../src/BetItChallenges.sol";

contract BetItChallengesTest is Test {
    BetItVault public vault;
    BetItChallenges public challenges;

    address public owner = address(1);
    address public user1 = address(2);
    address public user2 = address(3);
    address public lp = address(4);

    uint256 constant GRACE_PERIOD = 1 days;

    function setUp() public {
        // Deploy vault
        vm.prank(owner);
        vault = new BetItVault();

        // Deploy challenges contract
        vm.prank(owner);
        challenges = new BetItChallenges(address(vault));

        // Set challenges contract as authorized payer
        vm.prank(owner);
        vault.setAuthorizedPayer(address(challenges));

        // Fund test accounts
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
        vm.deal(lp, 50 ether);

        // Seed vault with LP capital
        vm.prank(lp);
        vault.deposit{value: 10 ether}();

        // Add some verified contracts
        vm.startPrank(owner);
        challenges.addVerifiedContract(address(0x1234));
        challenges.addVerifiedContract(address(0x5678));
        vm.stopPrank();
    }

    function testCreateChallenge() public {
        vm.prank(user1);
        challenges.createChallenge{value: 0.1 ether}(7);

        uint256 challengeId = challenges.getUserActiveChallenge(user1);
        assertEq(challengeId, 1, "Should create challenge with ID 1");

        (
            address user,
            uint256 stake,
            uint256 duration,
            uint256 bonusRate,
            uint256 startDate,
            ,
            bool active,
            bool claimed
        ) = challenges.challenges(challengeId);

        assertEq(user, user1, "User should be correct");
        assertEq(stake, 0.1 ether, "Stake should be correct");
        assertEq(duration, 7, "Duration should be 7 days");
        assertEq(bonusRate, 1000, "Bonus rate should be 10%");
        assertTrue(active, "Challenge should be active");
        assertFalse(claimed, "Challenge should not be claimed");
    }

    function testCreateChallengeDifferentDurations() public {
        // 7 days
        vm.prank(user1);
        challenges.createChallenge{value: 0.1 ether}(7);
        uint256 id1 = challenges.getUserActiveChallenge(user1);
        (, , , uint256 rate1, , , , ) = challenges.challenges(id1);
        assertEq(rate1, 1000, "7 days = 10%");

        // User2 tries 30 days
        vm.prank(user2);
        challenges.createChallenge{value: 0.1 ether}(30);
        uint256 id2 = challenges.getUserActiveChallenge(user2);
        (, , , uint256 rate2, , , , ) = challenges.challenges(id2);
        assertEq(rate2, 2500, "30 days = 25%");
    }

    function testFailCreateChallengeInvalidDuration() public {
        vm.prank(user1);
        challenges.createChallenge{value: 0.1 ether}(5); // Invalid duration
    }

    function testFailCreateChallengeBelowMinimum() public {
        vm.prank(user1);
        challenges.createChallenge{value: 0.001 ether}(7); // Below 0.01 ETH minimum
    }

    function testFailCreateChallengeAboveMaximum() public {
        vm.deal(user1, 200 ether);
        vm.prank(user1);
        challenges.createChallenge{value: 150 ether}(7); // Above 100 ETH maximum
    }

    function testFailCreateChallengeWhenActive() public {
        vm.startPrank(user1);
        challenges.createChallenge{value: 0.1 ether}(7);
        challenges.createChallenge{value: 0.1 ether}(14); // Should fail
        vm.stopPrank();
    }

    function testVerifyStreak() public {
        vm.prank(user1);
        challenges.createChallenge{value: 0.1 ether}(7);

        uint256 challengeId = challenges.getUserActiveChallenge(user1);

        // Fast forward past grace period
        vm.warp(block.timestamp + GRACE_PERIOD);

        // Owner verifies streak
        vm.prank(owner);
        challenges.verifyStreak(challengeId);

        (, , , , , uint256 lastVerified, , ) = challenges.challenges(challengeId);
        assertEq(lastVerified, block.timestamp, "Last verified should be updated");
    }

    function testFailVerifyStreakTooEarly() public {
        vm.prank(user1);
        challenges.createChallenge{value: 0.1 ether}(7);

        uint256 challengeId = challenges.getUserActiveChallenge(user1);

        // Try to verify immediately (before grace period)
        vm.prank(owner);
        challenges.verifyStreak(challengeId);
    }

    function testClaimRewardSuccessful() public {
        vm.prank(user1);
        challenges.createChallenge{value: 1 ether}(7);

        uint256 challengeId = challenges.getUserActiveChallenge(user1);

        // Simulate daily verifications
        for (uint256 i = 0; i < 7; i++) {
            vm.warp(block.timestamp + GRACE_PERIOD);
            vm.prank(owner);
            challenges.verifyStreak(challengeId);
        }

        // Fast forward to end of challenge
        vm.warp(block.timestamp + 1 days);

        uint256 balanceBefore = user1.balance;

        // Claim reward
        vm.prank(user1);
        challenges.claimReward(challengeId);

        // Expected: 1 ETH stake + 0.1 ETH bonus - 0.01 ETH platform fee = 1.09 ETH
        uint256 expectedPayout = 1 ether + 0.1 ether - 0.01 ether;
        assertEq(user1.balance, balanceBefore + expectedPayout, "Should receive correct payout");

        // Challenge should be inactive and claimed
        (, , , , , , bool active, bool claimed) = challenges.challenges(challengeId);
        assertFalse(active, "Challenge should be inactive");
        assertTrue(claimed, "Challenge should be claimed");
        assertEq(challenges.getUserActiveChallenge(user1), 0, "User should have no active challenge");
    }

    function testClaimReward30Days() public {
        vm.prank(user1);
        challenges.createChallenge{value: 1 ether}(30);

        uint256 challengeId = challenges.getUserActiveChallenge(user1);

        // Simulate daily verifications for 30 days
        for (uint256 i = 0; i < 30; i++) {
            vm.warp(block.timestamp + GRACE_PERIOD);
            vm.prank(owner);
            challenges.verifyStreak(challengeId);
        }

        vm.warp(block.timestamp + 1 days);

        uint256 balanceBefore = user1.balance;

        vm.prank(user1);
        challenges.claimReward(challengeId);

        // Expected: 1 ETH + 25% bonus (0.25 ETH) - 10% fee on bonus (0.025 ETH) = 1.225 ETH
        uint256 expectedPayout = 1 ether + 0.25 ether - 0.025 ether;
        assertEq(user1.balance, balanceBefore + expectedPayout, "Should receive 30-day payout");
    }

    function testFailClaimRewardTooEarly() public {
        vm.prank(user1);
        challenges.createChallenge{value: 1 ether}(7);

        uint256 challengeId = challenges.getUserActiveChallenge(user1);

        // Try to claim immediately
        vm.prank(user1);
        challenges.claimReward(challengeId);
    }

    function testFailClaimRewardStreakBroken() public {
        vm.prank(user1);
        challenges.createChallenge{value: 1 ether}(7);

        uint256 challengeId = challenges.getUserActiveChallenge(user1);

        // Verify for a few days
        vm.warp(block.timestamp + GRACE_PERIOD);
        vm.prank(owner);
        challenges.verifyStreak(challengeId);

        // Fast forward past end without continuing verification
        vm.warp(block.timestamp + 7 days);

        // Try to claim (should fail due to broken streak)
        vm.prank(user1);
        challenges.claimReward(challengeId);
    }

    function testFailClaimRewardNotOwner() public {
        vm.prank(user1);
        challenges.createChallenge{value: 1 ether}(7);

        uint256 challengeId = challenges.getUserActiveChallenge(user1);

        // Complete challenge
        for (uint256 i = 0; i < 7; i++) {
            vm.warp(block.timestamp + GRACE_PERIOD);
            vm.prank(owner);
            challenges.verifyStreak(challengeId);
        }
        vm.warp(block.timestamp + 1 days);

        // User2 tries to claim user1's reward
        vm.prank(user2);
        challenges.claimReward(challengeId);
    }

    function testForfeit() public {
        vm.prank(user1);
        challenges.createChallenge{value: 1 ether}(7);

        uint256 challengeId = challenges.getUserActiveChallenge(user1);
        uint256 vaultAssetsBefore = vault.totalAssets();

        // User forfeits
        vm.prank(user1);
        challenges.forfeit(challengeId);

        // Check challenge is inactive
        (, , , , , , bool active, ) = challenges.challenges(challengeId);
        assertFalse(active, "Challenge should be inactive");
        assertEq(challenges.getUserActiveChallenge(user1), 0, "User should have no active challenge");

        // Check vault received the forfeited stake
        assertEq(vault.totalAssets(), vaultAssetsBefore + 1 ether, "Vault should receive forfeited stake");
    }

    function testMarkChallengeFailed() public {
        vm.prank(user1);
        challenges.createChallenge{value: 1 ether}(7);

        uint256 challengeId = challenges.getUserActiveChallenge(user1);
        uint256 vaultAssetsBefore = vault.totalAssets();

        // Owner marks challenge as failed
        vm.prank(owner);
        challenges.markChallengeFailed(challengeId);

        // Check challenge is inactive
        (, , , , , , bool active, ) = challenges.challenges(challengeId);
        assertFalse(active, "Challenge should be inactive");

        // Check vault received the failed stake
        assertEq(vault.totalAssets(), vaultAssetsBefore + 1 ether, "Vault should receive failed stake");
    }

    function testAddVerifiedContract() public {
        address newContract = address(0xABCD);

        vm.prank(owner);
        challenges.addVerifiedContract(newContract);

        assertTrue(challenges.isVerifiedContract(newContract), "Contract should be verified");
    }

    function testRemoveVerifiedContract() public {
        address contractToRemove = address(0x1234);

        assertTrue(challenges.isVerifiedContract(contractToRemove), "Should start verified");

        vm.prank(owner);
        challenges.removeVerifiedContract(contractToRemove);

        assertFalse(challenges.isVerifiedContract(contractToRemove), "Should no longer be verified");
    }

    function testGetAllVerifiedContracts() public view {
        address[] memory contracts = challenges.getAllVerifiedContracts();
        assertEq(contracts.length, 2, "Should have 2 verified contracts");
    }

    function testUpdateBonusRate() public {
        vm.prank(owner);
        challenges.updateBonusRate(7, 1500); // Update 7-day bonus to 15%

        assertEq(challenges.bonusRates(7), 1500, "Bonus rate should be updated");
    }

    function testMultipleUsersSimultaneous() public {
        // User1 creates 7-day challenge
        vm.prank(user1);
        challenges.createChallenge{value: 0.5 ether}(7);

        // User2 creates 30-day challenge
        vm.prank(user2);
        challenges.createChallenge{value: 1 ether}(30);

        uint256 id1 = challenges.getUserActiveChallenge(user1);
        uint256 id2 = challenges.getUserActiveChallenge(user2);

        assertEq(id1, 1, "User1 should have challenge 1");
        assertEq(id2, 2, "User2 should have challenge 2");
    }
}
