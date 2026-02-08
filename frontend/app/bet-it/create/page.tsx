'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { CONTRACTS, BONUS_RATES, MIN_STAKE, MAX_STAKE, type Duration } from '@/lib/contracts/config';
import { BetItChallengesABI } from '@/lib/contracts/abis';

export default function CreateChallengePage() {
  const { address, isConnected } = useAccount();
  const [duration, setDuration] = useState<Duration>(30);
  const [stakeAmount, setStakeAmount] = useState('0.1');
  const [error, setError] = useState('');

  const { writeContract, data: hash, isPending: isWriting } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const bonusRate = BONUS_RATES[duration];
  const bonusMultiplier = bonusRate / 100;

  // Calculate payout
  const stake = parseFloat(stakeAmount) || 0;
  const bonus = stake * (bonusMultiplier / 100);
  const platformFee = bonus * 0.1; // 10% of bonus
  const payout = stake + bonus - platformFee;
  const profit = payout - stake;

  const handleCreateChallenge = async () => {
    setError('');

    // Validation
    if (stake < MIN_STAKE) {
      setError(`Minimum stake is ${MIN_STAKE} ETH`);
      return;
    }

    if (stake > MAX_STAKE) {
      setError(`Maximum stake is ${MAX_STAKE} ETH`);
      return;
    }

    if (!address) {
      setError('Please connect your wallet');
      return;
    }

    try {
      writeContract({
        address: CONTRACTS.CHALLENGES,
        abi: BetItChallengesABI,
        functionName: 'createChallenge',
        args: [BigInt(duration)],
        value: parseEther(stakeAmount),
      });
    } catch (err) {
      console.error('Error creating challenge:', err);
      setError(err instanceof Error ? err.message : 'Failed to create challenge');
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-success-50 via-white to-success-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
        <div className="card p-12 max-w-2xl text-center">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="text-4xl font-bold mb-4">Challenge Created!</h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
            Your {duration}-day streak challenge is now active.
            Make sure to transact daily with verified MegaETH contracts!
          </p>
          <div className="space-y-4">
            <Link href="/bet-it/dashboard" className="btn btn-primary block">
              View Dashboard
            </Link>
            <Link href="/bet-it" className="btn btn-outline block">
              Back to Home
            </Link>
          </div>
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

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4">
              Create Your <span className="bg-gradient-success bg-clip-text text-transparent">Streak Challenge</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Stake ETH on your ability to transact daily on MegaETH
            </p>
          </div>

          {/* Main Form Card */}
          <div className="card p-8 mb-6">
            {/* Duration Selector */}
            <div className="mb-8">
              <label className="block text-sm font-semibold mb-3">Challenge Duration</label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {([7, 14, 30, 60, 90] as Duration[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      duration === d
                        ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                    }`}
                  >
                    <div className="font-bold text-lg">{d} Days</div>
                    <div className="text-sm text-success-600 font-semibold">+{BONUS_RATES[d]}%</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Stake Amount Input */}
            <div className="mb-8">
              <label className="block text-sm font-semibold mb-3">Stake Amount (ETH)</label>
              <div className="relative">
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  min={MIN_STAKE}
                  max={MAX_STAKE}
                  step="0.01"
                  className="w-full p-4 text-2xl font-bold border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-primary-600 focus:outline-none bg-white dark:bg-gray-800"
                  placeholder="0.1"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  ETH
                </div>
              </div>
              <div className="flex justify-between mt-2 text-sm text-gray-500">
                <span>Min: {MIN_STAKE} ETH</span>
                <span>Max: {MAX_STAKE} ETH</span>
              </div>
            </div>

            {/* Bonus Calculator */}
            <div className="bg-gradient-success p-6 rounded-lg mb-8">
              <h3 className="text-white font-bold mb-4 text-lg">Potential Payout</h3>
              <div className="space-y-3 text-white">
                <div className="flex justify-between items-center">
                  <span className="opacity-90">Your Stake</span>
                  <span className="font-bold text-xl">{stake.toFixed(4)} ETH</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="opacity-90">Bonus ({bonusRate}%)</span>
                  <span className="font-bold text-xl">+{bonus.toFixed(4)} ETH</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="opacity-90">Platform Fee (10% of bonus)</span>
                  <span className="font-bold text-xl">-{platformFee.toFixed(4)} ETH</span>
                </div>
                <div className="border-t border-white/30 pt-3 mt-3"></div>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg">Total Payout</span>
                  <span className="font-bold text-3xl">{payout.toFixed(4)} ETH</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold">Your Profit</span>
                  <span className="font-bold text-2xl text-success-200">+{profit.toFixed(4)} ETH</span>
                </div>
              </div>
            </div>

            {/* Requirements Checklist */}
            <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg mb-6">
              <h3 className="font-bold mb-3">Challenge Requirements</h3>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <span className="text-success-600 mr-2">✓</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    Make at least one transaction per day to a verified MegaETH contract
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="text-success-600 mr-2">✓</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    No missed days allowed (24-hour window for each day)
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="text-success-600 mr-2">✓</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    Complete the full {duration}-day duration to claim your reward
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="text-danger-600 mr-2">✗</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    If you miss a day, your stake goes to the LP vault
                  </span>
                </li>
              </ul>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-danger-50 border-2 border-danger-500 text-danger-700 p-4 rounded-lg mb-6">
                {error}
              </div>
            )}

            {/* Create Button */}
            {!isConnected ? (
              <div className="text-center">
                <ConnectButton />
              </div>
            ) : (
              <button
                onClick={handleCreateChallenge}
                disabled={isWriting || isConfirming || stake < MIN_STAKE || stake > MAX_STAKE}
                className="w-full btn btn-primary text-xl py-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isWriting && 'Preparing Transaction...'}
                {isConfirming && 'Confirming Transaction...'}
                {!isWriting && !isConfirming && `Create ${duration}-Day Challenge`}
              </button>
            )}
          </div>

          {/* Info Note */}
          <div className="text-center text-sm text-gray-500">
            By creating a challenge, you agree to the{' '}
            <a href="#" className="text-primary-600 hover:underline">terms and conditions</a>.
            Your stake will be locked until you complete the challenge or forfeit.
          </div>
        </div>
      </div>
    </div>
  );
}
