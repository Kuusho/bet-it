import { NextRequest, NextResponse } from 'next/server';
import { verifyDailyActivity, batchVerifyActiveChallenges } from '@/lib/verification/streakVerifier';
import { type Address } from 'viem';

/**
 * POST /api/verify-streak
 * Verify a user's daily activity for their active challenge
 *
 * Body:
 * - userAddress: string (wallet address)
 * - challengeId: number
 * - date?: string (ISO date, optional, defaults to today)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, challengeId, date } = body;

    // Validation
    if (!userAddress || !challengeId) {
      return NextResponse.json(
        { error: 'Missing required fields: userAddress, challengeId' },
        { status: 400 }
      );
    }

    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    // Parse date if provided
    const verificationDate = date ? new Date(date) : new Date();

    // Verify the activity
    const result = await verifyDailyActivity(
      userAddress as Address,
      parseInt(challengeId),
      verificationDate
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Verification failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      verified: result.verified,
      txCount: result.txCount,
      contractsUsed: result.contractsUsed,
      date: verificationDate.toISOString(),
    });
  } catch (error) {
    console.error('Error in verify-streak API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/verify-streak?batch=true
 * Batch verify all active challenges (cron job endpoint)
 *
 * Query params:
 * - batch: boolean (must be true)
 * - key: string (optional secret key for security)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batch = searchParams.get('batch');
    const key = searchParams.get('key');

    // Only allow batch verification with correct key
    if (batch !== 'true') {
      return NextResponse.json(
        { error: 'Invalid request. Use batch=true for batch verification' },
        { status: 400 }
      );
    }

    // Optional: Check secret key for security
    // Uncomment if you want to protect this endpoint
    // const CRON_SECRET = process.env.CRON_SECRET;
    // if (CRON_SECRET && key !== CRON_SECRET) {
    //   return NextResponse.json(
    //     { error: 'Unauthorized' },
    //     { status: 401 }
    //   );
    // }

    console.log('Starting batch verification...');
    const results = await batchVerifyActiveChallenges();

    return NextResponse.json({
      success: true,
      verified: results.verified,
      failed: results.failed,
      errors: results.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in batch verification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
