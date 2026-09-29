import { cacheKey, getValues, setValue } from '../cache';

/** Keyless public RPCs per EVM network the tax report sees (first that answers wins) */
const RPCS: Record<string, string[]> = {
  bsc: ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com'],
  ethereum: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com'],
  polygon: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon-rpc.com'],
  arbitrum: ['https://arbitrum-one-rpc.publicnode.com', 'https://arb1.arbitrum.io/rpc'],
};

export const EVM_NETWORKS = new Set(Object.keys(RPCS));

async function getCodes(network: string, addresses: string[]): Promise<Map<string, boolean>> {
  const body = addresses.map((a, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_getCode', params: [a, 'latest'] }));
  let lastError: unknown;
  for (const url of RPCS[network] ?? []) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      const json = (await res.json()) as { id: number; result?: string }[];
      if (!Array.isArray(json)) throw new Error(`${url}: unexpected reply`);
      const out = new Map<string, boolean>();
      for (const r of json) if (typeof r.result === 'string') out.set(addresses[r.id]!, r.result !== '0x' && r.result.length > 2);
      return out;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`No RPC answered for ${network}`);
}

/**
 * Which of these (network, address) pairs are smart contracts (have code), as `network:address`.
 * Answers are cached for good - an address doesn't stop being a contract. An address whose check
 * fails is left out (treated as not a contract), the safe side: its moves stay sales/purchases.
 */
export async function contractsAmong(pairs: { network: string; address: string }[]): Promise<Set<string>> {
  const unique = [...new Map(pairs.filter((p) => EVM_NETWORKS.has(p.network)).map((p) => [`${p.network}:${p.address.toLowerCase()}`, p])).values()];
  const keys = unique.map((p) => cacheKey('iscontract', p.network, p.address.toLowerCase()));
  const cachedAnswers = await getValues<{ c: boolean }>(keys);

  const found = new Set<string>();
  const todo = new Map<string, string[]>();
  unique.forEach((p, i) => {
    const hit = cachedAnswers[i];
    const id = `${p.network}:${p.address.toLowerCase()}`;
    if (hit) {
      if (hit.c) found.add(id);
    } else {
      const list = todo.get(p.network) ?? [];
      list.push(p.address.toLowerCase());
      todo.set(p.network, list);
    }
  });

  await Promise.all(
    [...todo.entries()].map(async ([network, addresses]) => {
      for (let i = 0; i < addresses.length; i += 50) {
        const chunk = addresses.slice(i, i + 50);
        try {
          const codes = await getCodes(network, chunk);
          await Promise.all(
            [...codes.entries()].map(([a, isContract]) => {
              if (isContract) found.add(`${network}:${a}`);
              return setValue(cacheKey('iscontract', network, a), { c: isContract });
            }),
          );
        } catch {
          // unknown: left out, so these moves stay ordinary sends/receipts
        }
      }
    }),
  );
  return found;
}
