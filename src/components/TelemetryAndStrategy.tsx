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
  const totalSafe = Math.max(1, onDeviceRuns + cloudRuns + previewRuns);
  const onDevicePct = Math.round((onDeviceRuns / totalSafe) * 100);
  const cloudPct = Math.round((cloudRuns / totalSafe) * 100);
  const previewPct = Math.max(0, 100 - onDevicePct - cloudPct);

  return (
    <div className="space-y-5">
      <section className="rounded-xs border border-[#C5D0C4] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C5D0C4]/70 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#0F4C3A]" />
            <h2 className="font-display text-lg font-semibold text-[#10211A]">
              Hybrid Inference Telemetry
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={benchmarkBusy}
              onClick={onRunBenchmark}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xs border border-[#C5D0C4] bg-[#EEF1EC] px-2.5 py-1 text-xs font-medium text-[#10211A] transition hover:bg-[#dce4dc] disabled:opacity-50"
            >
              <Gauge className="h-3.5 w-3.5 text-[#0F4C3A]" />
              {benchmarkBusy ? 'Benchmarking...' : 'Run Benchmark'}
            </button>
            <span className="font-mono text-xs text-[#43554C]">Avg {avgLatency}ms</span>
          </div>
        </div>

        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-xs border border-[#C5D0C4] bg-[#EEF1EC]">
          {onDevicePct > 0 && <div className="bg-[#0F4C3A]" style={{ width: `${onDevicePct}%` }} />}
          {cloudPct > 0 && <div className="bg-[#1D4ED8]" style={{ width: `${cloudPct}%` }} />}
          {previewPct > 0 && <div className="bg-[#B45309]" style={{ width: `${previewPct}%` }} />}
        </div>

        <div className="mt-3 grid grid-cols-3 divide-x divide-[#C5D0C4] rounded-xs border border-[#C5D0C4] text-center">
          <div className="bg-[#EEF1EC]/45 px-2 py-2.5">
            <div className="font-mono text-lg font-bold text-[#0F4C3A]">{onDeviceRuns}</div>
            <div className="font-mono text-[11px] font-medium text-[#0F4C3A]">ON_DEVICE</div>
          </div>
          <div className="bg-[#EFF6FF]/60 px-2 py-2.5">
            <div className="font-mono text-lg font-bold text-[#1D4ED8]">{cloudRuns}</div>
            <div className="font-mono text-[11px] font-medium text-[#1D4ED8]">IN_CLOUD</div>
          </div>
          <div className="bg-[#FEF8EC] px-2 py-2.5">
            <div className="font-mono text-lg font-bold text-[#B45309]">{previewRuns}</div>
            <div className="font-mono text-[11px] font-medium text-[#B45309]">PREVIEW</div>
          </div>
        </div>

        {benchmarkResult && (
          <div className="mt-3 rounded-xs border border-[#C5D0C4] bg-[#EEF1EC]/45 p-3 text-xs">
            <div className="flex items-center justify-between font-semibold text-[#10211A]">
              <span>Side-by-Side Hybrid Latency</span>
              <span className="font-mono text-[11px] text-[#0F4C3A]">
                {benchmarkResult.redactedCount} PII masked
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="rounded-xs border border-[#0F4C3A]/35 bg-white p-2">
                <div className="text-[#43554C]">PREFER_ON_DEVICE</div>
                <div className="mt-0.5 font-bold text-[#0F4C3A]">
                  {benchmarkResult.onDeviceRun.inferenceSource} ({benchmarkResult.onDeviceRun.latencyMs}ms)
                </div>
                <div className="text-[10px] text-[#43554C]">{benchmarkResult.onDeviceRun.modelUsed}</div>
              </div>
              <div className="rounded-xs border border-[#1D4ED8]/35 bg-white p-2">
                <div className="text-[#43554C]">ONLY_IN_CLOUD</div>
                <div className="mt-0.5 font-bold text-[#1D4ED8]">
                  {benchmarkResult.cloudRun.inferenceSource} ({benchmarkResult.cloudRun.latencyMs}ms)
                </div>
                <div className="text-[10px] text-[#43554C]">{benchmarkResult.cloudRun.modelUsed}</div>
              </div>
            </div>
          </div>
        )}

        {telemetryLog.length > 0 && (
          <div className="mt-3 divide-y divide-[#C5D0C4]/60 border-t border-[#C5D0C4] pt-1">
            {telemetryLog.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 py-1.5 font-mono text-[11px] text-[#43554C]"
              >
                <span className="truncate">
                  {item.task} ({item.requestedMode}
                  {item.fallbackUsed ? ', fallback' : ''})
                </span>
                <span className="ml-2 shrink-0 text-[#10211A]">
                  {item.inferenceSource}
                  {item.modelUsed ? ` [${item.modelUsed}]` : ''} {item.latencyMs}ms
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xs border border-[#C5D0C4] border-t-2 border-t-[#1D4ED8] bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#1D4ED8]" />
            <h2 className="font-display text-lg font-semibold text-[#10211A]">
              Cloud Margin &amp; Restock Advisor
            </h2>
          </div>
          <button
            type="button"
            disabled={strategyBusy || entries.length === 0}
            onClick={onGenerateStrategy}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xs border border-[#0F4C3A] bg-[#0F4C3A] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0B3B2D] disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {strategyBusy ? 'Analyzing...' : 'Escalate to Cloud'}
          </button>
        </div>

        <p className="mt-1.5 text-xs text-[#43554C]">
          Sends anonymized SKU volumes and category totals to Cloud Gemini under Only Cloud mode.
        </p>

        {advice ? (
          <div className="mt-3 space-y-3 border-t border-[#C5D0C4] pt-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#10211A]">{advice.headline}</span>
              <span className="shrink-0 font-mono text-[11px] text-[#1D4ED8]">
                {advice.inferenceSource} ({advice.latencyMs}ms)
              </span>
            </div>

            <div>
              <div className="font-semibold text-[#10211A]">Restock Priorities</div>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[#43554C]">
                {advice.restockPriorities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <div className="font-semibold text-[#10211A]">Credit Collection Actions</div>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[#43554C]">
                {advice.creditRiskActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xs border border-[#C5D0C4] bg-[#EEF1EC]/50 p-2.5 text-[#10211A]">
              {advice.cashflowNote}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xs border border-dashed border-[#C5D0C4] bg-[#EEF1EC]/35 p-3 text-xs text-[#43554C]">
            Select Escalate to Cloud to compute anonymized restock priorities and credit collection actions.
          </div>
        )}

        <div className="mt-3 border-t border-[#C5D0C4] pt-2.5">
          <button
            type="button"
            onClick={() => setShowPayload((prev) => !prev)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[#43554C] hover:text-[#10211A]"
          >
            {showPayload ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Inspect Anonymized Cloud Payload
          </button>
          {showPayload && (
            <pre className="mt-2 max-h-56 overflow-auto rounded-xs border border-[#10211A] bg-[#10211A] p-3 font-mono text-[11px] text-[#EEF1EC]">
              {JSON.stringify(advice?.auditedPayload ?? summary, null, 2)}
            </pre>
          )}
        </div>
      </section>
    </div>
  );
}
