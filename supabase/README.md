# BetIt Supabase Database Setup

## Overview

This directory contains SQL migrations for the BetIt platform database schema.

## Quick Start

### 1. Create Supabase Project

```bash
# Visit https://supabase.com and create a new project
# Note down your project URL and anon key
```

### 2. Run Migrations

#### Option A: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `migrations/001_initial_schema.sql`
4. Click "Run"

#### Option B: Using Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### 3. Configure Environment Variables

Update your `.env` file:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Database Schema

### Core Tables

#### `users`
- Stores wallet addresses with usernames
- Optional Farcaster integration
- Username constraints: 3-20 chars, alphanumeric + underscore

#### `challenges`
- Tracks all challenges (synced from on-chain events)
- Stores stake amount, duration, status
- Linked to users via address

#### `daily_activity`
- Records daily transaction activity for verification
- Tracks which verified contracts were used
- Used to determine streak completion

#### `lp_positions`
- Liquidity provider positions
- Tracks shares, deposits, and withdrawals

#### `platform_metrics`
- Daily aggregated platform statistics
- Used for dashboard analytics

#### `verified_contracts`
- Registry of whitelisted MegaETH contracts
- Synced with on-chain whitelist

#### `transactions_log`
- Audit trail of all important transactions
- Challenge creations, claims, LP operations

### Views

- `active_challenges_view`: Active challenges with user info and progress
- `lp_leaderboard_view`: LP rankings by shares
- `challenger_leaderboard_view`: Challenger stats and success rates

## Row Level Security (RLS)

For production, consider enabling RLS policies:

```sql
-- Example: Users can only read their own data
ALTER TABLE lp_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own LP position"
ON lp_positions FOR SELECT
USING (auth.uid()::text = address);
```

## Realtime Features

Enable realtime for live updates:

```sql
-- Enable realtime for active challenges
ALTER PUBLICATION supabase_realtime ADD TABLE challenges;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE lp_positions;
```

## Indexing Strategy

All critical queries are indexed:
- User lookups by address/username
- Challenge queries by status/user
- Activity tracking by user/date
- Transaction logs by timestamp

## Backup & Recovery

### Automated Backups

Supabase automatically backs up your database. Configure retention in project settings.

### Manual Backup

```bash
# Export database
supabase db dump -f backup.sql

# Restore from backup
psql your-connection-string < backup.sql
```

## Development Tips

### Reset Database

```bash
supabase db reset
```

### Generate TypeScript Types

```bash
supabase gen types typescript --local > types/database.types.ts
```

### Test Queries

Use the SQL Editor in Supabase Dashboard to test queries before adding to code.

## Monitoring

### Key Metrics to Watch

1. **Query Performance**
   - Monitor slow queries in Dashboard > Logs
   - Optimize with EXPLAIN ANALYZE

2. **Storage Growth**
   - Track table sizes
   - Archive old data if needed

3. **Connection Pool**
   - Monitor active connections
   - Adjust pooler settings if needed

## Troubleshooting

### Common Issues

**Migration fails**: Check for syntax errors, ensure tables don't already exist

**Slow queries**: Add missing indexes, check query execution plan

**RLS blocking queries**: Review policies, ensure correct auth context

## Production Checklist

- [ ] All migrations run successfully
- [ ] Indexes created and verified
- [ ] RLS policies configured (if needed)
- [ ] Realtime enabled for required tables
- [ ] Environment variables set
- [ ] Backup strategy configured
- [ ] Monitoring alerts set up

## Next Steps

After database setup:

1. **Backend Integration**: Implement verification service using Supabase client
2. **Frontend Integration**: Connect Next.js app to Supabase
3. **Testing**: Seed test data and validate queries
4. **Monitoring**: Set up alerts for errors and slow queries
