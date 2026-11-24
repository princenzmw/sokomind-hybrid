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
  scanSupplierReceiptHybrid,
} from './lib/firebaseAi';
import { getFirebaseConfigStatus, getFirebaseServices } from './lib/firebaseClient';
import { INITIAL_LEDGER_ENTRIES } from './lib/sampleData';
import type {
  InferenceTelemetry,
  LedgerEntry,
  RoutingMode,
  StrategyAdvice,
} from './lib/types';

const STORAGE_KEY = 'sokomind.ledger.v1';

function loadInitialEntries(): LedgerEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as LedgerEntry[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage corruption and fall back to seeded entries.
  }
  return INITIAL_LEDGER_ENTRIES;
}

export function App() {
  const [entries, setEntries] = useState<LedgerEntry[]>(loadInitialEntries);
  const [telemetryLog, setTelemetryLog] = useState<InferenceTelemetry[]>(() => [
    {
      id: 'seed-tel-1',
      timestamp: new Date().toISOString(),
      task: 'note_parse',
      requestedMode: 'PREFER_ON_DEVICE',
      inferenceSource: 'ON_DEVICE',
      latencyMs: 128,
      redactedCount: 2,
      fallbackUsed: false,
      estimatedCloudTokensSaved: 280,
    },
  ]);
  const [routingMode, setRoutingMode] = useState<RoutingMode>('PREFER_ON_DEVICE');
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [nanoStatus, setNanoStatus] = useState<'available' | 'downloadable' | 'unavailable'>('unavailable');
  const [busy, setBusy] = useState(false);
  const [strategyBusy, setStrategyBusy] = useState(false);
  const [advice, setAdvice] = useState<StrategyAdvice | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showSetupBanner, setShowSetupBanner] = useState(true);

  const firebaseStatus = getFirebaseConfigStatus();

  useEffect(() => {
    getFirebaseServices();
    detectOnDeviceNanoStatus().then(setNanoStatus);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Ignore quota errors cleanly.
    }
  }, [entries]);

  async function handleSubmitNote(rawText: string) {
    setErrorMsg(null);
    setBusy(true);
    try {
      if (simulatedOffline && (routingMode === 'ONLY_IN_CLOUD' || routingMode === 'PREFER_IN_CLOUD')) {
        throw new Error(
          `Network offline simulation is enabled: ${routingMode} requires network connectivity unless switched to PREFER_ON_DEVICE or ONLY_ON_DEVICE.`,
        );
      }
      const { entry, telemetry } = await parseShopNoteHybrid(rawText, routingMode);
      setEntries((prev) => [entry, ...prev]);
      setTelemetryLog((prev) => [telemetry, ...prev]);
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
      if (simulatedOffline && routingMode === 'ONLY_IN_CLOUD') {
        throw new Error('Cannot escalate receipt image while offline simulation is enabled.');
      }
      const { entry, telemetry } = await scanSupplierReceiptHybrid(base64, mimeType, routingMode);
      setEntries((prev) => [entry, ...prev]);
      setTelemetryLog((prev) => [telemetry, ...prev]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to scan supplier receipt.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateStrategy() {
    setErrorMsg(null);
    setStrategyBusy(true);
    try {
      if (simulatedOffline && firebaseStatus.configured) {
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

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <StatusHeader
        firebaseStatus={firebaseStatus}
        nanoStatus={nanoStatus}
        simulatedOffline={simulatedOffline}
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
            <LedgerTable entries={entries} />
          </div>

          <div className="lg:col-span-5">
            <TelemetryAndStrategy
              entries={entries}
              telemetryLog={telemetryLog}
              advice={advice}
              strategyBusy={strategyBusy}
              onGenerateStrategy={handleGenerateStrategy}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
