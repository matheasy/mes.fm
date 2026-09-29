import { cacheKey, getValues, setValue } from '../cache';

/** Keyless public RPCs per EVM network the tax report sees (first that answers wins) */
const RPCS: Record<string, string[]> = {
  bsc: ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com', 'https://bsc.drpc.org'],
  ethereum: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://eth.llamarpc.com'],
  // polygon-rpc.com stopped answering (403, 2026-09) - publicnode + drpc
  polygon: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'],
  arbitrum: ['https://arbitrum-one-rpc.publicnode.com', 'https://arbitrum.drpc.org', 'https://arb1.arbitrum.io/rpc'],
};

export const EVM_NETWORKS = new Set(Object.keys(RPCS));

/** eth_getCode for each address, trying each RPC (and a second round after a pause) until every one has
 * an answer - a batch can come back partly rate-limited. Throws if some stay unanswered. */
async function getCodes(network: string, addresses: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  let lastError: unknown = new Error(`No RPC answered for ${network}`);
  const urls = RPCS[network] ?? [];
  for (let attempt = 0; attempt < 2 * urls.length && out.size < addresses.length; attempt++) {
    if (attempt === urls.length) await new Promise((r) => setTimeout(r, 2000));
    const todo = addresses.filter((a) => !out.has(a));
    const url = urls[attempt % urls.length]!;
    try {
      const body = todo.map((a, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_getCode', params: [a, 'latest'] }));
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      const json = (await res.json()) as { id: number; result?: string }[];
      if (!Array.isArray(json)) throw new Error(`${url}: unexpected reply`);
      for (const r of json) if (typeof r.result === 'string' && todo[r.id]) out.set(todo[r.id]!, r.result !== '0x' && r.result.length > 2);
    } catch (err) {
      lastError = err;
    }
  }
  if (out.size < addresses.length) throw lastError instanceof Error ? lastError : new Error(`No RPC answered for ${network}`);
  return out;
}

/**
 * Which of these (network, address) pairs are smart contracts (have code), as `network:address`.
 * Answers are cached for good - an address doesn't stop being a contract. An address whose check
 * fails is left out (treated as not a contract: its moves stay sales/purchases) and its network is
 * listed in `failed`, so the report can say its round trips are missing rather than silently change.
 */
export async function contractsAmong(pairs: { network: string; address: string }[]): Promise<{ found: Set<string>; failed: string[] }> {
  const unique = [...new Map(pairs.filter((p) => EVM_NETWORKS.has(p.network)).map((p) => [`${p.network}:${p.address.toLowerCase()}`, p])).values()];
  const keys = unique.map((p) => cacheKey('iscontract', p.network, p.address.toLowerCase()));
  const cachedAnswers = await getValues<{ c: boolean }>(keys);

  const found = new Set<string>();
  const failed = new Set<string>();
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
      for (let i = 0; i < addresses.length; i += 20) {
        const chunk = addresses.slice(i, i + 20);
        try {
          const codes = await getCodes(network, chunk);
          await Promise.all(
            [...codes.entries()].map(([a, isContract]) => {
              if (isContract) found.add(`${network}:${a}`);
              return setValue(cacheKey('iscontract', network, a), { c: isContract });
            }),
          );
        } catch {
          // unknown: left out, so these moves stay ordinary sends/receipts - and the report says so
          failed.add(network);
        }
      }
    }),
  );
  return { found, failed: [...failed] };
}
