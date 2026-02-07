// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IBetItVault.sol";

/**
 * @title BetItVault
 * @notice ERC-4626-style vault for LP deposits that earns yield from failed challenges
 * @dev LPs deposit ETH, receive shares, and earn yield when challengers fail
 */
contract BetItVault is IBetItVault, Ownable, ReentrancyGuard {
    /// @notice Total number of vault shares issued
    uint256 private _totalShares;

    /// @notice Mapping of LP address to their vault shares
    mapping(address => uint256) private _shares;

    /// @notice Authorized contract that can pay challengers (BetItChallenges)
    address public authorizedPayer;

    /// @notice Minimum deposit amount to prevent dust attacks
    uint256 public constant MIN_DEPOSIT = 0.001 ether;

    /// @notice Maximum single withdrawal to prevent bank run (90% of vault)
    uint256 public constant MAX_WITHDRAWAL_RATIO = 90;

    error InsufficientDeposit();
    error InsufficientShares();
    error InsufficientVaultBalance();
    error Unauthorized();
    error TransferFailed();
    error ExcessiveWithdrawal();

    modifier onlyAuthorized() {
        if (msg.sender != authorizedPayer) revert Unauthorized();
        _;
    }

    constructor() Ownable(msg.sender) {
        // Initial state: no shares, no authorized payer yet
    }

    /**
     * @notice Set the authorized payer contract (BetItChallenges)
     * @param payer Address of the BetItChallenges contract
     */
    function setAuthorizedPayer(address payer) external onlyOwner {
        authorizedPayer = payer;
    }

    /**
     * @inheritdoc IBetItVault
     */
    function deposit() external payable nonReentrant returns (uint256 shares) {
        if (msg.value < MIN_DEPOSIT) revert InsufficientDeposit();

        // Calculate shares based on current vault value
        // First deposit: 1:1 ratio (1 ETH = 1e18 shares)
        // Subsequent: shares proportional to deposit vs total assets
        uint256 totalAssetsBefore = totalAssets() - msg.value;

        if (_totalShares == 0 || totalAssetsBefore == 0) {
            shares = msg.value; // 1:1 initial ratio
        } else {
            shares = (msg.value * _totalShares) / totalAssetsBefore;
        }

        _shares[msg.sender] += shares;
        _totalShares += shares;

        emit Deposit(msg.sender, msg.value, shares);
    }

    /**
     * @inheritdoc IBetItVault
     */
    function withdraw(uint256 shares) external nonReentrant returns (uint256 amount) {
        if (shares == 0) revert InsufficientShares();
        if (_shares[msg.sender] < shares) revert InsufficientShares();

        // Calculate ETH amount based on share ratio
        amount = sharesToAssets(shares);

        if (amount == 0) revert InsufficientShares();
        if (address(this).balance < amount) revert InsufficientVaultBalance();

        // Prevent single withdrawal from draining vault (max 90%) when LP doesn't own all shares
        // If LP owns all shares, allow full withdrawal
        if (shares < _totalShares) {
            if (amount > (address(this).balance * MAX_WITHDRAWAL_RATIO) / 100) {
                revert ExcessiveWithdrawal();
            }
        }

        _shares[msg.sender] -= shares;
        _totalShares -= shares;

        emit Withdraw(msg.sender, amount, shares);

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @inheritdoc IBetItVault
     * @dev Revenue from failed stakes and platform fees increases vault value
     */
    function addRevenue() external payable {
        // Anyone can add revenue, but typically called by BetItChallenges
        emit RevenueAdded(msg.sender, msg.value);
    }

    /**
     * @inheritdoc IBetItVault
     * @dev Only authorized contract (BetItChallenges) can trigger payouts
     */
    function payChallenger(address challenger, uint256 amount) external onlyAuthorized nonReentrant {
        if (address(this).balance < amount) revert InsufficientVaultBalance();

        emit ChallengerPaid(challenger, amount);

        (bool success, ) = challenger.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @inheritdoc IBetItVault
     */
    function totalAssets() public view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @inheritdoc IBetItVault
     */
    function lpShares(address lp) external view returns (uint256) {
        return _shares[lp];
    }

    /**
     * @inheritdoc IBetItVault
     */
    function totalShares() external view returns (uint256) {
        return _totalShares;
    }

    /**
     * @inheritdoc IBetItVault
     */
    function sharesToAssets(uint256 shares) public view returns (uint256) {
        if (_totalShares == 0) return 0;
        return (shares * totalAssets()) / _totalShares;
    }

    /**
     * @inheritdoc IBetItVault
     */
    function assetsToShares(uint256 assets) public view returns (uint256) {
        uint256 totalAssetsBefore = totalAssets();
        if (_totalShares == 0 || totalAssetsBefore == 0) return assets;
        return (assets * _totalShares) / totalAssetsBefore;
    }

    /**
     * @notice Allow contract to receive ETH directly (e.g., from refunds)
     */
    receive() external payable {
        emit RevenueAdded(msg.sender, msg.value);
    }
}
