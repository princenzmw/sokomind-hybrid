import { useState } from 'react';
import { Cpu, Database, Globe, HelpCircle, ShieldCheck, Wifi, WifiOff, X } from 'lucide-react';
import type { FirebaseConfigStatus, RoutingMode, SyncState } from '../lib/types';

interface StatusHeaderProps {
  firebaseStatus: FirebaseConfigStatus;
  nanoStatus: 'available' | 'downloadable' | 'unavailable';
  nanoDownloadPct: number | null;
  onDownloadNano?: () => void;
  syncState: SyncState;
  simulatedOffline: boolean;
  browserOffline: boolean;
  onToggleOffline: () => void;
  routingMode: RoutingMode;
  onChangeMode: (mode: RoutingMode) => void;
}

const MODE_OPTIONS: Array<{ value: RoutingMode; label: string; hint: string }> = [
  { value: 'PREFER_ON_DEVICE', label: 'Prefer On-Device', hint: 'Chrome Nano first, Cloud fallback' },
  { value: 'ONLY_ON_DEVICE', label: 'Only On-Device', hint: 'Strict local execution' },
  { value: 'PREFER_IN_CLOUD', label: 'Prefer Cloud', hint: 'Cloud Gemini first, Nano fallback' },
  { value: 'ONLY_IN_CLOUD', label: 'Only Cloud', hint: 'Cloud Gemini 3.8 Flash only' },
];

function syncLabel(syncState: SyncState): string {
  switch (syncState) {
    case 'firestore_synced':
      return 'Firestore Synced';
    case 'offline_cached':
      return 'Offline Cache';
    case 'local_only':
      return 'Local Cache';
  }
}

export function StatusHeader({
  firebaseStatus,
  nanoStatus,
  nanoDownloadPct,
  onDownloadNano,
  syncState,
  simulatedOffline,
  browserOffline,
  onToggleOffline,
  routingMode,
  onChangeMode,
}: StatusHeaderProps) {
  const [showNanoGuide, setShowNanoGuide] = useState(false);
  const isLive = firebaseStatus.configured;
  const effectiveOffline = simulatedOffline || browserOffline;

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-800 text-sm font-bold text-white">
                SM
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-stone-900">SokoMind</h1>
                <p className="text-xs text-stone-500">
                  Privacy-First Hybrid AI Retail Ledger &amp; Margin Copilot
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                isLive && firebaseStatus.appCheckStatus !== 'error'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
              title={firebaseStatus.appCheckDetail}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {isLive
                ? `App Check: ${firebaseStatus.appCheckStatus === 'debug_token' ? 'Debug Ready' : firebaseStatus.appCheckStatus === 'active' ? 'Active' : 'Missing Key'}`
                : 'Preview Mode (Local Parser)'}
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-stone-700">
              <Database className="h-3.5 w-3.5 text-emerald-700" />
              {syncLabel(syncState)}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                nanoStatus === 'available'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-stone-200 bg-stone-100 text-stone-700'
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              Chrome Nano: {nanoStatus}
            </span>

            {isLive && nanoStatus === 'downloadable' && onDownloadNano && (
              <button
                type="button"
                onClick={onDownloadNano}
                disabled={nanoDownloadPct !== null}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-75"
              >
                {nanoDownloadPct !== null ? `Downloading Nano (${nanoDownloadPct}%)` : 'Download Nano'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowNanoGuide((prev) => !prev)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-stone-700 transition hover:bg-stone-50"
            >
              <HelpCircle className="h-3.5 w-3.5 text-emerald-700" />
              Nano Setup
            </button>

            <button
              type="button"
              onClick={onToggleOffline}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
                effectiveOffline
                  ? 'border-amber-300 bg-amber-100 text-amber-900'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              {effectiveOffline ? (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  {browserOffline ? 'Browser Offline' : 'Simulated Offline'}
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-700" />
                  Online
                </>
              )}
            </button>
          </div>
        </div>

        {showNanoGuide && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700">
            <div className="space-y-1">
              <div className="font-semibold text-stone-900">
                Enable Chrome On-Device Gemini Nano (Optional Local Runtime)
              </div>
              <p>
                1. Open <code className="rounded bg-stone-200 px-1 font-mono">chrome://flags/#optimization-guide-on-device-model</code> and set it to <strong>Enabled BypassPerfRequirement</strong>.
              </p>
              <p>
                2. Open <code className="rounded bg-stone-200 px-1 font-mono">chrome://flags/#prompt-api-for-gemini-nano</code> and set it to <strong>Enabled</strong>, then relaunch Chrome.
              </p>
              <p className="text-stone-500">
                When Gemini Nano is unavailable, SokoMind automatically falls back to Cloud Gemini 3.8 Flash online or deterministic local parsing when offline.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNanoGuide(false)}
              className="cursor-pointer rounded p-0.5 text-stone-500 hover:bg-stone-200"
              aria-label="Close Nano setup guide"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 border-t border-stone-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-stone-600">
            <Globe className="h-3.5 w-3.5 text-emerald-700" />
            <span>Firebase AI Logic `InferenceMode`:</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
            {MODE_OPTIONS.map((opt) => {
              const selected = opt.value === routingMode;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChangeMode(opt.value)}
                  title={opt.hint}
                  className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                    selected
                      ? 'border-emerald-800 bg-emerald-800 text-white'
                      : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300 hover:bg-stone-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
