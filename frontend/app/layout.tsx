import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Bet It - MegaETH Streak Accountability',
  description: 'Stake on your MegaETH streak and win bonuses, or provide liquidity and earn yield.',
  openGraph: {
    title: 'Bet It - MegaETH Streak Accountability',
    description: 'Stake on your MegaETH streak and win bonuses',
    images: ['/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bet It - MegaETH Streak Accountability',
    description: 'Stake on your MegaETH streak and win bonuses',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
