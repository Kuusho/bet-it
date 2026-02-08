'use client';

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useQuery } from '@tanstack/react-query';
import { formatEther } from 'viem';
import Link from 'next/link';
import { useState } from 'react';
import { CONTRACTS, BONUS_RATES } from '@/lib/contracts/config';
import { BetItChallengesABI } from '@/lib/contracts/abis';

async function fetchUserData(address: string) {
  const res = await fetch(`/api/user/${address}`);
  if (!res.ok) throw new Error('Failed to fetch user data');
  return res.json();
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const [showForfeitConfirm, setShowForfeitConfirm] = useState(false);

  // Get user's active challenge from contract
  const { data: activeChallengeId } = useReadContract({
    address: CONTRACTS.CHALLENGES,
    abi: BetItChallengesABI,
    functionName: 'getUserActiveChallenge',
    args: address ? [address] : undefined,
  });

  // Get challenge details if there is one
  const { data: challenge } = useReadContract({
    address: CONTRACTS.CHALLENGES,
    abi: BetItChallengesABI,
    functionName: 'getChallenge',
    args: activeChallengeId && activeChallengeId > 0n ? [activeChallengeId] : undefined,
  });

  // Get user stats from API
  const { data: userData, isLoading: isLoadingUser } = useQuery({
    queryKey: ['userData', address],
    queryFn: () => fetchUserData(address!),
    enabled: !!address,
  });

  // Claim reward mutation
  const { writeContract: claimReward, data: claimHash, isPending: isClaiming } = useWriteContract();
  const { isLoading: isConfirmingClaim, isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({
    hash: claimHash,
  });

  // Forfeit mutation
  const { writeContract: forfeitChallenge, data: forfeitHash, isPending: isForfeitingTx } = useWriteContract();
  const { isLoading: isConfirmingForfeit } = useWaitForTransactionReceipt({ hash: forfeitHash });

  const hasActiveChallenge = activeChallengeId && activeChallengeId > 0n;
  const verificationStatus = userData?.verificationStatus;

  const handleClaim = () => {
    if (!activeChallengeId) return;
    claimReward({
      address: CONTRACTS.CHALLENGES,
      abi: BetItChallengesABI,
      functionName: 'claimReward',
      args: [activeChallengeId],
    });
  };

  const handleForfeit = () => {
    if (!activeChallengeId) return;
    forfeitChallenge({
      address: CONTRACTS.CHALLENGES,
      abi: BetItChallengesABI,
      functionName: 'forfeit',
      args: [activeChallengeId],
    });
    setShowForfeitConfirm(false);
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
        <div className="card p-12 text-center max-w-md">
          <h1 className="text-3xl font-bold mb-4">Connect Your Wallet</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Connect your wallet to view your dashboard and manage challenges
          </p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (isClaimSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-success-50 via-white to-success-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
        <div className="card p-12 max-w-2xl text-center">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="text-4xl font-bold mb-4">Reward Claimed!</h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
            Congratulations on completing your streak challenge!
            Your rewards have been sent to your wallet.
          </p>
          <Link href="/bet-it/create" className="btn btn-primary">
            Start New Challenge
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Navigation */}
      <nav className="container mx-auto px-4 py-6 flex justify-between items-center">
        <Link href="/bet-it" className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          Bet It
        </Link>
        <ConnectButton />
      </nav>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">
              Your Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {userData?.user?.username || address?.slice(0, 6) + '...' + address?.slice(-4)}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Active Challenge */}
              {hasActiveChallenge && challenge ? (
                <div className="card p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">Active Challenge</h2>
                      <p className="text-gray-600 dark:text-gray-400">
                        {Number(challenge[2])} days • {formatEther(challenge[1])} ETH stake
                      </p>
                    </div>
                    <div className={`px-4 py-2 rounded-full text-sm font-semibold ${
                      verificationStatus?.atRisk
                        ? 'bg-danger-100 text-danger-700 animate-pulse-glow'
                        : 'bg-success-100 text-success-700'
                    }`}>
                      {verificationStatus?.atRisk ? '⚠️ At Risk' : '✓ On Track'}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-6">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-semibold">
                        Day {verificationStatus?.daysVerified || 0} / {verificationStatus?.totalDays || Number(challenge[2])}
                      </span>
                      <span className="text-gray-600">
                        {Math.round(((verificationStatus?.daysVerified || 0) / (verificationStatus?.totalDays || 1)) * 100)}% Complete
                      </span>
                    </div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-success transition-all duration-500"
                        style={{
                          width: `${Math.round(((verificationStatus?.daysVerified || 0) / (verificationStatus?.totalDays || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Stake</div>
                      <div className="text-2xl font-bold">{formatEther(challenge[1])} ETH</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Potential Payout</div>
                      <div className="text-2xl font-bold text-success-600">
                        {(Number(formatEther(challenge[1])) * (1 + (Number(challenge[3]) / 10000) * 0.9)).toFixed(4)} ETH
                      </div>
                    </div>
                  </div>

                  {/* Last Activity */}
                  {verificationStatus?.lastVerified && (
                    <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg mb-6">
                      <div className="text-sm font-semibold mb-1">Last Verified</div>
                      <div className="text-gray-700 dark:text-gray-300">
                        {new Date(verificationStatus.lastVerified).toLocaleString()}
                      </div>
                      {verificationStatus.nextVerificationDue && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                          Next verification due: {new Date(verificationStatus.nextVerificationDue).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-4">
                    {challenge[6] && !challenge[7] && (
                      <button
                        onClick={handleClaim}
                        disabled={isClaiming || isConfirmingClaim}
                        className="btn btn-success flex-1 disabled:opacity-50"
                      >
                        {isClaiming || isConfirmingClaim ? 'Claiming...' : 'Claim Reward'}
                      </button>
                    )}
                    <button
                      onClick={() => setShowForfeitConfirm(true)}
                      disabled={isForfeitingTx || isConfirmingForfeit}
                      className="btn btn-outline border-danger-600 text-danger-600 hover:bg-danger-50"
                    >
                      Forfeit Challenge
                    </button>
                  </div>
                </div>
              ) : (
                <div className="card p-12 text-center">
                  <div className="text-6xl mb-4">🎯</div>
                  <h2 className="text-2xl font-bold mb-4">No Active Challenge</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Start a new challenge to begin earning bonuses on your MegaETH streak
                  </p>
                  <Link href="/bet-it/create" className="btn btn-primary">
                    Create Challenge
                  </Link>
                </div>
              )}

              {/* Past Challenges */}
              {userData?.stats && (userData.stats.completed > 0 || userData.stats.failed > 0) && (
                <div className="card p-6">
                  <h2 className="text-xl font-bold mb-4">Challenge History</h2>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-success-50 dark:bg-success-900/20 rounded-lg">
                      <div className="text-3xl font-bold text-success-600">{userData.stats.completed}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Completed</div>
                    </div>
                    <div className="text-center p-4 bg-danger-50 dark:bg-danger-900/20 rounded-lg">
                      <div className="text-3xl font-bold text-danger-600">{userData.stats.failed}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Failed</div>
                    </div>
                    <div className="text-center p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                      <div className="text-3xl font-bold text-primary-600">{userData.stats.successRate}%</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Success Rate</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="card p-6">
                <h3 className="font-bold mb-4">Your Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Challenges</span>
                    <span className="font-bold">{userData?.stats?.totalChallenges || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Active</span>
                    <span className="font-bold text-primary-600">{userData?.stats?.active || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Completed</span>
                    <span className="font-bold text-success-600">{userData?.stats?.completed || 0}</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="card p-6">
                <h3 className="font-bold mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <Link href="/bet-it/create" className="btn btn-primary w-full">
                    New Challenge
                  </Link>
                  <Link href="/bet-it/lp-vault" className="btn btn-outline w-full">
                    LP Vault
                  </Link>
                  <Link href="/bet-it" className="btn btn-outline w-full">
                    Home
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Forfeit Confirmation Modal */}
      {showForfeitConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="card p-8 max-w-md">
            <h2 className="text-2xl font-bold mb-4">Forfeit Challenge?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to forfeit your challenge? You will lose your staked ETH.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowForfeitConfirm(false)}
                className="btn btn-outline flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleForfeit}
                className="btn bg-danger-600 hover:bg-danger-700 text-white flex-1"
              >
                Forfeit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
