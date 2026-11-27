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
    <header className="border-b border-[#C5D0C4] bg-white">
      <div className="ledger-rule-top w-full" />
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xs border border-[#0F4C3A] bg-[#0F4C3A] font-display text-base font-bold tracking-tight text-white">
              SM
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold leading-none tracking-tight text-[#10211A]">
                SokoMind
              </h1>
              <p className="mt-1 text-xs text-[#43554C]">
                Hybrid AI retail ledger for East African shops
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span
              className={`inline-flex items-center gap-1.5 rounded-xs border px-2.5 py-1 ${
                isLive && firebaseStatus.appCheckStatus !== 'error'
                  ? 'border-[#0F4C3A]/35 bg-[#EEF1EC] text-[#0F4C3A]'
                  : 'border-[#B45309]/40 bg-[#FEF8EC] text-[#B45309]'
              }`}
              title={firebaseStatus.appCheckDetail}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {isLive
                ? `App Check: ${firebaseStatus.appCheckStatus === 'debug_token' ? 'Debug Ready' : firebaseStatus.appCheckStatus === 'active' ? 'Active' : 'Missing Key'}`
                : 'Preview Mode (Local Parser)'}
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-xs border border-[#C5D0C4] bg-[#EEF1EC]/60 px-2.5 py-1 text-[#10211A]">
              <Database className="h-3.5 w-3.5 text-[#0F4C3A]" />
              {syncLabel(syncState)}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-xs border px-2.5 py-1 ${
                nanoStatus === 'available'
                  ? 'border-[#0F4C3A]/35 bg-[#EEF1EC] text-[#0F4C3A]'
                  : 'border-[#C5D0C4] bg-white text-[#43554C]'
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
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xs border border-[#0F4C3A] bg-[#EEF1EC] px-2.5 py-1 text-[#0F4C3A] transition hover:bg-[#dce4dc] disabled:cursor-wait disabled:opacity-75"
              >
                {nanoDownloadPct !== null ? `Downloading Nano (${nanoDownloadPct}%)` : 'Download Nano'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowNanoGuide((prev) => !prev)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xs border border-[#C5D0C4] bg-white px-2.5 py-1 text-[#10211A] transition hover:bg-[#EEF1EC]"
            >
              <HelpCircle className="h-3.5 w-3.5 text-[#0F4C3A]" />
              Nano Setup
            </button>

            <button
              type="button"
              onClick={onToggleOffline}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xs border px-2.5 py-1 transition ${
                effectiveOffline
                  ? 'border-[#B45309] bg-[#FEF8EC] text-[#B45309]'
                  : 'border-[#C5D0C4] bg-white text-[#10211A] hover:bg-[#EEF1EC]'
              }`}
            >
              {effectiveOffline ? (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  {browserOffline ? 'Browser Offline' : 'Simulated Offline'}
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5 text-[#0F4C3A]" />
                  Online
                </>
              )}
            </button>
          </div>
        </div>

        {showNanoGuide && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-xs border border-[#C5D0C4] bg-[#EEF1EC]/65 p-3 text-xs text-[#10211A]">
            <div className="space-y-1">
              <div className="font-semibold">
                Enable Chrome On-Device Gemini Nano (Optional Local Runtime)
              </div>
              <p>
                1. Open{' '}
                <code className="rounded-xs bg-white px-1 py-0.5 font-mono text-[11px] border border-[#C5D0C4]">
                  chrome://flags/#optimization-guide-on-device-model
                </code>{' '}
                and set it to <strong>Enabled BypassPerfRequirement</strong>.
              </p>
              <p>
                2. Open{' '}
                <code className="rounded-xs bg-white px-1 py-0.5 font-mono text-[11px] border border-[#C5D0C4]">
                  chrome://flags/#prompt-api-for-gemini-nano
                </code>{' '}
                and set it to <strong>Enabled</strong>, then relaunch Chrome.
              </p>
              <p className="text-[#43554C]">
                When Gemini Nano is unavailable, SokoMind falls back to Cloud Gemini 3.8 Flash online or deterministic local parsing offline.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNanoGuide(false)}
              className="cursor-pointer rounded-xs p-1 text-[#43554C] hover:bg-white"
              aria-label="Close Nano setup guide"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 border-t border-[#C5D0C4]/80 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#43554C]">
            <Globe className="h-3.5 w-3.5 text-[#0F4C3A]" />
            <span>Firebase AI Logic Inference mode:</span>
          </div>
          <div className="inline-grid grid-cols-2 divide-x divide-[#C5D0C4] overflow-hidden rounded-xs border border-[#C5D0C4] bg-[#EEF1EC]/40 sm:flex">
            {MODE_OPTIONS.map((opt) => {
              const selected = opt.value === routingMode;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChangeMode(opt.value)}
                  title={opt.hint}
                  className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition ${
                    selected
                      ? 'bg-[#0F4C3A] text-white'
                      : 'bg-white text-[#10211A] hover:bg-[#EEF1EC]'
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
