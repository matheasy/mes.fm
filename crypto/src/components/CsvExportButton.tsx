import { taxesQuery } from '@/hooks/useTaxes';
import { BASE_PATH } from '@/lib/basePath';
import type { WalletKey } from '@/lib/wallets';

export default function CsvExportButton({ year, wallet }: { year?: number; wallet?: WalletKey }) {
  return (
    <a
      href={`${BASE_PATH}/api/taxes/export${taxesQuery(year, wallet)}`}
      className="rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent"
    >
      Export CSV
    </a>
  );
}
