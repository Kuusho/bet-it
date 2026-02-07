# Bet It - Onchain Streak Accountability Platform (v2)

## Overview

Bet It is a dual-layer accountability system where **Liquidity Providers** earn yield by backing **Challengers** who stake crypto on maintaining MegaETH transaction streaks. Smart contracts verify activity via verified contract interactions and automatically distribute rewards based on outcomes.

## Core Value Proposition

**"LPs earn yield. Challengers win bonuses. Everyone profits from consistency."**

### For Liquidity Providers

- Deposit ETH, earn 15-25% weekly yield
- Revenue from failed stakes + platform fees
- Withdraw anytime

### For Challengers

- Stake on your streak, win fixed bonuses (10-60%)
- Compete against the pool, not other users
- Prove consistency, earn rewards

---

## System Architecture

### Layer 1: Liquidity Pool (LP Vault)

**Purpose:** Passive investors fund the prize pool

```solidity
contract BetItVault {
    mapping(address => uint256) public lpShares;
    uint256 public totalShares;
    uint256 public totalAssets;

    function deposit() external payable {
        // LP deposits ETH, gets proportional shares
        uint256 shares = (msg.value * totalShares) / totalAssets;
        lpShares[msg.sender] += shares;
        totalShares += shares;
        totalAssets += msg.value;
    }

    function withdraw(uint256 shares) external {
        // LP withdraws their share of vault
        uint256 assets = (shares * totalAssets) / totalShares;
        lpShares[msg.sender] -= shares;
        totalShares -= shares;
        totalAssets -= assets;
        payable(msg.sender).transfer(assets);
    }

    function payChallenger(address user, uint256 amount) external onlyChallengeContract {
        // Pay successful challenger from vault
        totalAssets -= amount;
        payable(user).transfer(amount);
    }

    function addRevenue() external payable {
        // Failed stakes + fees go to vault
        totalAssets += msg.value;
    }
}
```

**LP Economics:**

```
Week 1 Example:
- LP deposits: 10 ETH
- Challenges created: 5 ETH staked
- Failures (35%): 1.75 ETH → vault
- Platform fee (10%): 0.5 ETH → vault
- Bonuses paid to winners: -0.5 ETH

Net LP profit: 1.75 ETH (17.5% weekly return)
```

---

### Layer 2: Personal Challenges

**Purpose:** Users compete against the pool for bonuses

```solidity
contract BetItChallenges {
    BetItVault public vault;

    struct Challenge {
        address user;
        uint256 stake;
        uint256 duration; // 7, 14, 30, 60, 90 days
        uint256 startDate;
        bool active;
    }

    mapping(address => Challenge) public challenges;

    // Bonus rates by duration
    mapping(uint256 => uint256) public bonusRates;
    // 7 days: 10%, 14 days: 15%, 30 days: 25%, 60 days: 40%, 90 days: 60%

    function createChallenge(uint256 _duration) external payable {
        require(msg.value >= 0.01 ether, "Min 0.01 ETH");
        require(!challenges[msg.sender].active, "Already active");

        challenges[msg.sender] = Challenge({
            user: msg.sender,
            stake: msg.value,
            duration: _duration,
            startDate: block.timestamp,
            active: true
        });

        emit ChallengeCreated(msg.sender, msg.value, _duration);
    }

    function claimReward() external {
        Challenge storage c = challenges[msg.sender];
        require(c.active, "No active challenge");
        require(verifySuccess(msg.sender, c.duration), "Failed streak");

        // Calculate payout: stake + bonus
        uint256 bonus = (c.stake * bonusRates[c.duration]) / 100;
        uint256 payout = c.stake + bonus;

        c.active = false;

        // Pay from vault
        vault.payChallenger(msg.sender, payout);

        emit RewardClaimed(msg.sender, payout, bonus);
    }

    function forfeit() external {
        Challenge storage c = challenges[msg.sender];
        require(c.active, "No active challenge");

        uint256 stake = c.stake;
        c.active = false;

        // Failed stake goes to vault (rewards LPs!)
        vault.addRevenue{value: stake}();

        emit ChallengeFailed(msg.sender, stake);
    }
}
```

**Challenger Economics:**

```
Alice stakes 0.1 ETH on 30-day challenge:
- Bonus rate: 25%
- If succeeds: Gets 0.125 ETH (0.025 ETH profit)
- If fails: Loses 0.1 ETH (goes to LP vault)

Bob stakes 0.2 ETH on 90-day challenge:
- Bonus rate: 60%
- If succeeds: Gets 0.32 ETH (0.12 ETH profit!)
- If fails: Loses 0.2 ETH
```

---

## Authentication: Wallet + Username

**No external auth service required**

### Flow

```
1. User connects wallet (MetaMask, Rainbow, etc.)
2. Check if address has username
3. If new user → Show username modal
4. User chooses username (3-20 chars, alphanumeric + underscore)
5. Username saved to database
6. Start using app
```

### Database Schema

```sql
CREATE TABLE users (
    address TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_username ON users(username);
```

### Implementation

```typescript
// app/page.tsx
const { address, isConnected } = useAccount();
const [user, setUser] = useState(null);

useEffect(() => {
  if (isConnected && address) {
    checkUser(address);
  }
}, [address]);

async function checkUser(address: string) {
  const res = await fetch(`/api/user/${address}`);
  if (res.ok) {
    setUser(await res.json());
  } else {
    // Show username modal
    setShowUsernameModal(true);
  }
}
```

**Optional:** Add "Import from Farcaster" button to auto-fill username

---

## Anti-Gaming: Verified Contract Whitelist

**Only transactions to verified contracts count**

### Verified Contracts

```typescript
const VERIFIED_CONTRACTS = [
  // DeFi
  { address: "0x...", name: "USDm", category: "defi" },
  { address: "0x...", name: "MegaSwap", category: "defi" },
  { address: "0x...", name: "Lending Protocol", category: "defi" },

  // NFT
  { address: "0x...", name: "MegaNFT Marketplace", category: "nft" },
  { address: "0x...", name: "PFP Collection", category: "nft" },

  // Social
  { address: "0x...", name: "Farcaster Frames", category: "social" },

  // Gaming
  { address: "0x...", name: "Onchain Game", category: "gaming" },

  // ~20 total
];
```

### Verification Logic

```typescript
// Real-time via WebSocket
const ws = new WebSocket("wss://megaeth-rpc.com");

ws.send(
  JSON.stringify({
    method: "eth_subscribe",
    params: [
      "logs",
      {
        address: VERIFIED_CONTRACTS.map((c) => c.address),
      },
    ],
  }),
);

ws.on("message", async (data) => {
  const tx = parseTransaction(data);

  // Check if from active challenger
  const challenger = await getChallenger(tx.from);
  if (challenger && challenger.active) {
    // Mark day as complete
    await markDayComplete(tx.from, today);
  }
});
```

**Benefits:**

- ✅ Prevents script gaming (can't just send 0.001 ETH to self)
- ✅ Encourages real app usage
- ✅ Generates valuable TGE data
- ✅ Supports AI agents (if using verified apps)

---

## Social Sharing: Twitter/Farcaster Web Intents

**No auth required - just pre-filled share links**

### Share Moments

1. **Challenge Created**
2. **Milestones** (Day 7, 14, 30)
3. **Challenge Won**
4. **Leaderboard Position**
5. **H2H Challenge**

### Implementation

```typescript
function shareToTwitter(text: string, url: string) {
  window.open(
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${url}`,
    "_blank",
    "width=550,height=420",
  );
}

// Example share texts
const SHARE_TEMPLATES = {
  challenge_created: (stake, duration) =>
    `Just staked ${stake} ETH on a ${duration}-day @MegaETH streak 🔥\n\nThink you can beat me? 👀\n\n#BetIt #MegaETH`,

  milestone: (days, total, stake) =>
    `${days} days of consistent @MegaETH activity! 🎯\n\nStreak: ${days}/${total}\nStake: ${stake} ETH\n\n#BetIt`,

  won: (duration, payout, profit) =>
    `Just completed my ${duration}-day @MegaETH challenge! 💪\n\nPayout: ${payout} ETH\nProfit: ${profit} ETH\n\n#BetIt`,
};
```

### OG Images (Dynamic Share Cards)

```typescript
// app/api/og/route.tsx
import { ImageResponse } from 'next/og';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const stake = searchParams.get('stake');
    const days = searchParams.get('days');

    return new ImageResponse(
        <div style={{
            width: '1200px',
            height: '630px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
        }}>
            <h1 style={{ fontSize: '72px' }}>{username}'s Streak</h1>
            <p style={{ fontSize: '48px' }}>{days} Days | {stake} ETH</p>
            <p style={{ fontSize: '36px' }}>Bet It on MegaETH</p>
        </div>,
        { width: 1200, height: 630 }
    );
}
```

---

## Head-to-Head Challenges

**Competitive mode with platform fees**

```solidity
struct HeadToHead {
    address challenger;
    address opponent;
    uint256 stake;
    uint256 duration;
    uint256 startDate;
    bool challengerActive;
    bool opponentActive;
    address winner;
}

function createH2H(address _opponent, uint256 _duration) external payable {
    require(msg.value >= 0.01 ether, "Min stake");

    uint256 id = nextH2HId++;
    h2hChallenges[id] = HeadToHead({
        challenger: msg.sender,
        opponent: _opponent,
        stake: msg.value,
        duration: _duration,
        startDate: 0,
        challengerActive: false,
        opponentActive: false,
        winner: address(0)
    });
}

function acceptH2H(uint256 _id) external payable {
    HeadToHead storage h = h2hChallenges[_id];
    require(msg.sender == h.opponent, "Not your challenge");
    require(msg.value == h.stake, "Must match stake");

    h.startDate = block.timestamp;
    h.challengerActive = true;
    h.opponentActive = true;
}

function settleH2H(uint256 _id) external {
    HeadToHead storage h = h2hChallenges[_id];

    bool challengerSuccess = verifySuccess(h.challenger, h.duration);
    bool opponentSuccess = verifySuccess(h.opponent, h.duration);

    uint256 totalPot = h.stake * 2;
    uint256 platformFee = (totalPot * 5) / 100; // 5% fee
    uint256 winnings = totalPot - platformFee;

    if (challengerSuccess && !opponentSuccess) {
        h.winner = h.challenger;
        payable(h.challenger).transfer(winnings);
    } else if (opponentSuccess && !challengerSuccess) {
        h.winner = h.opponent;
        payable(h.opponent).transfer(winnings);
    } else {
        // Draw - return stakes
        payable(h.challenger).transfer(h.stake);
        payable(h.opponent).transfer(h.stake);
    }

    payable(treasury).transfer(platformFee);
}
```

---

## TGE Tracking Integration

**Bet It tracks MegaETH's 3 TGE KPIs in real-time**

### KPI #1: $500M USDM Circulation

```typescript
// Track USDM usage by challengers
async function trackUSDM(tx: Transaction) {
  if (tx.to === USDM_ADDRESS) {
    await db.dailyActivity.update({
      where: { address_date: { address: tx.from, date: today } },
      data: { used_usdm: true },
    });
  }

  // Aggregate for TGE dashboard
  const usdmInContracts = await calculateUSDMInContracts();
  const totalCirculation = await usdmContract.totalSupply();
  const percentage = (usdmInContracts / totalCirculation) * 100;
}
```

### KPI #2: 10 MegaMafia Apps Live

```typescript
// Track which apps have baseline usage
const appUsage = await db.dailyActivity.groupBy({
  by: ["contracts_used"],
  _count: { address: true },
  where: { date: { gte: sevenDaysAgo } },
});

const liveApps = appUsage.filter(
  (app) =>
    app._count.address >= 10 && // 10+ unique users
    MEGAMAFIA_APPS.includes(app.contracts_used),
);
```

### KPI #3: 3 Apps @ $50k Daily Fees

```typescript
// Real-time fee tracking via WebSocket
ws.on("feeEvent", async (event) => {
  const feeUSD = await convertToUSD(event.fee);

  await db.contractMetrics.upsert({
    where: { contract_date: { contract: event.contract, date: today } },
    update: { daily_fees: { increment: feeUSD } },
  });

  // Check if hit $50k threshold
  const metrics = await db.contractMetrics.findUnique({
    where: { contract_date: { contract: event.contract, date: today } },
  });

  if (metrics.daily_fees >= 50000) {
    await incrementConsecutiveDays(event.contract);
  }
});
```

---

## UI/UX Flow

### Landing Page

```
Hero:
"Earn yield or win bonuses on MegaETH streaks"

Two CTAs:
[Become an LP] [Start Challenge]

Stats:
- LP Vault: 12.5 ETH
- Weekly LP Return: 18.3%
- Active Challenges: 47
- Total Paid Out: 8.2 ETH
```

### LP Interface

```
Liquidity Provider Dashboard

Your Position:
- Deposited: 2.5 ETH
- Current Value: 2.87 ETH
- Profit: 0.37 ETH (14.8%)
- Weekly Return: 18.3%

Vault Stats:
- Total Assets: 12.5 ETH
- Active Challenges: 47
- This Week's Revenue: 2.1 ETH

[Deposit More] [Withdraw]
```

### Challenger Interface

```
Create Challenge

Choose Duration:
○ 7 days  - 10% bonus
○ 14 days - 15% bonus
● 30 days - 25% bonus ← Selected
○ 60 days - 40% bonus
○ 90 days - 60% bonus

Your Stake: [0.1] ETH

Potential Payout:
- If you succeed: 0.125 ETH
- Profit: 0.025 ETH (25%)

Requirements:
✓ Daily transaction to verified contract
✓ No missed days

[Create Challenge]
```

---

## Revenue Model

### LP Vault Revenue

- Failed stakes (100%)
- Platform fee on successful challenges (10%)

### H2H Revenue

- Platform fee on winner payout (5%)

### Projections

```
Week 1:
- LP vault: 10 ETH
- Challenges: 5 ETH staked
- LP revenue: 1.75 ETH
- H2H revenue: 0.125 ETH
Platform total: ~$2,000

Month 1:
- LP vault: 50 ETH
- Challenges: 30 ETH staked
- Platform total: ~$25,000
```

---

## Success Metrics

### Week 1

- 10 ETH in LP vault
- 50 challenges created
- 100 unique users
- 5 ETH in challenger stakes

### Month 1

- 50 ETH LP vault
- 200 challenges
- 500 users
- Featured by MegaETH
- TGE dashboard referenced

---

## Tech Stack

```
Smart Contracts:
- Solidity 0.8.24
- Hardhat
- OpenZeppelin

Frontend:
- Next.js 14 (App Router)
- Wagmi + Viem
- TailwindCSS
- Supabase (Postgres)

Infrastructure:
- Vercel
- MegaETH Realtime API (WebSocket)
- Supabase
```

---

## Open Questions

1. Initial LP capital - how much to seed? (2-5 ETH recommended)
2. Verified contracts - which 20 apps to whitelist?
3. Bonus rates - adjust from 10-60%?
4. Platform fees - 10% LP + 5% H2H optimal?
