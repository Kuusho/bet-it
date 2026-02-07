// Contract addresses (to be updated after deployment)
export const CONTRACTS = {
  VAULT: process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` || '0x',
  CHALLENGES: process.env.NEXT_PUBLIC_CHALLENGES_ADDRESS as `0x${string}` || '0x',
} as const;

// MegaETH Network Configuration
export const MEGAETH_CHAIN = {
  id: 4326,
  name: 'MegaETH',
  network: 'megaeth',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_MEGAETH_RPC || 'https://rpc.megaeth.systems'],
    },
    public: {
      http: ['https://rpc.megaeth.systems'],
    },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://explorer.megaeth.systems' },
  },
  testnet: false,
} as const;

// Bonus rates for different durations
export const BONUS_RATES = {
  7: 10,   // 7 days = 10%
  14: 15,  // 14 days = 15%
  30: 25,  // 30 days = 25%
  60: 40,  // 60 days = 40%
  90: 60,  // 90 days = 60%
} as const;

export type Duration = keyof typeof BONUS_RATES;

// Platform constants
export const PLATFORM_FEE = 10; // 10% of bonus
export const MIN_STAKE = 0.01; // 0.01 ETH
export const MAX_STAKE = 100; // 100 ETH
export const GRACE_PERIOD = 24 * 60 * 60; // 24 hours in seconds
