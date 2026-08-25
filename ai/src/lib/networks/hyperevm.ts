/**
 * HyperEVM's public JSON-RPC endpoint. Only used for a native-HYPE-balance read (`eth_getBalance`)
 * - there's no explorer/indexer API key configured for HyperEVM, so ERC-20 token *discovery* at
 * this address isn't possible here (a known, documented limitation - see README). HyperCore
 * (Hyperliquid's spot/perp L1) is NOT EVM-standard and is handled entirely separately in
 * hyperliquid.ts via Hyperliquid's own REST API, not this RPC endpoint.
 */
const RPC_URL = 'https://rpc.hyperliquid.xyz/evm';

export async function getNativeBalanceWei(address: string): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`HyperEVM RPC request failed: ${res.status}`);

  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(`HyperEVM RPC error: ${json.error.message}`);
  if (!json.result) throw new Error('HyperEVM RPC returned no result');

  return BigInt(json.result).toString();
}
