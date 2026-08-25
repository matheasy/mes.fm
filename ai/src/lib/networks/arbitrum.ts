import { createEtherscanNetwork } from './etherscanNetwork';

export const { getNetworkLedgerData, resolveHistoricalPrice } = createEtherscanNetwork('arbitrum');
