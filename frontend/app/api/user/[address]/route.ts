import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { getUserVerificationStatus } from '@/lib/verification/streakVerifier';
import { type Address } from 'viem';

/**
 * GET /api/user/[address]
 * Get user profile and stats
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  try {
    const address = params.address.toLowerCase();

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: 'Invalid Ethereum address' },
        { status: 400 }
      );
    }

    // Get user profile
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('address', address)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      // PGRST116 = not found (which is okay)
      console.error('Error fetching user:', userError);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      );
    }

    // Get verification status for active challenge
    const verificationStatus = await getUserVerificationStatus(address as Address);

    // Get challenge statistics
    const { data: challengeStats } = await supabase
      .from('challenges')
      .select('status')
      .eq('user_address', address);

    const stats = {
      totalChallenges: challengeStats?.length || 0,
      completed: challengeStats?.filter(c => c.status === 'completed').length || 0,
      failed: challengeStats?.filter(c => c.status === 'failed').length || 0,
      forfeited: challengeStats?.filter(c => c.status === 'forfeited').length || 0,
      active: challengeStats?.filter(c => c.status === 'active').length || 0,
    };

    const successRate = stats.totalChallenges > 0
      ? Math.round((stats.completed / stats.totalChallenges) * 100)
      : 0;

    return NextResponse.json({
      user: user || { address, username: null, exists: false },
      verificationStatus,
      stats: {
        ...stats,
        successRate,
      },
    });
  } catch (error) {
    console.error('Error in user GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/[address]
 * Create or update user profile
 *
 * Body:
 * - username: string (required for new users)
 * - avatar_url?: string
 * - farcaster_fid?: number
 * - farcaster_username?: string
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  try {
    const address = params.address.toLowerCase();
    const body = await request.json();

    // Validate address
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: 'Invalid Ethereum address' },
        { status: 400 }
      );
    }

    // Validate username
    if (body.username) {
      const username = body.username.trim();

      if (username.length < 3 || username.length > 20) {
        return NextResponse.json(
          { error: 'Username must be 3-20 characters' },
          { status: 400 }
        );
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return NextResponse.json(
          { error: 'Username can only contain letters, numbers, and underscores' },
          { status: 400 }
        );
      }
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('address')
      .eq('address', address)
      .single();

    if (existingUser) {
      // Update existing user
      const { data, error } = await supabase
        .from('users')
        .update({
          username: body.username,
          avatar_url: body.avatar_url,
          farcaster_fid: body.farcaster_fid,
          farcaster_username: body.farcaster_username,
          updated_at: new Date().toISOString(),
        })
        .eq('address', address)
        .select()
        .single();

      if (error) {
        console.error('Error updating user:', error);
        return NextResponse.json(
          { error: error.message || 'Failed to update user' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        user: data,
        created: false,
      });
    } else {
      // Create new user
      if (!body.username) {
        return NextResponse.json(
          { error: 'Username is required for new users' },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from('users')
        .insert({
          address,
          username: body.username,
          avatar_url: body.avatar_url,
          farcaster_fid: body.farcaster_fid,
          farcaster_username: body.farcaster_username,
        })
        .select()
        .single();

      if (error) {
        // Check if username is taken
        if (error.code === '23505') { // Unique constraint violation
          return NextResponse.json(
            { error: 'Username already taken' },
            { status: 409 }
          );
        }

        console.error('Error creating user:', error);
        return NextResponse.json(
          { error: error.message || 'Failed to create user' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        user: data,
        created: true,
      }, { status: 201 });
    }
  } catch (error) {
    console.error('Error in user POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/[address]
 * Delete user profile (soft delete - keep address but clear data)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  try {
    const address = params.address.toLowerCase();

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('address', address);

    if (error) {
      console.error('Error deleting user:', error);
      return NextResponse.json(
        { error: 'Failed to delete user' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Error in user DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
