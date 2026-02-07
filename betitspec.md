# Bet It - Onchain Streak Accountability Platform

## Overview
Bet It is an onchain accountability system where users stake crypto on maintaining their MegaETH transaction streaks. Smart contracts verify activity via the existing transaction heatmap and automatically distribute stakes based on outcomes. Creates skin-in-the-game commitment devices with three distinct challenge modes.

## Core Value Proposition
**"Put your money where your streak is"**

The transaction heatmap gamifies consistency through visual feedback. Bet It adds financial stakes:
- Visual streak → Financial commitment
- Public accountability → Loss aversion
- Competition → Engagement
- Platform fees → Revenue

## Challenge Modes

### Mode 1: Personal Challenge (Solo)

**Concept:** User bets they can maintain streak for X days

**Flow:**
```
1. User views their heatmap
2. "Bet on my streak" button
3. Set parameters:
   - Duration: 7, 14, 30, 60, 90 days
   - Stake amount: 0.01-10 ETH (or USDm)
   - Success reward: Stake returned + achievement NFT
4. Stake deposited in smart contract
5. Daily verification via heatmap data
6. Break streak = lose stake (sent to treasury)
7. Complete = withdraw stake + NFT
```

**Smart Contract:**
```solidity
struct PersonalChallenge {
    address user;
    uint256 stakeAmount;
    uint256 duration; // in days
    uint256 startDate;
    uint256 lastVerified;
    bool active;
    bool completed;
}

function createPersonalChallenge(uint256 _duration) external payable {
    require(msg.value >= 0.01 ether, "Minimum stake 0.01 ETH");
    require(_duration >= 7, "Minimum 7 days");
    
    challenges[msg.sender] = PersonalChallenge({
        user: msg.sender,
        stakeAmount: msg.value,
        duration: _duration,
        startDate: block.timestamp,
        lastVerified: block.timestamp,
        active: true,
        completed: false
    });
    
    emit ChallengeCreated(msg.sender, _duration, msg.value);
}

function verifyStreak(address _user) external {
    PersonalChallenge storage c = challenges[_user];
    require(c.active, "Challenge not active");
    
    // Check heatmap for transaction in last 24h
    bool hasTransacted = heatmapContract.checkActivity(_user, c.lastVerified);
    
    if (!hasTransacted) {
        // Streak broken
        c.active = false;
        uint256 platformFee = (c.stakeAmount * 5) / 100;
        payable(treasury).transfer(c.stakeAmount);
        emit ChallengeFailed(_user, c.stakeAmount);
    } else {
        c.lastVerified = block.timestamp;
        
        // Check if duration complete
        if (block.timestamp >= c.startDate + (c.duration * 1 days)) {
            c.active = false;
            c.completed = true;
            payable(_user).transfer(c.stakeAmount);
            achievementNFT.mint(_user, c.duration);
            emit ChallengeCompleted(_user, c.duration);
        }
    }
}
```

**UI Flow:**
```
Personal Challenge Dashboard

Current Challenge:
├─ Duration: 30 days
├─ Progress: 15/30 days (50%)
├─ Stake: 0.5 ETH ($1,500)
├─ Last transaction: 3 hours ago
├─ Status: Active ✓
└─ Next verification: 21 hours

[Your Heatmap - Last 30 Days]
■■■■■■■■■■■■■■■□□□□□□...

Streak Stats:
- Current: 15 days 🔥
- At Risk: No
- Gas spent maintaining: $0.12 (vs $8.40 on Base)

[End Challenge Early] [Extend Duration]
```

### Mode 2: Head-to-Head (Competitive)

**Concept:** Two users bet on who maintains streak longer

**Flow:**
```
1. User A creates challenge
2. Sets stake amount + duration
3. Challenge posted publicly
4. User B accepts (must match stake)
5. Both users tracked independently
6. First to break streak loses
7. Winner takes pot (minus 5% platform fee)
8. If both complete duration, stakes returned (draw)
```

**Smart Contract:**
```solidity
struct HeadToHeadChallenge {
    address userA;
    address userB;
    uint256 stakeAmount;
    uint256 duration;
    uint256 startDate;
    uint256 lastVerifiedA;
    uint256 lastVerifiedB;
    bool userAActive;
    bool userBActive;
    ChallengeStatus status; // PENDING, ACTIVE, COMPLETED
}

enum ChallengeStatus { PENDING, ACTIVE, COMPLETED }

function createHeadToHead(uint256 _duration) external payable {
    require(msg.value >= 0.01 ether, "Minimum stake");
    
    uint256 challengeId = nextChallengeId++;
    h2hChallenges[challengeId] = HeadToHeadChallenge({
        userA: msg.sender,
        userB: address(0),
        stakeAmount: msg.value,
        duration: _duration,
        startDate: 0,
        lastVerifiedA: 0,
        lastVerifiedB: 0,
        userAActive: true,
        userBActive: false,
        status: ChallengeStatus.PENDING
    });
    
    emit HeadToHeadCreated(challengeId, msg.sender, _duration, msg.value);
}

function acceptHeadToHead(uint256 _challengeId) external payable {
    HeadToHeadChallenge storage c = h2hChallenges[_challengeId];
    require(c.status == ChallengeStatus.PENDING, "Not accepting");
    require(msg.value == c.stakeAmount, "Must match stake");
    require(msg.sender != c.userA, "Cannot challenge yourself");
    
    c.userB = msg.sender;
    c.userBActive = true;
    c.startDate = block.timestamp;
    c.lastVerifiedA = block.timestamp;
    c.lastVerifiedB = block.timestamp;
    c.status = ChallengeStatus.ACTIVE;
    
    emit HeadToHeadAccepted(_challengeId, msg.sender);
}

function verifyHeadToHead(uint256 _challengeId) external {
    HeadToHeadChallenge storage c = h2hChallenges[_challengeId];
    require(c.status == ChallengeStatus.ACTIVE, "Not active");
    
    bool userATransacted = heatmapContract.checkActivity(c.userA, c.lastVerifiedA);
    bool userBTransacted = heatmapContract.checkActivity(c.userB, c.lastVerifiedB);
    
    // Check if either broke streak
    if (!userATransacted && c.userAActive) {
        c.userAActive = false;
        // User A broke, User B wins
        uint256 totalPot = c.stakeAmount * 2;
        uint256 platformFee = (totalPot * 5) / 100;
        uint256 winnings = totalPot - platformFee;
        
        payable(treasury).transfer(platformFee);
        payable(c.userB).transfer(winnings);
        c.status = ChallengeStatus.COMPLETED;
        
        emit HeadToHeadCompleted(_challengeId, c.userB, winnings);
        return;
    }
    
    if (!userBTransacted && c.userBActive) {
        c.userBActive = false;
        // User B broke, User A wins
        uint256 totalPot = c.stakeAmount * 2;
        uint256 platformFee = (totalPot * 5) / 100;
        uint256 winnings = totalPot - platformFee;
        
        payable(treasury).transfer(platformFee);
        payable(c.userA).transfer(winnings);
        c.status = ChallengeStatus.COMPLETED;
        
        emit HeadToHeadCompleted(_challengeId, c.userA, winnings);
        return;
    }
    
    // Both still active, update verification times
    if (userATransacted) c.lastVerifiedA = block.timestamp;
    if (userBTransacted) c.lastVerifiedB = block.timestamp;
    
    // Check if duration complete (both succeeded)
    if (block.timestamp >= c.startDate + (c.duration * 1 days)) {
        // Draw - return stakes
        payable(c.userA).transfer(c.stakeAmount);
        payable(c.userB).transfer(c.stakeAmount);
        c.status = ChallengeStatus.COMPLETED;
        
        emit HeadToHeadDraw(_challengeId);
    }
}
```

**UI Flow:**
```
Head-to-Head Challenges

Create Challenge:
├─ Your stake: [0.5 ETH]
├─ Duration: [30 days ▼]
├─ Prize pool: 1.0 ETH (winner takes 0.95 ETH)
└─ [Create Challenge]

Active Challenges (Available):
┌─────────────────────────────────────┐
│ @bread challenges anyone            │
│ Stake: 0.2 ETH | Duration: 14 days  │
│ Created: 2 hours ago                │
│ [Accept Challenge]                  │
└─────────────────────────────────────┘

Your Active Challenge:
vs @cryptomom

@adeolu           vs          @cryptomom
Day 8/30                      Day 8/30
✓ Active                      ✓ Active
Last tx: 2h ago              Last tx: 5h ago

[Your Heatmap]    vs    [Their Heatmap]
■■■■■■■■...              ■■■■■■■■...

Prize: 0.95 ETH (0.5 each staked)
Status: Both on track
```

### Mode 3: Trusted Slash (Accountability Partner)

**Concept:** User stakes money that a trusted person can claim if streak breaks

**Flow:**
```
1. User creates challenge
2. Names accountability partner (FC username or address)
3. Stakes amount
4. If user breaks streak:
   - Partner gets notification
   - Partner can claim stake
   - Or decline (stake returned to user)
5. If user completes:
   - Stake returned
   - Partner gets small reward (0.01 ETH from platform)
```

**Smart Contract:**
```solidity
struct TrustedSlashChallenge {
    address user;
    address partner;
    uint256 stakeAmount;
    uint256 duration;
    uint256 startDate;
    uint256 lastVerified;
    bool active;
    bool broken;
    bool partnerClaimed;
}

function createTrustedSlash(
    address _partner,
    uint256 _duration
) external payable {
    require(msg.value >= 0.01 ether, "Minimum stake");
    require(_partner != msg.sender, "Cannot be your own partner");
    
    uint256 challengeId = nextTrustedId++;
    trustedChallenges[challengeId] = TrustedSlashChallenge({
        user: msg.sender,
        partner: _partner,
        stakeAmount: msg.value,
        duration: _duration,
        startDate: block.timestamp,
        lastVerified: block.timestamp,
        active: true,
        broken: false,
        partnerClaimed: false
    });
    
    emit TrustedSlashCreated(challengeId, msg.sender, _partner, _duration);
}

function verifyTrustedSlash(uint256 _challengeId) external {
    TrustedSlashChallenge storage c = trustedChallenges[_challengeId];
    require(c.active, "Not active");
    
    bool hasTransacted = heatmapContract.checkActivity(c.user, c.lastVerified);
    
    if (!hasTransacted) {
        // Streak broken - partner can claim
        c.active = false;
        c.broken = true;
        emit StreakBroken(_challengeId, c.user, c.partner);
        // Partner must call claimBrokenStreak to get funds
    } else {
        c.lastVerified = block.timestamp;
        
        if (block.timestamp >= c.startDate + (c.duration * 1 days)) {
            // User completed challenge
            c.active = false;
            payable(c.user).transfer(c.stakeAmount);
            // Small reward to partner for supporting
            payable(c.partner).transfer(0.01 ether); // from treasury
            emit TrustedSlashCompleted(_challengeId, c.user);
        }
    }
}

function claimBrokenStreak(uint256 _challengeId) external {
    TrustedSlashChallenge storage c = trustedChallenges[_challengeId];
    require(msg.sender == c.partner, "Only partner can claim");
    require(c.broken, "Streak not broken");
    require(!c.partnerClaimed, "Already claimed");
    
    c.partnerClaimed = true;
    payable(c.partner).transfer(c.stakeAmount);
    
    emit PartnerClaimed(_challengeId, c.partner, c.stakeAmount);
}

function declineStake(uint256 _challengeId) external {
    TrustedSlashChallenge storage c = trustedChallenges[_challengeId];
    require(msg.sender == c.partner, "Only partner");
    require(c.broken, "Not broken");
    require(!c.partnerClaimed, "Already claimed");
    
    // Partner declines, return to user
    payable(c.user).transfer(c.stakeAmount);
    
    emit PartnerDeclined(_challengeId);
}
```

**UI Flow:**
```
Trusted Slash Setup

Your accountability partner:
├─ Search: [@cryptomom]
├─ Or paste address: [0x...]
└─ Why: They can claim your stake if you fail

Challenge Details:
├─ Your stake: [1.0 ETH]
├─ Duration: [30 days ▼]
├─ If you break: Partner gets 1.0 ETH
├─ If you complete: You get 1.0 ETH back
└─ Partner reward: 0.01 ETH (from platform)

[Create Challenge]

---

Active Challenge:
You vs Accountability (@cryptomom)

Your Progress:
├─ Day 12/30 (40%)
├─ Stake at risk: 1.0 ETH
├─ Last tx: 4 hours ago
└─ Status: On track ✓

If you break streak:
@cryptomom will be notified and can claim your 1.0 ETH

Motivation:
"Don't let @cryptomom down (and take your money)"

[Your Heatmap]
■■■■■■■■■■■■...
```

## Heatmap Integration

**Data Source:**
```javascript
// Existing heatmap contract/API provides:
interface IHeatmap {
  // Check if user had transaction in time window
  function checkActivity(
    address user,
    uint256 since
  ) external view returns (bool);
  
  // Get user's current streak
  function getCurrentStreak(
    address user
  ) external view returns (uint256);
  
  // Get last transaction timestamp
  function getLastTransaction(
    address user
  ) external view returns (uint256);
}
```

**Verification Logic:**
```javascript
// Called daily by keeper/cron
async function verifyAllChallenges() {
  // Get all active challenges
  const personal = await contract.getActivePersonalChallenges();
  const h2h = await contract.getActiveH2HChallenges();
  const trusted = await contract.getActiveTrustedChallenges();
  
  // Verify each
  for (const challenge of personal) {
    await contract.verifyStreak(challenge.user);
  }
  
  for (const challenge of h2h) {
    await contract.verifyHeadToHead(challenge.id);
  }
  
  for (const challenge of trusted) {
    await contract.verifyTrustedSlash(challenge.id);
  }
}

// Run every 6 hours (4x per day)
cron.schedule('0 */6 * * *', verifyAllChallenges);
```

## Gas Savings Integration

**Display During Challenge:**
```
Challenge Progress: 15/30 days

Your commitment cost:
├─ Total gas spent: $0.18 (15 txs on MegaETH)
├─ If on Base: $12.45 (same 15 txs)
├─ Saved: $12.27 (98.6% cheaper)
└─ Courtesy of: USDm subsidies

Your stake is working harder on MegaETH 💪
```

**This is the ONLY Base comparison** - one stat line showing savings.

## Platform Economics

### Revenue Model

**Platform Fees:**
```
Personal Challenge:
- Failed challenges: 100% to treasury
- Completed: User gets full stake back

Head-to-Head:
- Winner takes: 95% of pot
- Platform fee: 5% of pot
- Example: 0.5 ETH each = 1.0 ETH pot
  - Winner: 0.95 ETH
  - Platform: 0.05 ETH

Trusted Slash:
- Failed: Partner gets 100% of stake (no fee)
- Completed: User gets stake + partner gets 0.01 ETH reward
- Platform pays partner reward from treasury
```

**Revenue Projections:**
```
Conservative (Month 1):
- 50 personal challenges × 0.1 ETH avg × 30% fail = 1.5 ETH
- 20 H2H challenges × 1.0 ETH pot × 5% = 1.0 ETH
- Total: 2.5 ETH/month (~$7,500)

Growth (Month 3):
- 200 personal × 0.2 ETH × 30% fail = 12 ETH
- 100 H2H × 1.0 ETH × 5% = 5 ETH
- Total: 17 ETH/month (~$51,000)

Mature (Month 6):
- 500 personal × 0.3 ETH × 30% fail = 45 ETH
- 300 H2H × 1.5 ETH × 5% = 22.5 ETH
- Total: 67.5 ETH/month (~$202,500)
```

### Treasury Management

**Use of Funds:**
```
Platform Revenue Allocation:
├─ 40% - Development & operations
├─ 30% - Marketing & growth
├─ 20% - Trusted Slash partner rewards pool
└─ 10% - Insurance fund (handle edge cases)
```

## Frontend Architecture

### Tech Stack
```
Frontend:
- Next.js 14 (App Router)
- Wagmi + Viem (wallet connection)
- TailwindCSS + shadcn/ui
- Framer Motion (animations)

Smart Contracts:
- Solidity 0.8.24
- Hardhat for development
- OpenZeppelin (ReentrancyGuard, Ownable)
- Chainlink Keepers (automated verification)

Backend:
- PostgreSQL (challenge history, notifications)
- Redis (cache active challenges)
- Node.js cron (backup verification)
```

### Page Structure
```
/bet-it
  /                          # Landing page
  /create                    # Create challenge (mode selector)
  /challenges                # Browse active challenges
  /dashboard                 # Your active/past challenges
  /leaderboard              # Top stakers, longest challenges
  /challenge/[id]           # Individual challenge page
```

### Key Components
```
/components/bet-it
  /ChallengeCard.tsx        # Display challenge info
  /CreateForm.tsx           # Create challenge form
  /StakeInput.tsx           # ETH/USDm amount input
  /VerificationStatus.tsx   # "Last verified 3h ago"
  /ProgressBar.tsx          # Visual progress
  /HeatmapPreview.tsx       # Mini heatmap in challenge
  /GasSavings.tsx           # "Saved $X on gas" stat
  /AcceptChallenge.tsx      # Accept H2H button/flow
  /ClaimButton.tsx          # Claim winnings
```

## User Flows

### Create Personal Challenge
```
1. User clicks "Create Challenge"
2. Select mode: Personal
3. Set duration: [7, 14, 30, 60, 90 days]
4. Set stake: [0.01 - 10 ETH/USDm]
5. Preview:
   - "You stake 0.5 ETH"
   - "Complete 30 days → get 0.5 ETH back + NFT"
   - "Break streak → lose 0.5 ETH"
6. Approve + Sign transaction
7. Challenge created → redirected to dashboard
8. Daily verification automatic
9. Notifications if at risk
```

### Accept Head-to-Head
```
1. Browse active challenges
2. See challenge card:
   - Creator: @bread
   - Stake: 0.5 ETH
   - Duration: 14 days
   - Prize: 0.95 ETH (winner)
3. Click "Accept Challenge"
4. View heatmap comparison preview
5. Confirm stake matches (0.5 ETH)
6. Sign transaction
7. Challenge starts immediately
8. Both tracked in parallel
9. Notifications on status changes
```

### Partner Claims Broken Streak
```
Partner receives notification:
"@adeolu broke their 30-day streak (failed on day 18).
You can claim 1.0 ETH or decline and return it to them."

Options:
1. [Claim 1.0 ETH] → funds sent to partner
2. [Decline & Return] → funds sent back to user
3. 7-day timeout → auto-returned if no action
```

## Achievement NFTs

**Minted on Challenge Completion:**
```
Personal Challenge NFTs:

7-Day Warrior
- "Completed 7-day MegaETH streak"
- Stake: 0.X ETH
- Date: Jan 15, 2026

30-Day Master
- "Completed 30-day MegaETH streak"
- Stake: 0.X ETH
- Date: Feb 14, 2026

90-Day Legend
- "Completed 90-day MegaETH streak"
- Stake: 0.X ETH
- Date: Apr 15, 2026

Metadata includes:
- Duration
- Stake amount
- Start/end dates
- Total gas spent
- Total saved vs Base
```

**Display on Profile:**
```
@adeolu's Achievements

[7-Day Warrior] [30-Day Master]
Earned: Jan 15    Earned: Feb 14

Total staked: 2.5 ETH
Success rate: 66% (2/3 challenges)
Longest: 30 days
```

## Notifications

**Email/Farcaster/Twitter:**
```
Streak At Risk:
"⚠️ Your 0.5 ETH stake is at risk! No transaction in 20 hours. 
4 hours left to maintain your 15-day streak."

Challenge Starting:
"🔥 Your 30-day challenge with @cryptomom starts now! 
First to break loses 0.5 ETH."

Opponent Broke Streak:
"🎉 @cryptomom broke their streak! You win 0.95 ETH!
Claim your winnings."

Partner Notification:
"@adeolu broke their streak. You can claim 1.0 ETH or 
decline and return it to them."

Challenge Complete:
"✅ You completed your 30-day challenge! 
Claim your 0.5 ETH stake + achievement NFT."
```

## Security Considerations

### Smart Contract Risks

**Reentrancy:**
```solidity
// Use OpenZeppelin's ReentrancyGuard
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract BetIt is ReentrancyGuard, Ownable {
    function claimWinnings(uint256 _challengeId) 
        external 
        nonReentrant 
    {
        // Transfer funds
    }
}
```

**Oracle Manipulation:**
```solidity
// Heatmap data must be trustless
// Options:
// 1. On-chain transaction indexer (most secure)
// 2. Chainlink oracle (decentralized)
// 3. Multi-sig verification (good enough for MVP)

// For MVP: Contract owner can verify
// For production: Chainlink Keepers + on-chain proofs
```

**Griefing Attacks:**
```solidity
// H2H: User creates challenge then breaks immediately
// Mitigation: Minimum 24h before verification starts

function acceptHeadToHead(uint256 _challengeId) external payable {
    // ...
    c.startDate = block.timestamp + 24 hours; // Grace period
    // ...
}
```

**Time Manipulation:**
```solidity
// Use block.timestamp carefully
// Daily verification window: 24 hours ± 1 hour buffer

function hasTransactedToday(address _user) public view returns (bool) {
    uint256 lastTx = heatmap.getLastTransaction(_user);
    uint256 dayStart = block.timestamp - (block.timestamp % 1 days);
    return lastTx >= dayStart;
}
```

### Audit Requirements

**Must audit before mainnet:**
- Reentrancy vulnerabilities
- Integer overflow/underflow
- Access control
- Fund locking scenarios
- Edge cases (ties, timeouts, disputes)

**Audit Budget:** $15,000 - $25,000 (Zellic, Trail of Bits, or similar)

## Launch Strategy

### Pre-Launch (Week Before)

**Marketing:**
```
Twitter/Farcaster campaign:
"We're launching Bet It - stake crypto on your MegaETH streak.

Week of Jan 20:
- Day 1: Personal challenges live
- Day 3: H2H challenges live
- Day 5: Trusted Slash live

First 100 users get achievement NFT regardless of outcome."
```

**Testnet Beta:**
- Deploy to MegaETH testnet
- Invite 20-50 beta testers
- Find bugs before mainnet
- Iterate based on feedback

### Launch Week

**Day 1: Personal Challenges Only**
- Simplest mode
- Let users get comfortable
- Monitor for issues

**Day 3: Head-to-Head**
- More complexity
- Build on personal challenge success
- Create competitive energy

**Day 5: Trusted Slash**
- Most nuanced mode
- Requires understanding of other modes
- Social features kick in

### Growth Tactics

**Influencer Challenges:**
```
"@biginfluencer just staked 5 ETH on a 30-day MegaETH streak.
Think you can beat them? Challenge accepted at [link]"
```

**Leaderboards:**
```
Biggest Stakes:
1. @whale - 10 ETH (30 days)
2. @degen - 5 ETH (60 days)
3. @believer - 3 ETH (90 days)

Most Successful:
1. @consistent - 5/5 challenges (100%)
2. @reliable - 8/9 challenges (89%)
3. @adeolu - 2/3 challenges (67%)
```

**Social Proof:**
```
Daily stats posted by FC bot:
"Bet It Stats (24h):
- 12 new challenges created
- 8 challenges completed
- 3 streaks broken
- 4.5 ETH in active stakes
- $127 saved in gas collectively"
```

## Success Metrics

### Week 1
- ✅ 50+ challenges created
- ✅ 10+ ETH in total stakes
- ✅ 5+ H2H matches active
- ✅ Zero critical bugs
- ✅ <5s transaction confirmation

### Month 1
- ✅ 200+ challenges created
- ✅ 50+ ETH total volume
- ✅ 30+ active simultaneous challenges
- ✅ 2 ETH platform revenue
- ✅ Featured by MegaETH official

### Month 3
- ✅ 1,000+ challenges
- ✅ 200+ ETH volume
- ✅ 100+ daily active users
- ✅ 15 ETH revenue
- ✅ Partnerships with 3+ protocols

## Technical Roadmap

### Phase 1: MVP (Week 1-2)
**Time: 40-50 hours**
- Smart contracts (Personal + H2H)
- Basic frontend (create, view, claim)
- Manual verification (contract owner)
- Testnet deployment

### Phase 2: Automation (Week 3)
**Time: 15-20 hours**
- Chainlink Keepers integration
- Automated daily verification
- Notification system (email)
- Achievement NFT minting

### Phase 3: Social (Week 4)
**Time: 15-20 hours**
- Trusted Slash mode
- Farcaster notifications
- Leaderboards
- Social sharing

### Phase 4: Polish (Month 2)
**Time: 20-30 hours**
- Smart contract audit
- UX improvements
- Analytics dashboard
- Mobile optimization

**Total MVP to Production: 90-120 hours (3-4 weeks)**

## Open Questions

1. **Heatmap contract interface?** Need exact ABI/API to integrate
2. **USDm support?** Allow staking in USDm or just ETH?
3. **Minimum stake?** 0.01 ETH too low? Too high?
4. **Verification frequency?** Daily enough or need more frequent?
5. **Grace periods?** Allow 1 missed day or strict daily requirement?
6. **Platform fee structure?** 5% on H2H fair or adjust?
7. **Treasury multisig?** Who controls platform funds?
8. **Dispute resolution?** What if verification fails incorrectly?

---

**Next Steps:**
1. Finalize heatmap integration specs
2. Write complete smart contracts
3. Set up development environment
4. Begin frontend scaffolding
5. Plan audit timeline/budget