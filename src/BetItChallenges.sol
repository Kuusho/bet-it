// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IBetItVault.sol";
import "./libraries/VerifiedContracts.sol";

/**
 * @title BetItChallenges
 * @notice Manages user challenges for maintaining MegaETH transaction streaks
 * @dev Users stake ETH, maintain daily transactions to verified contracts, and win bonuses
 */
contract BetItChallenges is Ownable, ReentrancyGuard {
    using VerifiedContracts for VerifiedContracts.ContractRegistry;

    /// @notice Challenge data structure
    struct Challenge {
        address user;
        uint256 stake;
        uint256 duration; // in days
        uint256 bonusRate; // in basis points (100 = 1%)
        uint256 startDate;
        uint256 lastVerified;
        bool active;
        bool claimed;
    }

    /// @notice Reference to the LP vault contract
    IBetItVault public immutable vault;

    /// @notice Registry of verified MegaETH contracts
    VerifiedContracts.ContractRegistry private verifiedRegistry;

    /// @notice Mapping of challenge ID to Challenge struct
    mapping(uint256 => Challenge) public challenges;

    /// @notice Mapping of user address to their active challenge ID (0 = none)
    mapping(address => uint256) public userActiveChallenge;

    /// @notice Counter for challenge IDs
    uint256 private _nextChallengeId = 1;

    /// @notice Platform fee on successful claims (10% = 1000 basis points)
    uint256 public constant PLATFORM_FEE = 1000; // 10%
    uint256 public constant BASIS_POINTS = 10000;

    /// @notice Minimum stake amount
    uint256 public constant MIN_STAKE = 0.01 ether;

    /// @notice Maximum stake amount to prevent excessive risk
    uint256 public constant MAX_STAKE = 100 ether;

    /// @notice Grace period before verification starts (24 hours)
    uint256 public constant GRACE_PERIOD = 1 days;

    /// @notice Bonus rates for different durations (in basis points)
    mapping(uint256 => uint256) public bonusRates;

    event ChallengeCreated(
        uint256 indexed challengeId,
        address indexed user,
        uint256 stake,
        uint256 duration,
        uint256 bonusRate
    );

    event StreakVerified(uint256 indexed challengeId, address indexed user, uint256 dayVerified);

    event ChallengeCompleted(
        uint256 indexed challengeId,
        address indexed user,
        uint256 payout,
        uint256 profit
    );

    event ChallengeForfeit(uint256 indexed challengeId, address indexed user, uint256 stakeForfeited);

    event VerifiedContractAdded(address indexed contractAddress);
    event VerifiedContractRemoved(address indexed contractAddress);

    error InvalidDuration();
    error InvalidStakeAmount();
    error UserHasActiveChallenge();
    error ChallengeNotActive();
    error ChallengeNotComplete();
    error AlreadyClaimed();
    error NotChallengeOwner();
    error StreakBroken();
    error TooEarlyToVerify();

    constructor(address vaultAddress) Ownable(msg.sender) {
        vault = IBetItVault(vaultAddress);

        // Initialize bonus rates
        bonusRates[7] = 1000; // 7 days = 10%
        bonusRates[14] = 1500; // 14 days = 15%
        bonusRates[30] = 2500; // 30 days = 25%
        bonusRates[60] = 4000; // 60 days = 40%
        bonusRates[90] = 6000; // 90 days = 60%
    }

    /**
     * @notice Create a new challenge
     * @param duration Challenge duration in days (7, 14, 30, 60, or 90)
     */
    function createChallenge(uint256 duration) external payable nonReentrant {
        if (msg.value < MIN_STAKE || msg.value > MAX_STAKE) revert InvalidStakeAmount();
        if (bonusRates[duration] == 0) revert InvalidDuration();
        if (userActiveChallenge[msg.sender] != 0) revert UserHasActiveChallenge();

        uint256 challengeId = _nextChallengeId++;
        uint256 bonusRate = bonusRates[duration];

        challenges[challengeId] = Challenge({
            user: msg.sender,
            stake: msg.value,
            duration: duration,
            bonusRate: bonusRate,
            startDate: block.timestamp,
            lastVerified: block.timestamp, // Start with current time
            active: true,
            claimed: false
        });

        userActiveChallenge[msg.sender] = challengeId;

        emit ChallengeCreated(challengeId, msg.sender, msg.value, duration, bonusRate);
    }

    /**
     * @notice Verify daily streak for a challenge (called by backend service)
     * @param challengeId Challenge ID to verify
     * @dev This is called after backend confirms transaction to verified contract
     */
    function verifyStreak(uint256 challengeId) external onlyOwner {
        Challenge storage challenge = challenges[challengeId];

        if (!challenge.active) revert ChallengeNotActive();

        // Ensure at least GRACE_PERIOD has passed since last verification
        if (block.timestamp < challenge.lastVerified + GRACE_PERIOD) {
            revert TooEarlyToVerify();
        }

        // Update last verified time
        challenge.lastVerified = block.timestamp;

        uint256 dayNumber = (block.timestamp - challenge.startDate) / 1 days;
        emit StreakVerified(challengeId, challenge.user, dayNumber);
    }

    /**
     * @notice Claim reward after successfully completing challenge
     * @param challengeId Challenge ID to claim
     */
    function claimReward(uint256 challengeId) external nonReentrant {
        Challenge storage challenge = challenges[challengeId];

        if (msg.sender != challenge.user) revert NotChallengeOwner();
        if (!challenge.active) revert ChallengeNotActive();
        if (challenge.claimed) revert AlreadyClaimed();

        // Check if challenge duration is complete
        uint256 endDate = challenge.startDate + (challenge.duration * 1 days);
        if (block.timestamp < endDate) revert ChallengeNotComplete();

        // Check if streak was maintained (lastVerified should be recent)
        uint256 daysSinceVerification = (block.timestamp - challenge.lastVerified) / 1 days;
        if (daysSinceVerification > 1) revert StreakBroken();

        // Calculate payout: stake + bonus - platform fee
        uint256 bonus = (challenge.stake * challenge.bonusRate) / BASIS_POINTS;
        uint256 totalBeforeFee = challenge.stake + bonus;
        uint256 platformFee = (bonus * PLATFORM_FEE) / BASIS_POINTS;
        uint256 payout = totalBeforeFee - platformFee;
        uint256 profit = payout - challenge.stake;

        // Mark as claimed
        challenge.active = false;
        challenge.claimed = true;
        userActiveChallenge[msg.sender] = 0;

        // Send platform fee to vault as revenue
        if (platformFee > 0) {
            vault.addRevenue{value: platformFee}();
        }

        emit ChallengeCompleted(challengeId, challenge.user, payout, profit);

        // Pay challenger from vault
        vault.payChallenger(challenge.user, payout);
    }

    /**
     * @notice Forfeit challenge and lose stake
     * @param challengeId Challenge ID to forfeit
     */
    function forfeit(uint256 challengeId) external nonReentrant {
        Challenge storage challenge = challenges[challengeId];

        if (msg.sender != challenge.user) revert NotChallengeOwner();
        if (!challenge.active) revert ChallengeNotActive();

        uint256 stakeAmount = challenge.stake;

        // Mark as inactive
        challenge.active = false;
        userActiveChallenge[msg.sender] = 0;

        emit ChallengeForfeit(challengeId, challenge.user, stakeAmount);

        // Send failed stake to vault as LP revenue
        vault.addRevenue{value: stakeAmount}();
    }

    /**
     * @notice Admin function to mark challenge as failed (called when streak is broken)
     * @param challengeId Challenge ID to fail
     */
    function markChallengeFailed(uint256 challengeId) external onlyOwner {
        Challenge storage challenge = challenges[challengeId];

        if (!challenge.active) revert ChallengeNotActive();

        uint256 stakeAmount = challenge.stake;

        // Mark as inactive
        challenge.active = false;
        userActiveChallenge[challenge.user] = 0;

        emit ChallengeForfeit(challengeId, challenge.user, stakeAmount);

        // Send failed stake to vault as LP revenue
        vault.addRevenue{value: stakeAmount}();
    }

    /**
     * @notice Add a verified contract to the whitelist
     * @param contractAddress Address of contract to add
     */
    function addVerifiedContract(address contractAddress) external onlyOwner {
        verifiedRegistry.addContract(contractAddress);
        emit VerifiedContractAdded(contractAddress);
    }

    /**
     * @notice Remove a verified contract from the whitelist
     * @param contractAddress Address of contract to remove
     */
    function removeVerifiedContract(address contractAddress) external onlyOwner {
        verifiedRegistry.removeContract(contractAddress);
        emit VerifiedContractRemoved(contractAddress);
    }

    /**
     * @notice Check if a contract is verified
     * @param contractAddress Address to check
     * @return True if verified
     */
    function isVerifiedContract(address contractAddress) external view returns (bool) {
        return verifiedRegistry.isContractVerified(contractAddress);
    }

    /**
     * @notice Get all verified contracts
     * @return Array of verified contract addresses
     */
    function getAllVerifiedContracts() external view returns (address[] memory) {
        return verifiedRegistry.getAllContracts();
    }

    /**
     * @notice Get challenge details
     * @param challengeId Challenge ID
     * @return Challenge struct
     */
    function getChallenge(uint256 challengeId) external view returns (Challenge memory) {
        return challenges[challengeId];
    }

    /**
     * @notice Get user's active challenge ID
     * @param user User address
     * @return Challenge ID (0 if none)
     */
    function getUserActiveChallenge(address user) external view returns (uint256) {
        return userActiveChallenge[user];
    }

    /**
     * @notice Update bonus rate for a duration
     * @param duration Duration in days
     * @param bonusRate Bonus rate in basis points
     */
    function updateBonusRate(uint256 duration, uint256 bonusRate) external onlyOwner {
        bonusRates[duration] = bonusRate;
    }
}
