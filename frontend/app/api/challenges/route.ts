import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

/**
 * GET /api/challenges
 * Get list of challenges with optional filters
 *
 * Query params:
 * - status: 'active' | 'completed' | 'failed' | 'forfeited'
 * - user: address (filter by user)
 * - limit: number (default 50)
 * - offset: number (default 0)
 * - orderBy: 'created_at' | 'stake_amount' | 'duration' (default 'created_at')
 * - order: 'asc' | 'desc' (default 'desc')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const userAddress = searchParams.get('user')?.toLowerCase();
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const orderBy = searchParams.get('orderBy') || 'created_at';
    const order = searchParams.get('order') || 'desc';

    // Build query
    let query = supabase
      .from('challenges')
      .select(`
        *,
        users:user_address (
          username,
          avatar_url,
          farcaster_username
        )
      `, { count: 'exact' });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (userAddress) {
      query = query.eq('user_address', userAddress);
    }

    // Apply ordering
    query = query.order(orderBy, { ascending: order === 'asc' });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching challenges:', error);
      return NextResponse.json(
        { error: 'Failed to fetch challenges' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      challenges: data || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('Error in challenges GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/challenges
 * Create a new challenge (records on-chain event to database)
 *
 * Body:
 * - challengeId: number (on-chain ID)
 * - userAddress: string
 * - stakeAmount: string (wei)
 * - duration: number (days)
 * - bonusRate: number (basis points)
 * - txHash: string
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      challengeId,
      userAddress,
      stakeAmount,
      duration,
      bonusRate,
      txHash,
    } = body;

    // Validation
    if (!challengeId || !userAddress || !stakeAmount || !duration || !bonusRate || !txHash) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { error: 'Invalid user address' },
        { status: 400 }
      );
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return NextResponse.json(
        { error: 'Invalid transaction hash' },
        { status: 400 }
      );
    }

    // Calculate dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + parseInt(duration));

    // Insert challenge
    const { data, error } = await supabase
      .from('challenges')
      .insert({
        challenge_id: parseInt(challengeId),
        user_address: userAddress.toLowerCase(),
        stake_amount: stakeAmount,
        duration: parseInt(duration),
        bonus_rate: parseInt(bonusRate),
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        status: 'active',
        tx_hash: txHash,
      })
      .select()
      .single();

    if (error) {
      // Check for duplicate challenge_id
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Challenge already exists' },
          { status: 409 }
        );
      }

      console.error('Error creating challenge:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to create challenge' },
        { status: 500 }
      );
    }

    // Log transaction
    await supabase.from('transactions_log').insert({
      tx_hash: txHash,
      timestamp: startDate.toISOString(),
      from_address: userAddress.toLowerCase(),
      to_address: process.env.NEXT_PUBLIC_CHALLENGES_ADDRESS?.toLowerCase() || '',
      type: 'challenge_created',
      challenge_id: parseInt(challengeId),
      amount: stakeAmount,
    });

    return NextResponse.json({
      success: true,
      challenge: data,
    }, { status: 201 });
  } catch (error) {
    console.error('Error in challenges POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
