import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // We use wallet-based auth, not Supabase auth
  },
});

// Database types (to be generated with: supabase gen types typescript)
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          address: string;
          username: string;
          created_at: string;
          updated_at: string;
          avatar_url: string | null;
          farcaster_fid: number | null;
          farcaster_username: string | null;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      challenges: {
        Row: {
          id: number;
          challenge_id: number;
          user_address: string;
          stake_amount: string;
          duration: number;
          bonus_rate: number;
          start_date: string;
          end_date: string;
          last_verified: string | null;
          status: 'active' | 'completed' | 'failed' | 'forfeited';
          tx_hash: string;
          claim_tx_hash: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      lp_positions: {
        Row: {
          address: string;
          shares: string;
          deposited_amount: string;
          withdrawn_amount: string;
          last_deposit_at: string | null;
          last_withdrawal_at: string | null;
          deposited_at: string;
          updated_at: string;
        };
      };
    };
  };
};
