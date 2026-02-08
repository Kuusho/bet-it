'use client';

import { useQuery } from '@tanstack/react-query';
import { formatEther } from 'viem';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';

async function fetchPlatformStats() {
  const res = await fetch('/api/platform-stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export default function BetItLandingPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['platformStats'],
    queryFn: fetchPlatformStats,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Navigation */}
      <nav className="container mx-auto px-4 py-6 flex justify-between items-center">
        <div className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          Bet It
        </div>
        <ConnectButton />
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6">
          <span className="bg-gradient-primary bg-clip-text text-transparent">
            Earn Yield
          </span>
          {' or '}
          <span className="bg-gradient-success bg-clip-text text-transparent">
            Win Bonuses
          </span>
        </h1>
        <h2 className="text-2xl md:text-3xl text-gray-600 dark:text-gray-300 mb-8">
          on MegaETH Streaks
        </h2>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-12">
          Stake on your daily MegaETH activity and win up to 60% bonuses.
          Or provide liquidity and earn 15-25% weekly yield from failed stakes.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link
            href="/bet-it/create"
            className="btn btn-primary text-lg px-8 py-4"
          >
            Start Challenge
          </Link>
          <Link
            href="/bet-it/lp-vault"
            className="btn btn-outline text-lg px-8 py-4"
          >
            Become an LP
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
          <StatCard
            title="LP Vault Size"
            value={isLoading ? '...' : `${Number(stats?.vault?.totalAssetsETH || 0).toFixed(2)} ETH`}
            subtitle="Total Liquidity"
          />
          <StatCard
            title="Weekly LP Return"
            value={isLoading ? '...' : `${stats?.vault?.weeklyYield || 0}%`}
            subtitle="Average Yield"
          />
          <StatCard
            title="Active Challenges"
            value={isLoading ? '...' : stats?.challenges?.active || 0}
            subtitle="Currently Running"
          />
          <StatCard
            title="Total Paid Out"
            value={isLoading ? '...' : `${Number(stats?.metrics?.totalStakesETH || 0).toFixed(1)} ETH`}
            subtitle="To Winners"
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-center mb-16">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <StepCard
            number="1"
            title="Choose Your Path"
            description="Stake on your streak to win bonuses, or provide liquidity to earn passive yield from failed challenges."
            icon="🎯"
          />
          <StepCard
            number="2"
            title="Stay Active"
            description="Challengers must transact daily with verified MegaETH contracts. LPs just sit back and earn."
            icon="⚡"
          />
          <StepCard
            number="3"
            title="Claim Rewards"
            description="Complete your challenge to win bonuses (10-60%). LPs earn from failed stakes + platform fees."
            icon="💰"
          />
        </div>
      </section>

      {/* Recent Activity */}
      {stats?.recentActivity && stats.recentActivity.length > 0 && (
        <section className="container mx-auto px-4 py-20">
          <h2 className="text-4xl font-bold text-center mb-16">Recent Activity</h2>
          <div className="max-w-3xl mx-auto space-y-4">
            {stats.recentActivity.slice(0, 5).map((activity: any) => (
              <div key={activity.challenge_id} className="card p-4 flex justify-between items-center">
                <div>
                  <span className="font-semibold">{activity.users?.username || 'Anonymous'}</span>
                  {' '}
                  <span className="text-gray-600 dark:text-gray-400">
                    staked {formatEther(BigInt(activity.stake_amount))} ETH on a {activity.duration}-day challenge
                  </span>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  activity.status === 'active' ? 'bg-primary-100 text-primary-700' :
                  activity.status === 'completed' ? 'bg-success-100 text-success-700' :
                  'bg-danger-100 text-danger-700'
                }`}>
                  {activity.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer CTA */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="card p-12 max-w-3xl mx-auto bg-gradient-primary">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Start?
          </h2>
          <p className="text-xl text-white/90 mb-8">
            Join the first streak accountability platform on MegaETH
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/bet-it/create"
              className="bg-white text-primary-600 hover:bg-gray-100 px-8 py-4 rounded-lg font-bold text-lg transition"
            >
              Create Challenge
            </Link>
            <Link
              href="/bet-it/dashboard"
              className="bg-white/10 backdrop-blur text-white hover:bg-white/20 px-8 py-4 rounded-lg font-bold text-lg transition"
            >
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 text-center text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
        <p>Built for MegaETH Mainnet Launch 🚀</p>
        <div className="flex justify-center gap-6 mt-4">
          <a href="#" className="hover:text-primary-600 transition">Twitter</a>
          <a href="#" className="hover:text-primary-600 transition">Discord</a>
          <a href="#" className="hover:text-primary-600 transition">Docs</a>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string | number; subtitle: string }) {
  return (
    <div className="card p-6 text-center card-hover">
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{title}</div>
      <div className="text-3xl font-bold text-primary-600 mb-1">{value}</div>
      <div className="text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}

function StepCard({ number, title, description, icon }: { number: string; title: string; description: string; icon: string }) {
  return (
    <div className="card p-8 text-center card-hover">
      <div className="text-5xl mb-4">{icon}</div>
      <div className="text-4xl font-bold text-primary-600 mb-4">{number}</div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  );
}
