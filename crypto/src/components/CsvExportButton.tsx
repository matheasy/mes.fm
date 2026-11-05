import { taxesQuery } from '@/hooks/useTaxes';
import { BASE_PATH } from '@/lib/basePath';
import type { Section } from '@/lib/sections';

export default function CsvExportButton({ year, section }: { year?: number; section?: Section }) {
  return (
    <a
      href={`${BASE_PATH}/api/taxes/export${taxesQuery(year, section)}`}
      className="rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent"
    >
      Export CSV
    </a>
  );
}
