/**
 * Names for addresses that show up as the other side of the owner's transfers - looked up on the
 * block explorers (2026-09-30) so the Taxes page can say what a row went to. Lowercase keys; EVM
 * addresses are the same on every chain. Purely informational: nothing here changes a calculation.
 */
export const KNOWN_ADDRESSES: Record<string, string> = {
  // bridges (the same coin arriving on another chain is the owner's own - label "Bridge to my own wallet")
  '0xe82e2d3b9db59f7c7b438239d92e2190a64e26ce': 'PancakeSwap: XChainSender (cross-chain bridge/swap)',
  '0x73731dacb1ee5906aa515512fcda2074d690487a': 'Fly: Magpie Stargate Bridge (cross-chain)',
  '0xef4fb24ad0916217251f553c0596f8edc630eb66': 'deBridge: DlnSource (cross-chain)',
  '0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf': 'Polygon (Matic): ERC20 Bridge',
  // swaps / aggregators
  '0x20f6ee51340adeed01a59b0e65cb3703f3dc860c': 'Fly: Dex Aggregator (swap)',
  '0x990636ecb3ff04d33d92e970d3d588bf5cd8d086': '1inch: Aggregation Executor (swap)',
  // staking / farms
  '0xf7a58c660245d6ac6b1367d84694b7fa46c935b8': 'NIOX: Staking Contract',
  '0x3742ae6bd5cd9c06a8279baff9997fd897ba3fa0': 'Autonio NIOX staking (Polygon)',
  '0xa1eb5fb7c1b2d7b49c79ad1e3a0476205915fd90': 'Autonio NIOX Vault (Polygon, 180-day lock)',
  '0x227e79c83065edb8b954848c46ca50b96cb33e16': 'Cub Finance farm',
  '0x2e72f4b196b9e5b89c29579cc135756a00e6cbbd': 'Cub Finance farm (2nd)',
  '0x08bea2702d89abb8059853d654d0838c5e06fe0b': 'Cub Finance CUB staking',
  '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364': 'PancakeSwap V3 position manager',
  '0x556b9306565093c855aea9ae92a594704c2cd59e': 'PancakeSwap MasterChef V3 farm',
  // plain wallets (not contracts)
  '0x27bf3c74df402476d5b11dd1f15022df3ba71552': 'wallet funded from Bybit and Shakepay - yours?',
  '0xd0e226f674bbf064f54ab47f42473ff80db98cba': 'plain wallet (dormant on Ethereum)',
  '0x787300f3b94524360a7245923b20840131a42ada': 'plain wallet (active DEX trader)',
  '0xa95d9c1f655341597c94393fddc30cf3c08e4fce': 'plain wallet collecting small USDC payments',
  // Hive accounts
  'vsc.gateway': 'Magi (VSC) gateway - your own HBD on Magi',
  'honey-swap': 'Hive Engine peg (HIVE <-> SWAP.HIVE)',
  'keychain.swap': 'Hive Keychain swap',
  dswap: 'Hive Engine DEX (dswap)',
  leopool: 'LeoDex pool',
  'peak.pay': 'PeakD payments',
  peakd: 'PeakD',
};

export function knownName(address: string): string | null {
  return KNOWN_ADDRESSES[address.toLowerCase()] ?? null;
}
