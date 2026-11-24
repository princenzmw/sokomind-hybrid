import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { LedgerTable } from './components/LedgerTable';
import { QuickEntryPanel } from './components/QuickEntryPanel';
import { StatusHeader } from './components/StatusHeader';
import { TelemetryAndStrategy } from './components/TelemetryAndStrategy';
import {
  detectOnDeviceNanoStatus,
  generateMarginStrategyCloud,
  parseShopNoteHybrid,
  runHybridBenchmark,
  scanSupplierReceiptHybrid,
  warmupOnDeviceModel,
} from './lib/firebaseAi';
import { getFirebaseConfigStatus, getFirebaseServices } from './lib/firebaseClient';
import {
  LEDGER_STORAGE_KEY,
  loadLedgerEntries,
  loadLocalEntries,
  persistLedgerEntry,
  saveLocalEntries,
} from './lib/ledgerStore';
import { INITIAL_LEDGER_ENTRIES } from './lib/sampleData';
import type {
  HybridBenchmarkResult,
  InferenceTelemetry,
  LedgerEntry,
  RoutingMode,
  StrategyAdvice,
  SyncState,
} from './lib/types';

export function App() {
  const [entries, setEntries] = useState<LedgerEntry[]>(() => loadLocalEntries(INITIAL_LEDGER_ENTRIES));
  const [telemetryLog, setTelemetryLog] = useState<InferenceTelemetry[]>(() => [
    {
      id: 'seed-tel-1',
      timestamp: new Date().toISOString(),
      task: 'note_parse',
      requestedMode: 'PREFER_ON_DEVICE',
      inferenceSource: 'ON_DEVICE',
      modelUsed: 'gemini-nano',
      latencyMs: 128,
      redactedCount: 2,
      fallbackUsed: false,
      estimatedCloudTokensSaved: 280,
    },
  ]);
  const [routingMode, setRoutingMode] = useState<RoutingMode>('PREFER_ON_DEVICE');
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [browserOffline, setBrowserOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [syncState, setSyncState] = useState<SyncState>('local_only');
  const [nanoStatus, setNanoStatus] = useState<'available' | 'downloadable' | 'unavailable'>('unavailable');
  const [nanoDownloadPct, setNanoDownloadPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [strategyBusy, setStrategyBusy] = useState(false);
  const [benchmarkBusy, setBenchmarkBusy] = useState(false);
  const [advice, setAdvice] = useState<StrategyAdvice | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<HybridBenchmarkResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showSetupBanner, setShowSetupBanner] = useState(true);

  const firebaseStatus = getFirebaseConfigStatus();
  const effectiveOffline = simulatedOffline || browserOffline;

  useEffect(() => {
    getFirebaseServices();
    detectOnDeviceNanoStatus().then(setNanoStatus);
    loadLedgerEntries(INITIAL_LEDGER_ENTRIES).then(({ entries: loaded, syncState: nextSync }) => {
      setEntries(loaded);
      setSyncState(nextSync);
    });

    const handleOnline = () => setBrowserOffline(false);
    const handleOffline = () => setBrowserOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    saveLocalEntries(entries);
  }, [entries]);

  async function recordNewEntry(entry: LedgerEntry, telemetry: InferenceTelemetry) {
    setEntries((prev) => [entry, ...prev]);
    setTelemetryLog((prev) => [telemetry, ...prev]);
    const nextSync = await persistLedgerEntry(entry);
    setSyncState(nextSync);
  }

  async function handleSubmitNote(rawText: string) {
    setErrorMsg(null);
    setBusy(true);
    try {
      const { entry, telemetry } = await parseShopNoteHybrid(rawText, routingMode, {
        offline: effectiveOffline,
      });
      await recordNewEntry(entry, telemetry);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process shop note.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadReceipt(base64: string, mimeType: string) {
    setErrorMsg(null);
    setBusy(true);
    try {
      if (effectiveOffline && routingMode !== 'ONLY_ON_DEVICE') {
        throw new Error('Cannot escalate receipt image while offline.');
      }
      const { entry, telemetry } = await scanSupplierReceiptHybrid(base64, mimeType, routingMode);
      await recordNewEntry(entry, telemetry);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to scan supplier receipt.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSettleTab(customerAlias: string, amountKes: number) {
    const note = `${customerAlias} settled credit tab KES ${amountKes} via M-PESA`;
    await handleSubmitNote(note);
  }

  async function handleGenerateStrategy() {
    setErrorMsg(null);
    setStrategyBusy(true);
    try {
      if (effectiveOffline && firebaseStatus.configured) {
        throw new Error('Cloud Margin Advisor requires network connectivity (`ONLY_IN_CLOUD`).');
      }
      const { advice: nextAdvice, telemetry } = await generateMarginStrategyCloud(entries);
      setAdvice(nextAdvice);
      setTelemetryLog((prev) => [telemetry, ...prev]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate cloud strategy advice.');
    } finally {
      setStrategyBusy(false);
    }
  }

  async function handleRunBenchmark() {
    setErrorMsg(null);
    setBenchmarkBusy(true);
    try {
      if (effectiveOffline && firebaseStatus.configured) {
        throw new Error('Hybrid latency benchmark requires network connectivity for Cloud comparison.');
      }
      const sample = 'Mama Njeri 0712 345 678 took 2x unga ya ugali KES 350, paid KES 200 cash, deni KES 150';
      const result = await runHybridBenchmark(sample);
      setBenchmarkResult(result);
      setTelemetryLog((prev) => [result.cloudRun, result.onDeviceRun, ...prev]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to complete hybrid benchmark.');
    } finally {
      setBenchmarkBusy(false);
    }
  }

  function handleResetDemo() {
    try {
      localStorage.removeItem(LEDGER_STORAGE_KEY);
    } catch {
      // Ignore storage restrictions cleanly.
    }
    setEntries(INITIAL_LEDGER_ENTRIES);
    setAdvice(null);
    setBenchmarkResult(null);
    setErrorMsg(null);
  }

  async function handleDownloadNano() {
    setErrorMsg(null);
    setNanoDownloadPct(0);
    try {
      await warmupOnDeviceModel((pct) => setNanoDownloadPct(pct));
      const nextStatus = await detectOnDeviceNanoStatus();
      setNanoStatus(nextStatus);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to download Chrome Gemini Nano.');
    } finally {
      setNanoDownloadPct(null);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <StatusHeader
        firebaseStatus={firebaseStatus}
        nanoStatus={nanoStatus}
        nanoDownloadPct={nanoDownloadPct}
        onDownloadNano={handleDownloadNano}
        syncState={syncState}
        simulatedOffline={simulatedOffline}
        browserOffline={browserOffline}
        onToggleOffline={() => setSimulatedOffline((prev) => !prev)}
        routingMode={routingMode}
        onChangeMode={setRoutingMode}
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {!firebaseStatus.configured && showSetupBanner && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <span className="font-semibold">Local Preview Mode active.</span> Add your{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">VITE_FIREBASE_*</code> and App Check values from{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">.env.example</code> to{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">.env</code> to run live Chrome Gemini Nano + Cloud Gemini hybrid inference via Firebase AI Logic.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSetupBanner(false)}
              className="cursor-pointer rounded p-0.5 text-amber-700 hover:bg-amber-100"
              aria-label="Dismiss setup notice"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="cursor-pointer rounded p-0.5 text-red-700 hover:bg-red-100"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-7">
            <QuickEntryPanel
              routingMode={routingMode}
              busy={busy}
              onSubmitNote={handleSubmitNote}
              onUploadReceipt={handleUploadReceipt}
            />
            <LedgerTable
              entries={entries}
              onSettleTab={handleSettleTab}
              onResetDemo={handleResetDemo}
              busy={busy}
            />
          </div>

          <div className="lg:col-span-5">
            <TelemetryAndStrategy
              entries={entries}
              telemetryLog={telemetryLog}
              advice={advice}
              strategyBusy={strategyBusy}
              benchmarkBusy={benchmarkBusy}
              benchmarkResult={benchmarkResult}
              onGenerateStrategy={handleGenerateStrategy}
              onRunBenchmark={handleRunBenchmark}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
