import { createPublicClient, http, type Address, type Hash } from 'viem';
import { supabase } from '../supabase/client';
import { CONTRACTS, MEGAETH_CHAIN } from '../contracts/config';

/**
 * Streak Verification Service
 * Checks if users have maintained their daily MegaETH transaction streaks
 */

// Create viem client for MegaETH
const publicClient = createPublicClient({
  chain: MEGAETH_CHAIN,
  transport: http(MEGAETH_CHAIN.rpcUrls.default.http[0]),
});

interface VerificationResult {
  success: boolean;
  verified: boolean;
  txCount: number;
  contractsUsed: Address[];
  error?: string;
}

/**
 * Get list of verified contracts from database
 */
export async function getVerifiedContracts(): Promise<Address[]> {
  const { data, error } = await supabase
    .from('verified_contracts')
    .select('address')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching verified contracts:', error);
    return [];
  }

  return (data || []).map(row => row.address as Address);
}

/**
 * Fetch transactions for a user address from Blockscout API
 * @param address User wallet address
 * @param fromBlock Starting block number
 * @param toBlock Ending block number (optional, defaults to latest)
 */
async function fetchTransactionsFromBlockscout(
  address: Address,
  fromBlock: bigint,
  toBlock?: bigint
): Promise<Array<{ hash: Hash; to: Address | null; blockNumber: bigint }>> {
  const explorerUrl = 'https://explorer.megaeth.systems/api';
  const module = 'account';
  const action = 'txlist';

  const params = new URLSearchParams({
    module,
    action,
    address,
    startblock: fromBlock.toString(),
    endblock: toBlock?.toString() || 'latest',
    sort: 'desc',
  });

  try {
    const response = await fetch(`${explorerUrl}?${params}`);
    const data = await response.json();

    if (data.status !== '1' || !data.result) {
      console.error('Blockscout API error:', data.message);
      return [];
    }

    return data.result.map((tx: any) => ({
      hash: tx.hash as Hash,
      to: tx.to as Address,
      blockNumber: BigInt(tx.blockNumber),
    }));
  } catch (error) {
    console.error('Error fetching from Blockscout:', error);
    return [];
  }
}

/**
 * Verify if user has made transactions to verified contracts in the last 24 hours
 * @param userAddress User wallet address
 * @param challengeId Challenge ID
 * @param date Date to verify (defaults to today)
 */
export async function verifyDailyActivity(
  userAddress: Address,
  challengeId: number,
  date: Date = new Date()
): Promise<VerificationResult> {
  try {
    // Get verified contracts list
    const verifiedContracts = await getVerifiedContracts();

    if (verifiedContracts.length === 0) {
      return {
        success: false,
        verified: false,
        txCount: 0,
        contractsUsed: [],
        error: 'No verified contracts configured',
      };
    }

    // Calculate block range for the day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get current block number
    const currentBlock = await publicClient.getBlockNumber();

    // Estimate blocks for the day (MegaETH: ~4 blocks/sec = 345,600 blocks/day)
    // This is a rough estimate; ideally we'd query by timestamp
    const blocksPerDay = 345600n;
    const estimatedStartBlock = currentBlock - blocksPerDay;

    // Fetch user's transactions for the day
    const transactions = await fetchTransactionsFromBlockscout(
      userAddress,
      estimatedStartBlock,
      currentBlock
    );

    // Filter transactions to verified contracts
    const verifiedTxs = transactions.filter(tx =>
      tx.to && verifiedContracts.includes(tx.to.toLowerCase() as Address)
    );

    const contractsUsed = [...new Set(verifiedTxs.map(tx => tx.to!))];
    const verified = verifiedTxs.length > 0;

    // Update database
    const { error: dbError } = await supabase
      .from('daily_activity')
      .upsert({
        user_address: userAddress.toLowerCase(),
        challenge_id: challengeId,
        date: startOfDay.toISOString().split('T')[0], // YYYY-MM-DD
        tx_count: verifiedTxs.length,
        contracts_used: contractsUsed,
        verified,
        verified_at: verified ? new Date().toISOString() : null,
      }, {
        onConflict: 'user_address,challenge_id,date'
      });

    if (dbError) {
      console.error('Error updating daily_activity:', dbError);
    }

    return {
      success: true,
      verified,
      txCount: verifiedTxs.length,
      contractsUsed,
    };
  } catch (error) {
    console.error('Error in verifyDailyActivity:', error);
    return {
      success: false,
      verified: false,
      txCount: 0,
      contractsUsed: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Batch verify all active challenges
 * This should be called by a cron job every 6 hours
 */
export async function batchVerifyActiveChallenges(): Promise<{
  verified: number;
  failed: number;
  errors: string[];
}> {
  const results = {
    verified: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // Get all active challenges
    const { data: challenges, error } = await supabase
      .from('challenges')
      .select('challenge_id, user_address, start_date, last_verified')
      .eq('status', 'active');

    if (error) {
      results.errors.push(`Database error: ${error.message}`);
      return results;
    }

    if (!challenges || challenges.length === 0) {
      console.log('No active challenges to verify');
      return results;
    }

    console.log(`Verifying ${challenges.length} active challenges...`);

    // Verify each challenge
    for (const challenge of challenges) {
      const lastVerified = challenge.last_verified
        ? new Date(challenge.last_verified)
        : new Date(challenge.start_date);

      const now = new Date();
      const hoursSinceVerification = (now.getTime() - lastVerified.getTime()) / (1000 * 60 * 60);

      // Only verify if more than 20 hours have passed (allows some flexibility)
      if (hoursSinceVerification >= 20) {
        const result = await verifyDailyActivity(
          challenge.user_address as Address,
          challenge.challenge_id,
          now
        );

        if (result.success && result.verified) {
          results.verified++;
          console.log(`✓ Verified challenge ${challenge.challenge_id} for ${challenge.user_address}`);
        } else if (result.success && !result.verified) {
          results.failed++;
          console.log(`✗ No verified transactions for challenge ${challenge.challenge_id}`);
        } else {
          results.errors.push(`Challenge ${challenge.challenge_id}: ${result.error}`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Batch verification complete: ${results.verified} verified, ${results.failed} failed`);
  } catch (error) {
    results.errors.push(`Batch verification error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  return results;
}

/**
 * Check if a challenge should be marked as failed due to missed days
 * @param challengeId Challenge ID
 */
export async function checkChallengeStatus(challengeId: number): Promise<{
  shouldFail: boolean;
  reason?: string;
}> {
  try {
    // Get challenge details
    const { data: challenge, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('status', 'active')
      .single();

    if (error || !challenge) {
      return { shouldFail: false, reason: 'Challenge not found or not active' };
    }

    const now = new Date();
    const startDate = new Date(challenge.start_date);
    const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Get verified days count
    const { count, error: countError } = await supabase
      .from('daily_activity')
      .select('*', { count: 'exact', head: true })
      .eq('challenge_id', challengeId)
      .eq('verified', true);

    if (countError) {
      console.error('Error counting verified days:', countError);
      return { shouldFail: false };
    }

    const verifiedDays = count || 0;

    // Check if user has missed a day
    // If they've been active for N days, they should have N verifications
    if (daysSinceStart > 0 && verifiedDays < daysSinceStart) {
      const missedDays = daysSinceStart - verifiedDays;
      return {
        shouldFail: true,
        reason: `Missed ${missedDays} day(s) of activity`,
      };
    }

    return { shouldFail: false };
  } catch (error) {
    console.error('Error checking challenge status:', error);
    return { shouldFail: false };
  }
}

/**
 * Get verification status for a user's active challenge
 * @param userAddress User wallet address
 */
export async function getUserVerificationStatus(userAddress: Address): Promise<{
  hasActiveChallenge: boolean;
  challengeId?: number;
  daysVerified: number;
  totalDays: number;
  lastVerified?: Date;
  nextVerificationDue?: Date;
  atRisk: boolean;
}> {
  try {
    // Get user's active challenge
    const { data: challenge, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .eq('status', 'active')
      .single();

    if (error || !challenge) {
      return {
        hasActiveChallenge: false,
        daysVerified: 0,
        totalDays: 0,
        atRisk: false,
      };
    }

    // Get verified days count
    const { count } = await supabase
      .from('daily_activity')
      .select('*', { count: 'exact', head: true })
      .eq('challenge_id', challenge.challenge_id)
      .eq('verified', true);

    const daysVerified = count || 0;
    const lastVerified = challenge.last_verified ? new Date(challenge.last_verified) : null;
    const now = new Date();

    // Calculate if user is at risk (>20 hours since last verification)
    const hoursSinceVerification = lastVerified
      ? (now.getTime() - lastVerified.getTime()) / (1000 * 60 * 60)
      : 24;

    const atRisk = hoursSinceVerification >= 20;

    // Next verification due in 24 hours from last verification
    const nextVerificationDue = lastVerified
      ? new Date(lastVerified.getTime() + 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return {
      hasActiveChallenge: true,
      challengeId: challenge.challenge_id,
      daysVerified,
      totalDays: challenge.duration,
      lastVerified: lastVerified || undefined,
      nextVerificationDue,
      atRisk,
    };
  } catch (error) {
    console.error('Error getting verification status:', error);
    return {
      hasActiveChallenge: false,
      daysVerified: 0,
      totalDays: 0,
      atRisk: false,
    };
  }
}
