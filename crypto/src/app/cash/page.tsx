'use client';

import BucketView from '@/components/BucketView';

/** mes.fm/cash - Cash LP: stablecoins, the Magi BTC/HBD pool, ACE and SURGE (lib/cashTokens.ts) */
export default function CashPage() {
  return (
    <BucketView
      path="/api/cash"
      totalLabel="Cash LP total"
      intro={
        <>
          Your cash-like holdings: every stablecoin (HBD on Hive and Magi, USDT, USDC ...) outside the AI Trading and MikeFA wallets, the BTC/HBD
          liquidity pool on Magi (altera.magi.eco), and ACE and SURGE on Hive Engine. Balances come from{' '}
          <a href="https://mes.fm/assets" className="text-accent hover:underline">
            mes.fm/assets
          </a>
          ; nothing here is also counted on Store of Value, Liquidity or{' '}
          <a href="https://mes.fm/tokens" className="text-accent hover:underline">
            Tokens
          </a>
          .
        </>
      }
    />
  );
}
