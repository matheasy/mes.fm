/**
 * PancakeSwap contracts the Main wallet provides liquidity through (BNB Chain). The V3 position
 * manager mints/burns the position NFTs; MasterChef V3 is the farm a position is staked in - once
 * staked, adding/removing liquidity and harvesting CAKE all go through it (the 2026-09-28 removals
 * came from it). Shared by the Liquidity page (/api/lp) and the tax calculation (lib/tax/acb.ts).
 */
export const PANCAKE_V3_POSITION_MANAGER = '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364';
export const PANCAKE_MASTERCHEF_V3 = '0x556b9306565093c855aea9ae92a594704c2cd59e';

export const LP_CONTRACTS: ReadonlySet<string> = new Set([PANCAKE_V3_POSITION_MANAGER, PANCAKE_MASTERCHEF_V3]);

export function isLpContract(address: string | null | undefined): boolean {
  return !!address && LP_CONTRACTS.has(address.toLowerCase());
}

/** CAKE paid out by the farm is a reward (income), not liquidity coming back */
export function isFarmReward(symbol: string, from: string): boolean {
  return symbol.toUpperCase() === 'CAKE' && from.toLowerCase() === PANCAKE_MASTERCHEF_V3;
}
