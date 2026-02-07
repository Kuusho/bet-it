// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title VerifiedContracts
 * @notice Library for managing whitelist of verified MegaETH contracts
 * @dev Only transactions to these contracts count toward streak verification
 */
library VerifiedContracts {
    struct ContractRegistry {
        mapping(address => bool) isVerified;
        address[] contracts;
    }

    event ContractAdded(address indexed contractAddress, string name);
    event ContractRemoved(address indexed contractAddress);

    error ContractAlreadyAdded();
    error ContractNotFound();
    error ZeroAddress();

    /**
     * @notice Add a contract to the verified whitelist
     * @param registry Storage reference to the registry
     * @param contractAddress Address of the contract to add
     */
    function addContract(ContractRegistry storage registry, address contractAddress) internal {
        if (contractAddress == address(0)) revert ZeroAddress();
        if (registry.isVerified[contractAddress]) revert ContractAlreadyAdded();

        registry.isVerified[contractAddress] = true;
        registry.contracts.push(contractAddress);
    }

    /**
     * @notice Remove a contract from the verified whitelist
     * @param registry Storage reference to the registry
     * @param contractAddress Address of the contract to remove
     */
    function removeContract(ContractRegistry storage registry, address contractAddress) internal {
        if (!registry.isVerified[contractAddress]) revert ContractNotFound();

        registry.isVerified[contractAddress] = false;

        // Find and remove from array
        uint256 length = registry.contracts.length;
        for (uint256 i = 0; i < length; i++) {
            if (registry.contracts[i] == contractAddress) {
                // Move last element to this position and pop
                registry.contracts[i] = registry.contracts[length - 1];
                registry.contracts.pop();
                break;
            }
        }
    }

    /**
     * @notice Check if a contract is verified
     * @param registry Storage reference to the registry
     * @param contractAddress Address to check
     * @return True if contract is verified
     */
    function isContractVerified(
        ContractRegistry storage registry,
        address contractAddress
    ) internal view returns (bool) {
        return registry.isVerified[contractAddress];
    }

    /**
     * @notice Get all verified contracts
     * @param registry Storage reference to the registry
     * @return Array of verified contract addresses
     */
    function getAllContracts(ContractRegistry storage registry) internal view returns (address[] memory) {
        return registry.contracts;
    }

    /**
     * @notice Get total number of verified contracts
     * @param registry Storage reference to the registry
     * @return Count of verified contracts
     */
    function getContractCount(ContractRegistry storage registry) internal view returns (uint256) {
        return registry.contracts.length;
    }
}
