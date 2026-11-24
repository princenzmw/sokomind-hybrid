import { useEffect, useRef, useState } from 'react';
import { Camera, FileSpreadsheet, Lock, Mic, MicOff, Send, Sparkles } from 'lucide-react';
import { redactShopNote } from '../lib/privacyFirewall';
import { generateSampleSupplierReceipt } from '../lib/receiptGenerator';
import { SAMPLE_PRESETS } from '../lib/sampleData';
import type { PrivacyRedaction, RoutingMode } from '../lib/types';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function redactionChipStyle(kind: PrivacyRedaction['kind']): string {
  switch (kind) {
    case 'PHONE':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800';
    case 'MPESA_CODE':
      return 'border-sky-300 bg-sky-50 text-sky-800';
    case 'CUSTOMER_NAME':
      return 'border-amber-300 bg-amber-50 text-amber-900';
    case 'NATIONAL_ID':
      return 'border-rose-300 bg-rose-50 text-rose-800';
    case 'EMAIL':
      return 'border-violet-300 bg-violet-50 text-violet-800';
  }
}

interface QuickEntryPanelProps {
  routingMode: RoutingMode;
  busy: boolean;
  onSubmitNote: (rawText: string) => Promise<void>;
  onUploadReceipt: (base64: string, mimeType: string, previewDataUrl?: string) => Promise<void>;
}

export function QuickEntryPanel({
  routingMode,
  busy,
  onSubmitNote,
  onUploadReceipt,
}: QuickEntryPanelProps) {
  const [noteText, setNoteText] = useState(SAMPLE_PRESETS[0].text);
  const [listening, setListening] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const previewRedaction = redactShopNote(noteText);
  const isStrictLocal = routingMode === 'ONLY_ON_DEVICE';
  const speechSupported = getSpeechRecognitionCtor() !== null;

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function handleToggleDictation() {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'en-KE';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i += 1) {
        const chunk = event.results[i]?.[0]?.transcript?.trim();
        if (chunk) parts.push(chunk);
      }
      if (parts.length > 0) {
        const spoken = parts.join(' ');
        setNoteText((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

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
        setReceiptPreview(dataUrl);
        await onUploadReceipt(base64, file.type || 'image/jpeg', dataUrl);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSampleReceiptScan() {
    if (busy) return;
    const sample = generateSampleSupplierReceipt();
    setReceiptPreview(sample.dataUrl);
    await onUploadReceipt(sample.base64, sample.mimeType, sample.dataUrl);
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
            <div className="flex flex-wrap items-center justify-between gap-2 font-medium text-stone-700">
              <span>Live On-Device PII Firewall Preview</span>
              <span className="font-mono text-[11px] text-emerald-800">
                {previewRedaction.redactions.length} masked before any cloud fallback
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-stone-600">
              {previewRedaction.sanitizedText}
            </p>
            {previewRedaction.redactions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {previewRedaction.redactions.map((item, idx) => (
                  <span
                    key={`${item.kind}-${idx}`}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium ${redactionChipStyle(item.kind)}`}
                  >
                    {item.kind} -&gt; {item.masked}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
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
              Scan Receipt (JPEG/PNG)
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={handleSampleReceiptScan}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50/70 px-3 py-2 text-xs font-medium text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
              Try Sample Receipt
            </button>

            {speechSupported && (
              <button
                type="button"
                disabled={busy}
                onClick={handleToggleDictation}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                  listening
                    ? 'border-red-300 bg-red-50 text-red-800'
                    : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5 text-emerald-700" />}
                {listening ? 'Stop Mic' : 'Dictate Note'}
              </button>
            )}
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

        {receiptPreview && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 p-2.5 text-xs">
            <div className="flex items-center gap-2.5">
              <img
                src={receiptPreview}
                alt="Scanned wholesale supplier receipt"
                className="h-14 w-12 rounded border border-stone-300 object-cover"
              />
              <div>
                <div className="font-medium text-stone-800">Last Scanned Supplier Receipt</div>
                <div className="text-[11px] text-stone-500">
                  Sent directly as inline PNG/JPEG multimodal input when scanning.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReceiptPreview(null)}
              className="cursor-pointer rounded px-2 py-1 text-[11px] text-stone-500 hover:bg-stone-200"
            >
              Hide
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
