import type { Quote, Spot } from '../prices';

/**
 * USD prices for the wrapped / bridged / stable tokens that show up in almost every LP, derived from
 * the shared CoinGecko spot call instead of a per-contract lookup. Keyless CoinGecko allows one
 * contract per request and rate-limits fast, so without this an LP whose legs are WBNB/WETH/USDC
 * could silently come back unpriced.
 */

type Peg = 'usd' | 'ethereum' | 'bitcoin' | 'binancecoin' | 'polygon-ecosystem-token';

const TABLE: Record<string, Record<string, Peg>> = {
  bsc: {
    '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': 'binancecoin', // WBNB
    '0x2170ed0880ac9a755fd29b2688956bd959f933f8': 'ethereum', // Binance-Peg ETH
    '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c': 'bitcoin', // BTCB
    '0x55d398326f99059ff775485246999027b3197955': 'usd', // USDT
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': 'usd', // USDC
    '0xe9e7cea3dedca5984780bafc599bd69add087d56': 'usd', // BUSD
  },
  ethereum: {
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'ethereum', // WETH
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'bitcoin', // WBTC
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'usd', // USDC
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 'usd', // USDT
    '0x6b175474e89094c44da98b954eedeac495271d0f': 'usd', // DAI
  },
  arbitrum: {
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'ethereum', // WETH
    '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 'bitcoin', // WBTC
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'usd', // USDC
    '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': 'usd', // USDC.e
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 'usd', // USDT
  },
  base: {
    '0x4200000000000000000000000000000000000006': 'ethereum', // WETH
    '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': 'bitcoin', // cbBTC
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'usd', // USDC
  },
  optimism: {
    '0x4200000000000000000000000000000000000006': 'ethereum', // WETH
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85': 'usd', // USDC
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': 'usd', // USDT
  },
  polygon: {
    '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': 'polygon-ecosystem-token', // WPOL
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': 'ethereum', // WETH
    '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': 'bitcoin', // WBTC
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 'usd', // USDC
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 'usd', // USDC.e
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 'usd', // USDT
  },
};

export function wellKnownUsd(chain: string, contract: string, spot: Spot): Quote | null {
  const peg = TABLE[chain]?.[contract.toLowerCase()];
  if (!peg) return null;
  if (peg === 'usd') return { usd: 1, change24h: null };
  return spot[peg] ?? null;
}
