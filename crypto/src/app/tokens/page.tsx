'use client';

import BucketView from '@/components/BucketView';

/** mes.fm/tokens - every token worth $10+ that no other dashboard counts (lib/cashTokens.ts) */
export default function TokensPage() {
  return (
    <BucketView
      path="/api/tokens"
      totalLabel="Tokens total"
      intro={
        <>
          Every other token you hold worth $10 or more, each summed across your wallets (HIVE counts liquid, Hive Power and unclaimed rewards on
          every account). Not here: the AI Trading and MikeFA wallets, Store of Value (Bitcoin, XRP, TGLD), Liquidity, Random Wallets and{' '}
          <a href="https://mes.fm/cash" className="text-accent hover:underline">
            Cash LP
          </a>
          . Balances come from{' '}
          <a href="https://mes.fm/assets" className="text-accent hover:underline">
            mes.fm/assets
          </a>
          .
        </>
      }
    />
  );
}
