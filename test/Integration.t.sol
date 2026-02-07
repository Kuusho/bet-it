// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../src/BetItVault.sol";
import "../src/BetItChallenges.sol";

/**
 * @title Integration Test
 * @notice Full end-to-end tests simulating real-world scenarios
 */
contract IntegrationTest is Test {
    BetItVault public vault;
    BetItChallenges public challenges;

    address public owner = address(1);
    address public lp1 = address(2);
    address public lp2 = address(3);
    address public challenger1 = address(4);
    address public challenger2 = address(5);
    address public challenger3 = address(6);

    uint256 constant GRACE_PERIOD = 1 days;

    function setUp() public {
        // Deploy contracts
        vm.prank(owner);
        vault = new BetItVault();

        vm.prank(owner);
        challenges = new BetItChallenges(address(vault));

        vm.prank(owner);
        vault.setAuthorizedPayer(address(challenges));

        // Fund accounts
        vm.deal(lp1, 20 ether);
        vm.deal(lp2, 30 ether);
        vm.deal(challenger1, 5 ether);
        vm.deal(challenger2, 5 ether);
        vm.deal(challenger3, 5 ether);

        // Add verified contracts
        vm.startPrank(owner);
        challenges.addVerifiedContract(address(0x1111));
        challenges.addVerifiedContract(address(0x2222));
        vm.stopPrank();
    }

    /**
     * @notice Test: LP deposits, challenger stakes, wins, LP earns platform fee
     */
    function testSuccessfulChallengeFlow() public {
        // Step 1: LP deposits initial capital
        vm.prank(lp1);
        vault.deposit{value: 10 ether}();

        uint256 initialLPShares = vault.lpShares(lp1);
        console.log("LP deposited 10 ETH, received shares:", initialLPShares);

        // Step 2: Challenger creates 7-day challenge
        vm.prank(challenger1);
        challenges.createChallenge{value: 1 ether}(7);

        uint256 challengeId = challenges.getUserActiveChallenge(challenger1);
        console.log("Challenger staked 1 ETH on 7-day challenge");

        // Step 3: Simulate daily verification for 7 days
        for (uint256 i = 1; i <= 7; i++) {
            vm.warp(block.timestamp + GRACE_PERIOD);
            vm.prank(owner);
            challenges.verifyStreak(challengeId);
            console.log("Day", i, "verified");
        }

        // Step 4: Challenger claims reward
        vm.warp(block.timestamp + 1 days);
        uint256 balanceBefore = challenger1.balance;

        vm.prank(challenger1);
        challenges.claimReward(challengeId);

        uint256 payout = challenger1.balance - balanceBefore;
        console.log("Challenger received payout:", payout);

        // Expected: 1 ETH + 10% bonus (0.1 ETH) - 10% platform fee on bonus (0.01 ETH) = 1.09 ETH
        assertEq(payout, 1.09 ether, "Challenger should receive correct payout");

        // Step 5: Check LP earned platform fee
        uint256 vaultAssets = vault.totalAssets();
        console.log("Vault assets after challenge:", vaultAssets);

        // Vault should have: 10 ETH (initial) - 1.09 ETH (payout) + 1 ETH (stake returned to vault) + 0.01 ETH (platform fee) = 9.92 ETH
        // Wait, let's recalculate: LP deposits 10 ETH. Challenger stakes 1 ETH (held in contract).
        // After claim: Vault pays 1.09 ETH to challenger, keeps 0.01 ETH platform fee
        // So vault should have: 10 ETH (initial LP) - 1.09 ETH (payout) + 0.01 ETH (fee) = 8.92 ETH
        assertEq(vaultAssets, 8.92 ether, "Vault should have correct assets");

        // LP can now withdraw slightly less due to payout
        vm.prank(lp1);
        uint256 withdrawAmount = vault.withdraw(initialLPShares);
        console.log("LP withdrew:", withdrawAmount);

        // LP should get 8.92 ETH (slight loss from paying winner)
        assertEq(withdrawAmount, 8.92 ether, "LP should withdraw reduced amount");
    }

    /**
     * @notice Test: Challenger fails, LP earns full stake as revenue
     */
    function testFailedChallengeFlow() public {
        // Step 1: LP deposits
        vm.prank(lp1);
        vault.deposit{value: 10 ether}();

        uint256 initialLPShares = vault.lpShares(lp1);
        uint256 vaultAssetsBefore = vault.totalAssets();

        // Step 2: Challenger creates challenge
        vm.prank(challenger1);
        challenges.createChallenge{value: 1 ether}(7);

        uint256 challengeId = challenges.getUserActiveChallenge(challenger1);

        // Step 3: Challenger maintains streak for 3 days then gives up
        for (uint256 i = 0; i < 3; i++) {
            vm.warp(block.timestamp + GRACE_PERIOD);
            vm.prank(owner);
            challenges.verifyStreak(challengeId);
        }

        // Step 4: Challenger forfeits
        vm.prank(challenger1);
        challenges.forfeit(challengeId);

        // Step 5: Vault should receive full stake as revenue
        uint256 vaultAssetsAfter = vault.totalAssets();
        console.log("Vault assets after forfeit:", vaultAssetsAfter);

        assertEq(vaultAssetsAfter, vaultAssetsBefore + 1 ether, "Vault should receive full stake");

        // Step 6: LP withdraws with profit
        vm.prank(lp1);
        uint256 withdrawAmount = vault.withdraw(initialLPShares);

        assertEq(withdrawAmount, 11 ether, "LP should withdraw initial + failed stake");
    }

    /**
     * @notice Test: Multiple challenges, some win, some fail
     */
    function testMultipleChallengesScenario() public {
        // Setup: 2 LPs provide liquidity
        vm.prank(lp1);
        vault.deposit{value: 10 ether}();

        vm.prank(lp2);
        vault.deposit{value: 10 ether}();

        console.log("Total vault assets:", vault.totalAssets());

        // Challenger 1: 7-day challenge (will succeed)
        vm.prank(challenger1);
        challenges.createChallenge{value: 1 ether}(7);
        uint256 id1 = challenges.getUserActiveChallenge(challenger1);

        // Challenger 2: 30-day challenge (will succeed)
        vm.prank(challenger2);
        challenges.createChallenge{value: 2 ether}(30);
        uint256 id2 = challenges.getUserActiveChallenge(challenger2);

        // Challenger 3: 14-day challenge (will fail)
        vm.prank(challenger3);
        challenges.createChallenge{value: 1.5 ether}(14);
        uint256 id3 = challenges.getUserActiveChallenge(challenger3);

        // Simulate: Challenger 1 completes 7 days
        for (uint256 i = 0; i < 7; i++) {
            vm.warp(block.timestamp + GRACE_PERIOD);
            vm.prank(owner);
            challenges.verifyStreak(id1);
        }

        // Challenger 1 claims
        vm.warp(block.timestamp + 1 days);
        vm.prank(challenger1);
        challenges.claimReward(id1);
        console.log("Challenger 1 claimed 7-day reward");

        // Simulate: Challenger 2 completes 30 days
        for (uint256 i = 0; i < 30; i++) {
            vm.warp(block.timestamp + GRACE_PERIOD);
            vm.prank(owner);
            challenges.verifyStreak(id2);
        }

        // Challenger 2 claims
        vm.warp(block.timestamp + 1 days);
        vm.prank(challenger2);
        challenges.claimReward(id2);
        console.log("Challenger 2 claimed 30-day reward");

        // Simulate: Challenger 3 fails after 5 days
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(block.timestamp + GRACE_PERIOD);
            vm.prank(owner);
            challenges.verifyStreak(id3);
        }

        vm.prank(owner);
        challenges.markChallengeFailed(id3);
        console.log("Challenger 3 failed");

        // Calculate expected vault balance
        // Initial: 20 ETH
        // Challenger 1: -1.09 ETH payout, +0.01 ETH fee
        // Challenger 2: -2.45 ETH payout (2 ETH + 0.5 ETH bonus - 0.05 ETH fee), +0.05 ETH fee
        // Challenger 3: +1.5 ETH (failed stake)
        // Expected: 20 - 1.09 + 0.01 - 2.45 + 0.05 + 1.5 = 18.02 ETH

        uint256 finalVaultAssets = vault.totalAssets();
        console.log("Final vault assets:", finalVaultAssets);

        // LPs should be able to withdraw proportionally
        uint256 lp1Shares = vault.lpShares(lp1);
        vm.prank(lp1);
        uint256 lp1Withdrawal = vault.withdraw(lp1Shares);

        console.log("LP1 withdrawal:", lp1Withdrawal);

        // LP1 deposited 10 ETH out of 20 ETH total (50%)
        // Should get ~9.01 ETH (50% of 18.02 ETH)
        assertApproxEqAbs(lp1Withdrawal, 9.01 ether, 0.01 ether, "LP1 should get proportional share");
    }

    /**
     * @notice Test: LP withdrawal while challenges are active (liquidity check)
     */
    function testLPWithdrawalWithActiveChallenges() public {
        // LP deposits
        vm.prank(lp1);
        vault.deposit{value: 10 ether}();

        // Multiple challengers stake
        vm.prank(challenger1);
        challenges.createChallenge{value: 2 ether}(7);

        vm.prank(challenger2);
        challenges.createChallenge{value: 3 ether}(30);

        // Vault still has 10 ETH (challenges hold stakes separately in contract)
        // LP tries to withdraw - should work but limited by MAX_WITHDRAWAL_RATIO

        uint256 lpShares = vault.lpShares(lp1);

        // Withdraw should work for reasonable amounts
        vm.prank(lp1);
        uint256 withdrawn = vault.withdraw(lpShares / 2); // Withdraw half

        console.log("LP withdrew half:", withdrawn);
        assertEq(withdrawn, 5 ether, "Should withdraw half");
    }

    /**
     * @notice Test: Revenue distribution among multiple LPs
     */
    function testRevenueDistributionMultipleLPs() public {
        // LP1 deposits 7 ETH
        vm.prank(lp1);
        vault.deposit{value: 7 ether}();

        // LP2 deposits 3 ETH
        vm.prank(lp2);
        vault.deposit{value: 3 ether}();

        uint256 lp1Shares = vault.lpShares(lp1);
        uint256 lp2Shares = vault.lpShares(lp2);

        console.log("LP1 shares:", lp1Shares);
        console.log("LP2 shares:", lp2Shares);

        // Challenger fails, vault gets 5 ETH revenue
        vm.prank(challenger1);
        challenges.createChallenge{value: 5 ether}(7);

        uint256 challengeId = challenges.getUserActiveChallenge(challenger1);

        vm.prank(challenger1);
        challenges.forfeit(challengeId);

        // Total vault: 15 ETH (10 initial + 5 revenue)
        assertEq(vault.totalAssets(), 15 ether, "Vault should have 15 ETH");

        // LP1 should get 70% (10.5 ETH)
        vm.prank(lp1);
        uint256 lp1Withdrawal = vault.withdraw(lp1Shares);
        assertEq(lp1Withdrawal, 10.5 ether, "LP1 should get 70%");

        // LP2 should get 30% (4.5 ETH)
        vm.prank(lp2);
        uint256 lp2Withdrawal = vault.withdraw(lp2Shares);
        assertEq(lp2Withdrawal, 4.5 ether, "LP2 should get 30%");
    }
}
