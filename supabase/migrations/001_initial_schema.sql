-- =====================================================
-- BetIt Database Schema - Initial Migration
-- =====================================================
-- Description: Core tables for users, challenges, LP positions, and activity tracking
-- Version: 1.0.0
-- Date: 2026-02-06

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USERS TABLE
-- =====================================================
-- Stores wallet addresses with optional usernames
CREATE TABLE IF NOT EXISTS users (
    address TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    avatar_url TEXT,
    farcaster_fid INTEGER,
    farcaster_username TEXT,

    -- Constraints
    CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 20),
    CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]+$'),
    CONSTRAINT address_format CHECK (address ~ '^0x[a-fA-F0-9]{40}$')
);

-- Indexes for users
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_farcaster_fid ON users(farcaster_fid);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- =====================================================
-- CHALLENGES TABLE
-- =====================================================
-- Stores challenge data (synced with on-chain events)
CREATE TABLE IF NOT EXISTS challenges (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER UNIQUE NOT NULL, -- On-chain challenge ID
    user_address TEXT NOT NULL REFERENCES users(address) ON DELETE CASCADE,
    stake_amount NUMERIC(78, 0) NOT NULL, -- Wei amount (up to 78 digits for uint256)
    duration INTEGER NOT NULL, -- Duration in days (7, 14, 30, 60, 90)
    bonus_rate INTEGER NOT NULL, -- Bonus rate in basis points (1000 = 10%)
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    last_verified TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'active', -- active, completed, failed, forfeited
    tx_hash TEXT NOT NULL, -- Creation transaction hash
    claim_tx_hash TEXT, -- Claim transaction hash (if completed)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('active', 'completed', 'failed', 'forfeited')),
    CONSTRAINT valid_duration CHECK (duration IN (7, 14, 30, 60, 90)),
    CONSTRAINT positive_stake CHECK (stake_amount > 0),
    CONSTRAINT end_after_start CHECK (end_date > start_date)
);

-- Indexes for challenges
CREATE INDEX idx_challenges_user_address ON challenges(user_address);
CREATE INDEX idx_challenges_status ON challenges(status);
CREATE INDEX idx_challenges_start_date ON challenges(start_date DESC);
CREATE INDEX idx_challenges_end_date ON challenges(end_date);
CREATE INDEX idx_challenges_challenge_id ON challenges(challenge_id);
CREATE INDEX idx_challenges_active_user ON challenges(user_address, status) WHERE status = 'active';

-- =====================================================
-- DAILY ACTIVITY TABLE
-- =====================================================
-- Tracks daily transaction activity for streak verification
CREATE TABLE IF NOT EXISTS daily_activity (
    id SERIAL PRIMARY KEY,
    user_address TEXT NOT NULL REFERENCES users(address) ON DELETE CASCADE,
    challenge_id INTEGER NOT NULL REFERENCES challenges(challenge_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    tx_count INTEGER DEFAULT 0,
    contracts_used TEXT[], -- Array of contract addresses interacted with
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint: one record per user per challenge per day
    CONSTRAINT unique_daily_activity UNIQUE(user_address, challenge_id, date),
    CONSTRAINT positive_tx_count CHECK (tx_count >= 0)
);

-- Indexes for daily_activity
CREATE INDEX idx_daily_activity_user_date ON daily_activity(user_address, date DESC);
CREATE INDEX idx_daily_activity_challenge ON daily_activity(challenge_id);
CREATE INDEX idx_daily_activity_verified ON daily_activity(verified, date);
CREATE INDEX idx_daily_activity_pending ON daily_activity(user_address, challenge_id)
    WHERE verified = FALSE;

-- =====================================================
-- LP POSITIONS TABLE
-- =====================================================
-- Tracks liquidity provider positions
CREATE TABLE IF NOT EXISTS lp_positions (
    address TEXT PRIMARY KEY REFERENCES users(address) ON DELETE CASCADE,
    shares NUMERIC(78, 0) NOT NULL DEFAULT 0, -- Vault shares (uint256)
    deposited_amount NUMERIC(78, 0) NOT NULL DEFAULT 0, -- Total ETH deposited (wei)
    withdrawn_amount NUMERIC(78, 0) NOT NULL DEFAULT 0, -- Total ETH withdrawn (wei)
    last_deposit_at TIMESTAMP WITH TIME ZONE,
    last_withdrawal_at TIMESTAMP WITH TIME ZONE,
    deposited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT non_negative_shares CHECK (shares >= 0),
    CONSTRAINT non_negative_deposited CHECK (deposited_amount >= 0),
    CONSTRAINT non_negative_withdrawn CHECK (withdrawn_amount >= 0)
);

-- Indexes for lp_positions
CREATE INDEX idx_lp_positions_shares ON lp_positions(shares DESC);
CREATE INDEX idx_lp_positions_updated ON lp_positions(updated_at DESC);

-- =====================================================
-- PLATFORM METRICS TABLE
-- =====================================================
-- Daily aggregated metrics for dashboard
CREATE TABLE IF NOT EXISTS platform_metrics (
    date DATE PRIMARY KEY,
    total_challenges INTEGER DEFAULT 0,
    active_challenges INTEGER DEFAULT 0,
    completed_challenges INTEGER DEFAULT 0,
    failed_challenges INTEGER DEFAULT 0,
    total_stakes NUMERIC(78, 0) DEFAULT 0, -- Total ETH staked (wei)
    total_payouts NUMERIC(78, 0) DEFAULT 0, -- Total ETH paid out (wei)
    total_revenue NUMERIC(78, 0) DEFAULT 0, -- Total platform revenue (wei)
    lp_vault_size NUMERIC(78, 0) DEFAULT 0, -- Total vault assets (wei)
    lp_count INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT non_negative_metrics CHECK (
        total_challenges >= 0 AND
        active_challenges >= 0 AND
        completed_challenges >= 0 AND
        failed_challenges >= 0 AND
        total_stakes >= 0 AND
        total_payouts >= 0 AND
        total_revenue >= 0 AND
        lp_vault_size >= 0 AND
        lp_count >= 0 AND
        unique_users >= 0
    )
);

-- Index for platform_metrics
CREATE INDEX idx_platform_metrics_date ON platform_metrics(date DESC);

-- =====================================================
-- VERIFIED CONTRACTS TABLE
-- =====================================================
-- Registry of verified MegaETH contracts (synced with on-chain)
CREATE TABLE IF NOT EXISTS verified_contracts (
    address TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT, -- defi, nft, social, gaming, other
    description TEXT,
    added_by TEXT, -- Address that added the contract
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    removed_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,

    -- Constraints
    CONSTRAINT address_format_verified CHECK (address ~ '^0x[a-fA-F0-9]{40}$'),
    CONSTRAINT valid_category CHECK (category IN ('defi', 'nft', 'social', 'gaming', 'other'))
);

-- Indexes for verified_contracts
CREATE INDEX idx_verified_contracts_category ON verified_contracts(category);
CREATE INDEX idx_verified_contracts_active ON verified_contracts(is_active);
CREATE INDEX idx_verified_contracts_added_at ON verified_contracts(added_at DESC);

-- =====================================================
-- TRANSACTIONS LOG TABLE
-- =====================================================
-- Logs important transactions for audit trail
CREATE TABLE IF NOT EXISTS transactions_log (
    id SERIAL PRIMARY KEY,
    tx_hash TEXT UNIQUE NOT NULL,
    block_number BIGINT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    type TEXT NOT NULL, -- challenge_created, challenge_claimed, challenge_forfeited, lp_deposit, lp_withdrawal
    challenge_id INTEGER REFERENCES challenges(challenge_id),
    amount NUMERIC(78, 0), -- Amount in wei
    metadata JSONB, -- Additional data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_tx_type CHECK (type IN (
        'challenge_created',
        'challenge_claimed',
        'challenge_forfeited',
        'challenge_failed',
        'lp_deposit',
        'lp_withdrawal',
        'revenue_added'
    ))
);

-- Indexes for transactions_log
CREATE INDEX idx_transactions_log_from ON transactions_log(from_address);
CREATE INDEX idx_transactions_log_type ON transactions_log(type);
CREATE INDEX idx_transactions_log_challenge ON transactions_log(challenge_id);
CREATE INDEX idx_transactions_log_timestamp ON transactions_log(timestamp DESC);
CREATE INDEX idx_transactions_log_block ON transactions_log(block_number DESC);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_challenges_updated_at BEFORE UPDATE ON challenges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lp_positions_updated_at BEFORE UPDATE ON lp_positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platform_metrics_updated_at BEFORE UPDATE ON platform_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- VIEWS
-- =====================================================

-- View for active challenges with user info
CREATE OR REPLACE VIEW active_challenges_view AS
SELECT
    c.challenge_id,
    c.user_address,
    u.username,
    u.avatar_url,
    c.stake_amount,
    c.duration,
    c.bonus_rate,
    c.start_date,
    c.end_date,
    c.last_verified,
    c.status,
    EXTRACT(EPOCH FROM (c.end_date - NOW())) / 86400 AS days_remaining,
    (SELECT COUNT(*) FROM daily_activity da
     WHERE da.challenge_id = c.challenge_id AND da.verified = TRUE) AS days_verified,
    c.duration - (SELECT COUNT(*) FROM daily_activity da
     WHERE da.challenge_id = c.challenge_id AND da.verified = TRUE) AS days_remaining_to_verify
FROM challenges c
JOIN users u ON c.user_address = u.address
WHERE c.status = 'active';

-- View for LP leaderboard
CREATE OR REPLACE VIEW lp_leaderboard_view AS
SELECT
    lp.address,
    u.username,
    u.avatar_url,
    lp.shares,
    lp.deposited_amount,
    lp.withdrawn_amount,
    (lp.deposited_amount - lp.withdrawn_amount) AS net_deposited,
    lp.deposited_at,
    lp.last_deposit_at
FROM lp_positions lp
JOIN users u ON lp.address = u.address
WHERE lp.shares > 0
ORDER BY lp.shares DESC;

-- View for challenger leaderboard
CREATE OR REPLACE VIEW challenger_leaderboard_view AS
SELECT
    u.address,
    u.username,
    u.avatar_url,
    COUNT(DISTINCT c.challenge_id) FILTER (WHERE c.status = 'completed') AS completed_challenges,
    COUNT(DISTINCT c.challenge_id) FILTER (WHERE c.status = 'failed' OR c.status = 'forfeited') AS failed_challenges,
    SUM(c.stake_amount) FILTER (WHERE c.status = 'completed') AS total_won,
    MAX(c.duration) FILTER (WHERE c.status = 'completed') AS longest_streak,
    ROUND(
        COUNT(DISTINCT c.challenge_id) FILTER (WHERE c.status = 'completed')::NUMERIC /
        NULLIF(COUNT(DISTINCT c.challenge_id), 0) * 100,
        2
    ) AS success_rate
FROM users u
LEFT JOIN challenges c ON u.address = c.user_address
GROUP BY u.address, u.username, u.avatar_url
HAVING COUNT(DISTINCT c.challenge_id) > 0
ORDER BY completed_challenges DESC, total_won DESC;

-- =====================================================
-- SEED DATA (for development)
-- =====================================================

-- Note: Comment out or remove this section for production deployment
-- INSERT INTO users (address, username) VALUES
--     ('0x1234567890123456789012345678901234567890', 'alice'),
--     ('0x2345678901234567890123456789012345678901', 'bob'),
--     ('0x3456789012345678901234567890123456789012', 'charlie')
-- ON CONFLICT (address) DO NOTHING;

-- =====================================================
-- GRANTS & PERMISSIONS
-- =====================================================

-- Grant permissions for service role (backend)
-- Adjust based on your Supabase setup

-- GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
