import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { createPublicClient, http, formatEther } from 'viem';
import { CONTRACTS, MEGAETH_CHAIN } from '@/lib/contracts/config';
import { BetItVaultABI } from '@/lib/contracts/abis';

// Create viem client
const publicClient = createPublicClient({
  chain: MEGAETH_CHAIN,
  transport: http(MEGAETH_CHAIN.rpcUrls.default.http[0]),
});

/**
 * GET /api/platform-stats
 * Get current platform statistics
 *
 * Query params:
 * - period: 'day' | 'week' | 'month' | 'all' (default 'all')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'all';

    // Calculate date range based on period
    let dateFilter: Date | null = null;
    if (period !== 'all') {
      dateFilter = new Date();
      switch (period) {
        case 'day':
          dateFilter.setDate(dateFilter.getDate() - 1);
          break;
        case 'week':
          dateFilter.setDate(dateFilter.getDate() - 7);
          break;
        case 'month':
          dateFilter.setMonth(dateFilter.getMonth() - 1);
          break;
      }
    }

    // Get vault stats from contract
    let vaultTotalAssets = '0';
    let vaultTotalShares = '0';
    try {
      const [totalAssets, totalShares] = await Promise.all([
        publicClient.readContract({
          address: CONTRACTS.VAULT,
          abi: BetItVaultABI,
          functionName: 'totalAssets',
        }),
        publicClient.readContract({
          address: CONTRACTS.VAULT,
          abi: BetItVaultABI,
          functionName: 'totalShares',
        }),
      ]);

      vaultTotalAssets = totalAssets.toString();
      vaultTotalShares = totalShares.toString();
    } catch (error) {
      console.error('Error fetching vault stats from contract:', error);
      // Continue with database stats
    }

    // Get challenge statistics
    let challengeQuery = supabase
      .from('challenges')
      .select('status, stake_amount, duration', { count: 'exact' });

    if (dateFilter) {
      challengeQuery = challengeQuery.gte('created_at', dateFilter.toISOString());
    }

    const { data: challenges, count: totalChallenges, error: challengeError } = await challengeQuery;

    if (challengeError) {
      console.error('Error fetching challenges:', challengeError);
    }

    const challengeStats = {
      total: totalChallenges || 0,
      active: challenges?.filter(c => c.status === 'active').length || 0,
      completed: challenges?.filter(c => c.status === 'completed').length || 0,
      failed: challenges?.filter(c => c.status === 'failed').length || 0,
      forfeited: challenges?.filter(c => c.status === 'forfeited').length || 0,
    };

    // Calculate total stakes
    const totalStakes = challenges?.reduce((sum, c) => {
      return sum + BigInt(c.stake_amount);
    }, BigInt(0)) || BigInt(0);

    // Calculate success rate
    const completedChallenges = challengeStats.completed;
    const failedChallenges = challengeStats.failed + challengeStats.forfeited;
    const successRate = (completedChallenges + failedChallenges) > 0
      ? Math.round((completedChallenges / (completedChallenges + failedChallenges)) * 100)
      : 0;

    // Get LP statistics
    const { data: lpPositions, count: lpCount } = await supabase
      .from('lp_positions')
      .select('shares, deposited_amount, withdrawn_amount', { count: 'exact' })
      .gt('shares', '0');

    const lpStats = {
      count: lpCount || 0,
      totalDeposited: lpPositions?.reduce((sum, lp) =>
        sum + BigInt(lp.deposited_amount), BigInt(0)
      )?.toString() || '0',
      totalWithdrawn: lpPositions?.reduce((sum, lp) =>
        sum + BigInt(lp.withdrawn_amount), BigInt(0)
      )?.toString() || '0',
    };

    // Get unique users count
    const { count: uniqueUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Calculate weekly LP yield (if vault has assets)
    let weeklyLPYield = 0;
    if (BigInt(vaultTotalAssets) > 0) {
      // Get revenue from last 7 days
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);

      const { data: recentChallenges } = await supabase
        .from('challenges')
        .select('stake_amount, status, bonus_rate')
        .gte('created_at', lastWeek.toISOString())
        .in('status', ['failed', 'forfeited', 'completed']);

      let weeklyRevenue = BigInt(0);

      recentChallenges?.forEach(c => {
        if (c.status === 'failed' || c.status === 'forfeited') {
          // Full stake goes to vault
          weeklyRevenue += BigInt(c.stake_amount);
        } else if (c.status === 'completed') {
          // 10% platform fee goes to vault
          const bonus = (BigInt(c.stake_amount) * BigInt(c.bonus_rate)) / BigInt(10000);
          const fee = (bonus * BigInt(1000)) / BigInt(10000);
          weeklyRevenue += fee;
        }
      });

      // Calculate yield percentage
      if (BigInt(vaultTotalAssets) > 0) {
        weeklyLPYield = Number((weeklyRevenue * BigInt(10000)) / BigInt(vaultTotalAssets)) / 100;
      }
    }

    // Get recent activity (last 10 challenges)
    const { data: recentActivity } = await supabase
      .from('challenges')
      .select(`
        challenge_id,
        user_address,
        stake_amount,
        duration,
        status,
        created_at,
        users:user_address (
          username,
          avatar_url
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      vault: {
        totalAssets: vaultTotalAssets,
        totalAssetsETH: formatEther(BigInt(vaultTotalAssets)),
        totalShares: vaultTotalShares,
        weeklyYield: weeklyLPYield.toFixed(2),
      },
      challenges: challengeStats,
      lp: lpStats,
      users: {
        total: uniqueUsers || 0,
      },
      metrics: {
        totalStakes: totalStakes.toString(),
        totalStakesETH: formatEther(totalStakes),
        successRate,
        averageStake: totalChallenges && totalChallenges > 0
          ? formatEther(totalStakes / BigInt(totalChallenges))
          : '0',
      },
      recentActivity: recentActivity || [],
      period,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in platform-stats GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
