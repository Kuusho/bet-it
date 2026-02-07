// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IBetItVault
 * @notice Interface for the BetIt LP Vault
 * @dev Manages LP deposits and distributes revenue from failed challenges
 */
interface IBetItVault {
    /**
     * @notice Emitted when an LP deposits ETH
     * @param lp Address of the liquidity provider
     * @param amount Amount of ETH deposited
     * @param shares Number of vault shares minted
     */
    event Deposit(address indexed lp, uint256 amount, uint256 shares);

    /**
     * @notice Emitted when an LP withdraws ETH
     * @param lp Address of the liquidity provider
     * @param amount Amount of ETH withdrawn
     * @param shares Number of vault shares burned
     */
    event Withdraw(address indexed lp, uint256 amount, uint256 shares);

    /**
     * @notice Emitted when revenue is added to the vault
     * @param source Address that added revenue (usually BetItChallenges contract)
     * @param amount Amount of ETH added as revenue
     */
    event RevenueAdded(address indexed source, uint256 amount);

    /**
     * @notice Emitted when a challenger is paid their reward
     * @param challenger Address of the successful challenger
     * @param amount Amount of ETH paid out
     */
    event ChallengerPaid(address indexed challenger, uint256 amount);

    /**
     * @notice Deposit ETH and receive vault shares
     * @return shares Number of shares minted
     */
    function deposit() external payable returns (uint256 shares);

    /**
     * @notice Withdraw ETH by burning vault shares
     * @param shares Number of shares to burn
     * @return amount Amount of ETH withdrawn
     */
    function withdraw(uint256 shares) external returns (uint256 amount);

    /**
     * @notice Add revenue to the vault (increases LP yield)
     * @dev Only callable by authorized contracts (BetItChallenges)
     */
    function addRevenue() external payable;

    /**
     * @notice Pay a successful challenger from vault funds
     * @dev Only callable by authorized contracts (BetItChallenges)
     * @param challenger Address to receive payment
     * @param amount Amount of ETH to pay
     */
    function payChallenger(address challenger, uint256 amount) external;

    /**
     * @notice Get total assets under management (ETH in vault)
     * @return Total ETH balance
     */
    function totalAssets() external view returns (uint256);

    /**
     * @notice Get LP shares for an address
     * @param lp Address of the liquidity provider
     * @return Number of vault shares owned
     */
    function lpShares(address lp) external view returns (uint256);

    /**
     * @notice Get total number of vault shares issued
     * @return Total shares
     */
    function totalShares() external view returns (uint256);

    /**
     * @notice Calculate ETH value of shares
     * @param shares Number of shares
     * @return ETH value
     */
    function sharesToAssets(uint256 shares) external view returns (uint256);

    /**
     * @notice Calculate shares from ETH amount
     * @param assets Amount of ETH
     * @return Number of shares
     */
    function assetsToShares(uint256 assets) external view returns (uint256);
}
