import { useRef, useState } from 'react';
import { Camera, Lock, Send, Sparkles } from 'lucide-react';
import { redactShopNote } from '../lib/privacyFirewall';
import { SAMPLE_PRESETS } from '../lib/sampleData';
import type { RoutingMode } from '../lib/types';

interface QuickEntryPanelProps {
  routingMode: RoutingMode;
  busy: boolean;
  onSubmitNote: (rawText: string) => Promise<void>;
  onUploadReceipt: (base64: string, mimeType: string) => Promise<void>;
}

export function QuickEntryPanel({
  routingMode,
  busy,
  onSubmitNote,
  onUploadReceipt,
}: QuickEntryPanelProps) {
  const [noteText, setNoteText] = useState(SAMPLE_PRESETS[0].text);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewRedaction = redactShopNote(noteText);
  const isStrictLocal = routingMode === 'ONLY_ON_DEVICE';

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim() || busy) return;
    await onSubmitNote(noteText.trim());
    setNoteText('');
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result ?? '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      if (base64) {
        await onUploadReceipt(base64, file.type || 'image/jpeg');
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Quick Shop Note &amp; Receipt Capture</h2>
          <p className="text-xs text-stone-500">
            Enter Swahili, Sheng, or English daily sales, customer credit tabs, or wholesale stock notes.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-1 font-mono text-[11px] text-stone-700">
          <Lock className="h-3 w-3 text-emerald-700" />
          {isStrictLocal ? 'Strict On-Device Only' : 'PII Firewall Active'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SAMPLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setNoteText(preset.text)}
            className="cursor-pointer rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-stone-700 transition hover:border-emerald-700 hover:bg-emerald-50/40"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleFormSubmit} className="mt-3 space-y-3">
        <textarea
          rows={3}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Example: Mama Njeri 0712 345 678 took 2x unga KES 350, paid KES 200 cash, deni KES 150"
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-700 focus:outline-none"
        />

        {noteText.trim() && (
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs">
            <div className="flex items-center justify-between font-medium text-stone-700">
              <span>Live On-Device PII Firewall Preview</span>
              <span className="font-mono text-[11px] text-emerald-800">
                {previewRedaction.redactions.length} masked before any cloud fallback
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-stone-600">
              {previewRedaction.sanitizedText}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5 text-emerald-700" />
              Scan Supplier Receipt (JPEG/PNG)
            </button>
          </div>

          <button
            type="submit"
            disabled={busy || !noteText.trim()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Sparkles className="h-3.5 w-3.5 animate-pulse" /> : <Send className="h-3.5 w-3.5" />}
            {busy ? 'Routing Inference...' : 'Record Ledger Entry'}
          </button>
        </div>
      </form>
    </section>
  );
}
