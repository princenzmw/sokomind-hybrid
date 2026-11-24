import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Download, RotateCcw, Search, ShieldAlert } from 'lucide-react';
import { aggregateOpenCreditTabs } from '../lib/privacyFirewall';
import type { LedgerCategory, LedgerEntry, TelemetrySource } from '../lib/types';

interface LedgerTableProps {
  entries: LedgerEntry[];
  onSettleTab: (customerAlias: string, amountKes: number) => Promise<void>;
  onResetDemo: () => void;
  busy: boolean;
}

const FILTER_OPTIONS: Array<'All' | LedgerCategory> = [
  'All',
  'Credit Tab',
  'Sale',
  'Credit Repayment',
  'Wholesale Restock',
];

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

function escapeCsv(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export function LedgerTable({ entries, onSettleTab, onResetDemo, busy }: LedgerTableProps) {
  const [categoryFilter, setCategoryFilter] = useState<'All' | LedgerCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openTabs = useMemo(() => aggregateOpenCreditTabs(entries), [entries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (categoryFilter !== 'All' && entry.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        entry.customerAlias.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.sanitizedInput.toLowerCase().includes(q) ||
        entry.items.some((item) => item.name.toLowerCase().includes(q))
      );
    });
  }, [entries, categoryFilter, searchQuery]);

  function handleExportCsv() {
    const headers = [
      'id',
      'createdAt',
      'customerAlias',
      'category',
      'paymentMethod',
      'totalKes',
      'paidKes',
      'creditOwedKes',
      'estimatedMarginPct',
      'inferenceSource',
      'modelUsed',
      'latencyMs',
      'redactionCount',
      'sanitizedInput',
    ];
    const rows = entries.map((e) =>
      [
        e.id,
        e.createdAt,
        e.customerAlias,
        e.category,
        e.paymentMethod,
        e.totalKes,
        e.paidKes,
        e.creditOwedKes,
        e.estimatedMarginPct,
        e.inferenceSource,
        e.modelUsed ?? '',
        e.latencyMs,
        e.redactionCount,
        e.sanitizedInput,
      ]
        .map(escapeCsv)
        .join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sokomind-anonymized-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-5 py-3.5">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Structured Shop Ledger</h2>
          <p className="text-xs text-stone-500">
            Stored locally and synced as redacted records (raw PII never leaves device).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            <Download className="h-3.5 w-3.5 text-emerald-700" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={onResetDemo}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            <RotateCcw className="h-3.5 w-3.5 text-stone-500" />
            Reset Demo
          </button>
          <span className="font-mono text-xs text-stone-500">{filteredEntries.length} entries</span>
        </div>
      </div>

      {openTabs.length > 0 && (
        <div className="border-b border-stone-200 bg-amber-50/50 px-5 py-3">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
            <span>Open Credit Tabs (Madeni)</span>
            <span className="font-mono text-[11px] font-medium">
              {openTabs.length} active {openTabs.length === 1 ? 'account' : 'accounts'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {openTabs.map((tab) => (
              <div
                key={tab.customerAlias}
                className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs"
              >
                <span className="font-mono font-semibold text-stone-800">{tab.customerAlias}</span>
                <span className="font-mono font-bold text-amber-700">
                  KES {tab.openBalanceKes.toLocaleString()}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSettleTab(tab.customerAlias, tab.openBalanceKes)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded bg-emerald-800 px-2 py-0.5 text-[11px] font-medium text-white transition hover:bg-emerald-900 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Settle Tab
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 border-b border-stone-100 bg-stone-50/60 px-5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setCategoryFilter(opt)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                categoryFilter === opt
                  ? 'bg-emerald-800 text-white'
                  : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        <div className="relative sm:w-56">
          <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search alias or item..."
            className="w-full rounded-md border border-stone-200 bg-white py-1 pr-2.5 pl-8 text-xs text-stone-800 placeholder:text-stone-400 focus:border-emerald-700 focus:outline-none"
          />
        </div>
      </div>

      <div className="divide-y divide-stone-100">
        {filteredEntries.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-stone-500">
            No ledger entries match this filter.
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const expanded = expandedId === entry.id;
            return (
              <div key={entry.id} className="px-5 py-3.5 transition hover:bg-stone-50/70">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : entry.id)}
                        className="inline-flex cursor-pointer items-center gap-1 text-left text-sm font-semibold text-stone-900 hover:text-emerald-800"
                      >
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
                        )}
                        {entry.category}
                      </button>
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
                    <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium ${sourceBadge(entry.inferenceSource)}`}
                      >
                        {entry.inferenceSource}
                      </span>
                      {entry.modelUsed && (
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">
                          {entry.modelUsed}
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-stone-400">{entry.latencyMs}ms</span>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
                    <div className="text-[11px] font-semibold text-stone-700">Line Items</div>
                    <div className="mt-1.5 space-y-1">
                      {entry.items.map((item, idx) => (
                        <div
                          key={`${entry.id}-item-${idx}`}
                          className="flex items-center justify-between font-mono text-[11px] text-stone-600"
                        >
                          <span>
                            {item.quantity}x {item.name} ({item.unit})
                          </span>
                          <span>KES {item.lineTotalKes.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
