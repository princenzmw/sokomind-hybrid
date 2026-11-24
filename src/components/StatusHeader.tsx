import { Cpu, Globe, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import type { FirebaseConfigStatus, RoutingMode } from '../lib/types';

interface StatusHeaderProps {
  firebaseStatus: FirebaseConfigStatus;
  nanoStatus: 'available' | 'downloadable' | 'unavailable';
  simulatedOffline: boolean;
  onToggleOffline: () => void;
  routingMode: RoutingMode;
  onChangeMode: (mode: RoutingMode) => void;
}

const MODE_OPTIONS: Array<{ value: RoutingMode; label: string; hint: string }> = [
  { value: 'PREFER_ON_DEVICE', label: 'Prefer On-Device', hint: 'Gemini Nano first, cloud fallback' },
  { value: 'ONLY_ON_DEVICE', label: 'Only On-Device', hint: 'Strict local execution' },
  { value: 'PREFER_IN_CLOUD', label: 'Prefer Cloud', hint: 'Gemini 2.5 Flash first, local fallback' },
  { value: 'ONLY_IN_CLOUD', label: 'Only Cloud', hint: 'Cloud Gemini via Firebase AI Logic' },
];

export function StatusHeader({
  firebaseStatus,
  nanoStatus,
  simulatedOffline,
  onToggleOffline,
  routingMode,
  onChangeMode,
}: StatusHeaderProps) {
  const isLive = firebaseStatus.configured;

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
                ? `App Check: ${firebaseStatus.appCheckStatus === 'debug_token' ? 'Debug Token' : firebaseStatus.appCheckStatus === 'active' ? 'Active' : 'Missing Key'}`
                : 'Preview Mode (Local Parser)'}
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

            <button
              type="button"
              onClick={onToggleOffline}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
                simulatedOffline
                  ? 'border-amber-300 bg-amber-100 text-amber-900'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              {simulatedOffline ? (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  Simulated Offline
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
