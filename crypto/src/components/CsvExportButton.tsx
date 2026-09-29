import { BASE_PATH } from '@/lib/basePath';
import type { CostBasisMethod } from '@/lib/accounting/types';
import type { WalletKey } from '@/lib/wallets';

export default function CsvExportButton({ method, wallet }: { method: CostBasisMethod; wallet?: WalletKey }) {
  const qs = wallet ? `&wallet=${wallet}` : '';
  return (
    <a
      href={`${BASE_PATH}/api/taxes/export?method=${method}${qs}`}
      className="rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent"
    >
      Export CSV
    </a>
  );
}
