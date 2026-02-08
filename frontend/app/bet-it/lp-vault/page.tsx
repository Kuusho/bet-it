'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatEther, parseEther } from 'viem';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CONTRACTS } from '@/lib/contracts/config';
import { BetItVaultABI } from '@/lib/contracts/abis';

async function fetchPlatformStats() {
  const res = await fetch('/api/platform-stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export default function LPVaultPage() {
  const { address, isConnected } = useAccount();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawShares, setWithdrawShares] = useState('');
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');

  // Get wallet balance
  const { data: walletBalance } = useBalance({ address });

  // Get vault stats
  const { data: stats } = useQuery({
    queryKey: ['platformStats'],
    queryFn: fetchPlatformStats,
    refetchInterval: 30000,
  });

  // Get user's LP shares
  const { data: userShares } = useReadContract({
    address: CONTRACTS.VAULT,
    abi: BetItVaultABI,
    functionName: 'lpShares',
    args: address ? [address] : undefined,
  });

  // Get total shares
  const { data: totalShares } = useReadContract({
    address: CONTRACTS.VAULT,
    abi: BetItVaultABI,
    functionName: 'totalShares',
  });

  // Convert shares to assets
  const { data: userSharesValue } = useReadContract({
    address: CONTRACTS.VAULT,
    abi: BetItVaultABI,
    functionName: 'sharesToAssets',
    args: userShares ? [userShares] : undefined,
  });

  // Deposit mutation
  const { writeContract: deposit, data: depositHash, isPending: isDepositing } = useWriteContract();
  const { isLoading: isConfirmingDeposit, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({
    hash: depositHash,
  });

  // Withdraw mutation
  const { writeContract: withdraw, data: withdrawHash, isPending: isWithdrawing } = useWriteContract();
  const { isLoading: isConfirmingWithdraw, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({
    hash: withdrawHash,
  });

  const handleDeposit = () => {
    if (!depositAmount) return;
    deposit({
      address: CONTRACTS.VAULT,
      abi: BetItVaultABI,
      functionName: 'deposit',
      value: parseEther(depositAmount),
    });
  };

  const handleWithdraw = () => {
    if (!withdrawShares) return;
    withdraw({
      address: CONTRACTS.VAULT,
      abi: BetItVaultABI,
      functionName: 'withdraw',
      args: [parseEther(withdrawShares)],
    });
  };

  const userSharesPercent = totalShares && userShares
    ? (Number(userShares) / Number(totalShares)) * 100
    : 0;

  const userProfit = userSharesValue && userShares
    ? Number(formatEther(userSharesValue)) - Number(formatEther(userShares))
    : 0;

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
        <div className="card p-12 text-center max-w-md">
          <h1 className="text-3xl font-bold mb-4">Connect Your Wallet</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Connect your wallet to access the LP vault
          </p>
          <ConnectButton />
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
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4">
              LP <span className="bg-gradient-success bg-clip-text text-transparent">Vault</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Provide liquidity and earn yield from failed challenges and platform fees
            </p>
          </div>

          {/* Vault Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="card p-6 text-center">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Total Vault Size</div>
              <div className="text-3xl font-bold text-primary-600">
                {stats?.vault?.totalAssetsETH || '0'} ETH
              </div>
            </div>
            <div className="card p-6 text-center">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Weekly Yield</div>
              <div className="text-3xl font-bold text-success-600">
                {stats?.vault?.weeklyYield || '0'}%
              </div>
            </div>
            <div className="card p-6 text-center">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Active Challenges</div>
              <div className="text-3xl font-bold text-primary-600">
                {stats?.challenges?.active || 0}
              </div>
            </div>
            <div className="card p-6 text-center">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Total LPs</div>
              <div className="text-3xl font-bold text-primary-600">
                {stats?.lp?.count || 0}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Your Position */}
              {userShares && userShares > 0n ? (
                <div className="card p-6">
                  <h2 className="text-2xl font-bold mb-6">Your Position</h2>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg">
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Your Shares</div>
                      <div className="text-2xl font-bold">{Number(formatEther(userShares)).toFixed(4)}</div>
                      <div className="text-xs text-gray-500 mt-1">{userSharesPercent.toFixed(2)}% of vault</div>
                    </div>
                    <div className="bg-success-50 dark:bg-success-900/20 p-4 rounded-lg">
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Current Value</div>
                      <div className="text-2xl font-bold text-success-600">
                        {userSharesValue ? Number(formatEther(userSharesValue)).toFixed(4) : '0'} ETH
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {userProfit >= 0 ? '+' : ''}{userProfit.toFixed(4)} ETH profit
                      </div>
                    </div>
                  </div>

                  {/* Performance */}
                  {userProfit !== 0 && (
                    <div className={`p-4 rounded-lg ${
                      userProfit > 0
                        ? 'bg-success-50 dark:bg-success-900/20 border-2 border-success-200'
                        : 'bg-danger-50 dark:bg-danger-900/20 border-2 border-danger-200'
                    }`}>
                      <div className="text-sm font-semibold mb-1">
                        {userProfit > 0 ? '📈 Earning' : '📉 Loss'}
                      </div>
                      <div className={`text-2xl font-bold ${
                        userProfit > 0 ? 'text-success-600' : 'text-danger-600'
                      }`}>
                        {userProfit >= 0 ? '+' : ''}{((userProfit / Number(formatEther(userShares))) * 100).toFixed(2)}% ROI
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="card p-12 text-center">
                  <div className="text-6xl mb-4">💰</div>
                  <h2 className="text-2xl font-bold mb-4">No LP Position</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Deposit ETH to become a liquidity provider and start earning yield
                  </p>
                </div>
              )}

              {/* Deposit/Withdraw */}
              <div className="card p-6">
                {/* Tabs */}
                <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setActiveTab('deposit')}
                    className={`px-6 py-3 font-semibold transition-all ${
                      activeTab === 'deposit'
                        ? 'border-b-2 border-primary-600 text-primary-600'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    Deposit
                  </button>
                  <button
                    onClick={() => setActiveTab('withdraw')}
                    className={`px-6 py-3 font-semibold transition-all ${
                      activeTab === 'withdraw'
                        ? 'border-b-2 border-primary-600 text-primary-600'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    Withdraw
                  </button>
                </div>

                {/* Deposit Form */}
                {activeTab === 'deposit' && (
                  <div>
                    <div className="mb-4">
                      <label className="block text-sm font-semibold mb-2">Amount (ETH)</label>
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="0.0"
                        className="w-full p-4 text-xl font-bold border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-primary-600 focus:outline-none bg-white dark:bg-gray-800"
                      />
                      <div className="text-sm text-gray-500 mt-2">
                        Wallet balance: {walletBalance ? Number(formatEther(walletBalance.value)).toFixed(4) : '0'} ETH
                      </div>
                    </div>

                    {isDepositSuccess && (
                      <div className="bg-success-50 border-2 border-success-500 text-success-700 p-4 rounded-lg mb-4">
                        ✓ Deposit successful! Your shares have been minted.
                      </div>
                    )}

                    <button
                      onClick={handleDeposit}
                      disabled={!depositAmount || isDepositing || isConfirmingDeposit}
                      className="w-full btn btn-primary text-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDepositing || isConfirmingDeposit ? 'Depositing...' : 'Deposit ETH'}
                    </button>
                  </div>
                )}

                {/* Withdraw Form */}
                {activeTab === 'withdraw' && (
                  <div>
                    <div className="mb-4">
                      <label className="block text-sm font-semibold mb-2">Shares to Withdraw</label>
                      <input
                        type="number"
                        value={withdrawShares}
                        onChange={(e) => setWithdrawShares(e.target.value)}
                        placeholder="0.0"
                        className="w-full p-4 text-xl font-bold border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-primary-600 focus:outline-none bg-white dark:bg-gray-800"
                      />
                      <div className="flex justify-between text-sm text-gray-500 mt-2">
                        <span>Your shares: {userShares ? Number(formatEther(userShares)).toFixed(4) : '0'}</span>
                        <button
                          onClick={() => setWithdrawShares(userShares ? formatEther(userShares) : '0')}
                          className="text-primary-600 hover:underline"
                        >
                          Max
                        </button>
                      </div>
                    </div>

                    {isWithdrawSuccess && (
                      <div className="bg-success-50 border-2 border-success-500 text-success-700 p-4 rounded-lg mb-4">
                        ✓ Withdrawal successful! ETH sent to your wallet.
                      </div>
                    )}

                    <button
                      onClick={handleWithdraw}
                      disabled={!withdrawShares || isWithdrawing || isConfirmingWithdraw || !userShares || userShares === 0n}
                      className="w-full btn btn-primary text-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isWithdrawing || isConfirmingWithdraw ? 'Withdrawing...' : 'Withdraw ETH'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* How It Works */}
              <div className="card p-6">
                <h3 className="font-bold mb-4">How LP Vault Works</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start">
                    <span className="text-success-600 mr-2 mt-1">✓</span>
                    <span>Deposit ETH and receive vault shares</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-success-600 mr-2 mt-1">✓</span>
                    <span>Earn yield from failed challenges (100% of stake)</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-success-600 mr-2 mt-1">✓</span>
                    <span>Earn platform fees (10% of bonuses paid)</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-success-600 mr-2 mt-1">✓</span>
                    <span>Withdraw anytime (subject to liquidity)</span>
                  </div>
                </div>
              </div>

              {/* Revenue Breakdown */}
              <div className="card p-6">
                <h3 className="font-bold mb-4">Revenue Sources</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Failed Challenges</span>
                      <span className="font-semibold">~70%</span>
                    </div>
                    <div className="h-2 bg-danger-200 rounded-full">
                      <div className="h-full w-[70%] bg-danger-500 rounded-full"></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Platform Fees</span>
                      <span className="font-semibold">~30%</span>
                    </div>
                    <div className="h-2 bg-primary-200 rounded-full">
                      <div className="h-full w-[30%] bg-primary-500 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Links */}
              <div className="card p-6">
                <h3 className="font-bold mb-4">Quick Links</h3>
                <div className="space-y-3">
                  <Link href="/bet-it/dashboard" className="btn btn-outline w-full">
                    Dashboard
                  </Link>
                  <Link href="/bet-it/create" className="btn btn-outline w-full">
                    Create Challenge
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
    </div>
  );
}
