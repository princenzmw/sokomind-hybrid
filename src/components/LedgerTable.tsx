import { ShieldAlert } from 'lucide-react';
import type { LedgerEntry, TelemetrySource } from '../lib/types';

interface LedgerTableProps {
  entries: LedgerEntry[];
}

function sourceBadge(source: TelemetrySource) {
  switch (source) {
    case 'ON_DEVICE':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'IN_CLOUD':
      return 'border-sky-200 bg-sky-50 text-sky-800';
    case 'PREVIEW_LOCAL':
      return 'border-amber-200 bg-amber-50 text-amber-800';
  }
}

export function LedgerTable({ entries }: LedgerTableProps) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white shadow-xs">
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Structured Shop Ledger</h2>
          <p className="text-xs text-stone-500">
            Stored locally with optional Firestore offline cache persistence.
          </p>
        </div>
        <span className="font-mono text-xs text-stone-500">{entries.length} entries</span>
      </div>

      <div className="divide-y divide-stone-100">
        {entries.map((entry) => (
          <div key={entry.id} className="px-5 py-3.5 transition hover:bg-stone-50/70">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-stone-900">{entry.category}</span>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-600">
                    {entry.customerAlias}
                  </span>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-600">
                    {entry.paymentMethod}
                  </span>
                  {entry.redactionCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] text-emerald-800">
                      <ShieldAlert className="h-3 w-3" />
                      {entry.redactionCount} PII masked
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-stone-700">{entry.summary}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-stone-400">
                  Sanitized: {entry.sanitizedInput}
                </p>
              </div>

              <div className="text-right">
                <div className="font-mono text-sm font-semibold text-stone-900">
                  KES {entry.totalKes.toLocaleString()}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-stone-500">
                  Paid {entry.paidKes.toLocaleString()}
                  {entry.creditOwedKes > 0 && (
                    <span className="ml-1.5 font-semibold text-amber-700">
                      · Tab {entry.creditOwedKes.toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-end gap-1.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium ${sourceBadge(entry.inferenceSource)}`}
                  >
                    {entry.inferenceSource}
                  </span>
                  <span className="font-mono text-[10px] text-stone-400">{entry.latencyMs}ms</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
