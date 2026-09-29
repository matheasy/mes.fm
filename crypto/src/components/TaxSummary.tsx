import type { TaxYearSummary } from '@/lib/types';

export function money(value: number, currency: 'USD' | 'CAD'): string {
  return value.toLocaleString('en-CA', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' });
}

/** The tax year's totals across every wallet - the figures Schedule 3 asks for - plus a per-asset split */
export default function TaxSummary({ summary, currency }: { summary: TaxYearSummary; currency: 'USD' | 'CAD' }) {
  const cad = currency === 'CAD';
  const proceeds = cad ? summary.proceedsCad : summary.proceedsUsd;
  const cost = cad ? summary.costCad : summary.costUsd;
  const gain = cad ? summary.gainCad : summary.gainUsd;

  const cards = [
    { label: `Proceeds ${summary.year}`, value: money(proceeds, currency), cls: '' },
    { label: 'Adjusted cost base (ACB)', value: money(cost, currency), cls: '' },
    { label: gain >= 0 ? 'Net capital gain' : 'Net capital loss', value: money(gain, currency), cls: gain >= 0 ? 'text-gain' : 'text-loss' },
    { label: 'Dispositions', value: String(summary.count), cls: '' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="panel">
            <p className="stat-label">{c.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {summary.byAsset.length > 0 && (
        <div className="panel overflow-x-auto">
          <p className="stat-label mb-2">By asset, {summary.year} (CAD)</p>
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Dispositions</th>
                <th>Proceeds</th>
                <th>ACB</th>
                <th>Gain / loss</th>
              </tr>
            </thead>
            <tbody>
              {summary.byAsset.map((a) => (
                <tr key={a.asset}>
                  <td className="font-medium text-gray-100">{a.asset}</td>
                  <td>{a.count}</td>
                  <td>{money(a.proceedsCad, 'CAD')}</td>
                  <td>{money(a.costCad, 'CAD')}</td>
                  <td className={a.gainCad >= 0 ? 'text-gain' : 'text-loss'}>{money(a.gainCad, 'CAD')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
