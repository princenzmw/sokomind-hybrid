import { useState } from 'react';
import { Activity, BarChart3, ChevronDown, ChevronUp, Gauge, Sparkles } from 'lucide-react';
import { buildAnonymizedLedgerSummary } from '../lib/privacyFirewall';
import type { HybridBenchmarkResult, InferenceTelemetry, LedgerEntry, StrategyAdvice } from '../lib/types';

interface TelemetryAndStrategyProps {
  entries: LedgerEntry[];
  telemetryLog: InferenceTelemetry[];
  advice: StrategyAdvice | null;
  strategyBusy: boolean;
  benchmarkBusy: boolean;
  benchmarkResult: HybridBenchmarkResult | null;
  onGenerateStrategy: () => Promise<void>;
  onRunBenchmark: () => Promise<void>;
}

export function TelemetryAndStrategy({
  entries,
  telemetryLog,
  advice,
  strategyBusy,
  benchmarkBusy,
  benchmarkResult,
  onGenerateStrategy,
  onRunBenchmark,
}: TelemetryAndStrategyProps) {
  const [showPayload, setShowPayload] = useState(false);

  const summary = buildAnonymizedLedgerSummary(entries);
  const totalTelemetry = telemetryLog.length;
  const onDeviceRuns = telemetryLog.filter((t) => t.inferenceSource === 'ON_DEVICE').length;
  const cloudRuns = telemetryLog.filter((t) => t.inferenceSource === 'IN_CLOUD').length;
  const previewRuns = telemetryLog.filter((t) => t.inferenceSource === 'PREVIEW_LOCAL').length;
  const avgLatency =
    totalTelemetry > 0
      ? Math.round(telemetryLog.reduce((sum, t) => sum + t.latencyMs, 0) / totalTelemetry)
      : 0;
  const tokensSaved = telemetryLog.reduce((sum, t) => sum + t.estimatedCloudTokensSaved, 0);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-stone-500">Cash Collected</div>
          <div className="mt-1 font-mono text-xl font-bold text-stone-900">
            KES {summary.totalCashCollectedKes.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-stone-500">Open Credit Tabs</div>
          <div className="mt-1 font-mono text-xl font-bold text-amber-700">
            KES {summary.totalCreditOutstandingKes.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-stone-500">Weighted Margin</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-800">
            {summary.weightedMarginPct}%
          </div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-medium text-stone-500">Tokens Kept Local</div>
          <div className="mt-1 font-mono text-xl font-bold text-stone-900">
            {tokensSaved.toLocaleString()}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-700" />
            <h2 className="text-base font-semibold text-stone-900">Hybrid Inference Telemetry</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={benchmarkBusy}
              onClick={onRunBenchmark}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
            >
              <Gauge className="h-3.5 w-3.5 text-emerald-700" />
              {benchmarkBusy ? 'Benchmarking...' : 'Run Benchmark'}
            </button>
            <span className="font-mono text-xs text-stone-500">Avg {avgLatency}ms</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-2 py-2">
            <div className="font-mono text-lg font-bold text-emerald-800">{onDeviceRuns}</div>
            <div className="text-[11px] font-medium text-emerald-700">ON_DEVICE</div>
          </div>
          <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-2 py-2">
            <div className="font-mono text-lg font-bold text-sky-800">{cloudRuns}</div>
            <div className="text-[11px] font-medium text-sky-700">IN_CLOUD</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-2 py-2">
            <div className="font-mono text-lg font-bold text-amber-800">{previewRuns}</div>
            <div className="text-[11px] font-medium text-amber-700">PREVIEW</div>
          </div>
        </div>

        {benchmarkResult && (
          <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs">
            <div className="flex items-center justify-between font-semibold text-stone-800">
              <span>Side-by-Side Hybrid Latency</span>
              <span className="font-mono text-[11px] text-emerald-800">
                {benchmarkResult.redactedCount} PII masked
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="rounded border border-emerald-200 bg-white p-2">
                <div className="text-stone-500">PREFER_ON_DEVICE</div>
                <div className="mt-0.5 font-bold text-emerald-800">
                  {benchmarkResult.onDeviceRun.inferenceSource} · {benchmarkResult.onDeviceRun.latencyMs}ms
                </div>
                <div className="text-[10px] text-stone-500">{benchmarkResult.onDeviceRun.modelUsed}</div>
              </div>
              <div className="rounded border border-sky-200 bg-white p-2">
                <div className="text-stone-500">ONLY_IN_CLOUD</div>
                <div className="mt-0.5 font-bold text-sky-800">
                  {benchmarkResult.cloudRun.inferenceSource} · {benchmarkResult.cloudRun.latencyMs}ms
                </div>
                <div className="text-[10px] text-stone-500">{benchmarkResult.cloudRun.modelUsed}</div>
              </div>
            </div>
          </div>
        )}

        {telemetryLog.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-stone-100 pt-3">
            {telemetryLog.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 font-mono text-[11px] text-stone-600"
              >
                <span className="truncate">
                  {item.task} · {item.requestedMode}
                  {item.fallbackUsed ? ' (fallback)' : ''}
                </span>
                <span className="ml-2 shrink-0 text-stone-900">
                  {item.inferenceSource}
                  {item.modelUsed ? ` (${item.modelUsed})` : ''} · {item.latencyMs}ms
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-700" />
            <h2 className="text-base font-semibold text-stone-900">Cloud Margin &amp; Restock Advisor</h2>
          </div>
          <button
            type="button"
            disabled={strategyBusy || entries.length === 0}
            onClick={onGenerateStrategy}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-900 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {strategyBusy ? 'Analyzing...' : 'Escalate to Cloud'}
          </button>
        </div>

        <p className="mt-1.5 text-xs text-stone-500">
          Sends only anonymized SKU volumes and category totals to Cloud Gemini (`ONLY_IN_CLOUD`).
        </p>

        {advice ? (
          <div className="mt-3 space-y-3 border-t border-stone-100 pt-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-stone-900">{advice.headline}</span>
              <span className="shrink-0 font-mono text-[11px] text-stone-500">
                {advice.inferenceSource} · {advice.latencyMs}ms
              </span>
            </div>

            <div>
              <div className="font-semibold text-stone-700">Restock Priorities</div>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-stone-600">
                {advice.restockPriorities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <div className="font-semibold text-stone-700">Credit Collection Actions</div>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-stone-600">
                {advice.creditRiskActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg bg-stone-50 p-2.5 text-stone-600">{advice.cashflowNote}</div>
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-stone-200 bg-stone-50 p-3 text-xs text-stone-500">
            Click &ldquo;Escalate to Cloud&rdquo; to compute anonymized restock priorities and credit collection advice.
          </div>
        )}

        <div className="mt-3 border-t border-stone-100 pt-2.5">
          <button
            type="button"
            onClick={() => setShowPayload((prev) => !prev)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900"
          >
            {showPayload ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Inspect Anonymized Cloud Payload
          </button>
          {showPayload && (
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-stone-900 p-3 font-mono text-[11px] text-stone-100">
              {JSON.stringify(advice?.auditedPayload ?? summary, null, 2)}
            </pre>
          )}
        </div>
      </section>
    </div>
  );
}
