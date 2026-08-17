import { BASE_PATH } from '@/lib/basePath';
import type { CostBasisMethod } from '@/lib/accounting/types';

export default function CsvExportButton({ method }: { method: CostBasisMethod }) {
  return (
    <a
      href={`${BASE_PATH}/api/gains/export?method=${method}`}
      className="rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent"
    >
      Export CSV
    </a>
  );
}
