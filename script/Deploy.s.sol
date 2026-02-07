// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Script.sol";
import "../src/BetItVault.sol";
import "../src/BetItChallenges.sol";

/**
 * @title Deploy Script
 * @notice Deploys BetIt contracts to MegaETH mainnet
 * @dev Run with: forge script script/Deploy.s.sol:DeployScript --rpc-url $MEGAETH_RPC_URL --broadcast
 */
contract DeployScript is Script {
    function run() external {
        // Load deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address multisig = vm.envAddress("MULTISIG_ADDRESS");

        console.log("Deploying BetIt contracts...");
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("Multisig:", multisig);

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy BetItVault
        BetItVault vault = new BetItVault();
        console.log("BetItVault deployed at:", address(vault));

        // Step 2: Deploy BetItChallenges
        BetItChallenges challenges = new BetItChallenges(address(vault));
        console.log("BetItChallenges deployed at:", address(challenges));

        // Step 3: Set BetItChallenges as authorized payer in vault
        vault.setAuthorizedPayer(address(challenges));
        console.log("Set BetItChallenges as authorized payer");

        // Step 4: Add initial verified contracts
        // TODO: Replace these addresses with actual MegaETH contract addresses
        address[] memory verifiedContracts = getInitialVerifiedContracts();

        for (uint256 i = 0; i < verifiedContracts.length; i++) {
            challenges.addVerifiedContract(verifiedContracts[i]);
            console.log("Added verified contract:", verifiedContracts[i]);
        }

        console.log("Added", verifiedContracts.length, "verified contracts");

        // Step 5: Transfer ownership to multisig
        vault.transferOwnership(multisig);
        challenges.transferOwnership(multisig);
        console.log("Transferred ownership to multisig");

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("BetItVault:", address(vault));
        console.log("BetItChallenges:", address(challenges));
        console.log("Owner (Multisig):", multisig);
        console.log("\nNext steps:");
        console.log("1. Verify contracts on Blockscout:");
        console.log("   forge verify-contract", address(vault), "BetItVault --chain-id 4326");
        console.log("   forge verify-contract", address(challenges), "BetItChallenges --chain-id 4326 --constructor-args $(cast abi-encode \"constructor(address)\"", address(vault), ")");
        console.log("2. Fund vault with initial LP capital (1-2 ETH)");
        console.log("3. Update frontend environment variables with contract addresses");
    }

    /**
     * @notice Get initial list of verified MegaETH contracts
     * @dev This is a placeholder - replace with actual contract addresses
     */
    function getInitialVerifiedContracts() internal pure returns (address[] memory) {
        // Placeholder addresses - MUST be updated before mainnet deployment
        address[] memory contracts = new address[](10);

        // Example contracts (replace with actual MegaETH contracts):
        // - USDm (MegaETH stablecoin)
        // - MegaSwap (DEX)
        // - NFT marketplaces
        // - Social apps
        // - Gaming contracts
        // - DeFi protocols

        contracts[0] = address(0x1111111111111111111111111111111111111111); // USDm
        contracts[1] = address(0x2222222222222222222222222222222222222222); // MegaSwap
        contracts[2] = address(0x3333333333333333333333333333333333333333); // NFT Marketplace
        contracts[3] = address(0x4444444444444444444444444444444444444444); // Social App 1
        contracts[4] = address(0x5555555555555555555555555555555555555555); // Social App 2
        contracts[5] = address(0x6666666666666666666666666666666666666666); // Gaming Contract 1
        contracts[6] = address(0x7777777777777777777777777777777777777777); // Gaming Contract 2
        contracts[7] = address(0x8888888888888888888888888888888888888888); // DeFi Protocol 1
        contracts[8] = address(0x9999999999999999999999999999999999999999); // DeFi Protocol 2
        contracts[9] = address(0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA); // DeFi Protocol 3

        return contracts;
    }
}

/**
 * @title Seed Vault Script
 * @notice Seeds the vault with initial LP capital after deployment
 * @dev Run AFTER deployment: forge script script/Deploy.s.sol:SeedVaultScript --rpc-url $MEGAETH_RPC_URL --broadcast
 */
contract SeedVaultScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address vaultAddress = vm.envAddress("VAULT_ADDRESS");
        uint256 seedAmount = vm.envOr("SEED_AMOUNT", 1 ether); // Default 1 ETH

        console.log("Seeding vault with", seedAmount, "wei");

        vm.startBroadcast(deployerPrivateKey);

        BetItVault vault = BetItVault(payable(vaultAddress));
        vault.deposit{value: seedAmount}();

        console.log("Vault seeded successfully");
        console.log("Total vault assets:", vault.totalAssets());

        vm.stopBroadcast();
    }
}
