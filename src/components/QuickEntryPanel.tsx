import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, FileSpreadsheet, Lock, Mic, MicOff, Send, ShieldCheck, Sparkles } from 'lucide-react';
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
      return 'border-[#0F4C3A]/35 bg-[#EEF1EC] text-[#0F4C3A]';
    case 'MPESA_CODE':
      return 'border-[#1D4ED8]/35 bg-[#EFF6FF] text-[#1D4ED8]';
    case 'CUSTOMER_NAME':
      return 'border-[#B45309]/40 bg-[#FEF8EC] text-[#B45309]';
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
    <section className="rounded-xs border border-[#C5D0C4] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#C5D0C4]/70 pb-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#10211A]">
            Counter Note &amp; Receipt Intake
          </h2>
          <p className="mt-0.5 text-xs text-[#43554C]">
            Enter Swahili, Sheng, or English sales, customer credit tabs, or wholesale stock notes.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-xs border border-[#C5D0C4] bg-[#EEF1EC] px-2.5 py-1 font-mono text-[11px] font-medium text-[#0F4C3A]">
          <Lock className="h-3 w-3" />
          {isStrictLocal ? 'Strict On-Device Only' : 'PII Firewall Active'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SAMPLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setNoteText(preset.text)}
            className="cursor-pointer rounded-xs border border-[#C5D0C4] bg-[#EEF1EC]/55 px-2.5 py-1 text-xs font-medium text-[#10211A] transition hover:border-[#0F4C3A] hover:bg-[#EEF1EC]"
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
          className="w-full rounded-xs border border-[#C5D0C4] bg-white px-3 py-2 text-sm text-[#10211A] placeholder:text-[#708278] focus:border-[#0F4C3A] focus:outline-none"
        />

        {noteText.trim() && (
          <div className="rounded-xs border border-[#C5D0C4] bg-[#EEF1EC]/50 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#C5D0C4] bg-white px-3 py-2 font-medium text-[#10211A]">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#0F4C3A]" />
                Live On-Device PII Firewall Gate
              </span>
              <span className="font-mono text-[11px] text-[#0F4C3A]">
                {previewRedaction.redactions.length} masked before model prompt
              </span>
            </div>

            <div className="grid grid-cols-1 divide-y divide-[#C5D0C4] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="p-3">
                <div className="text-[11px] font-semibold text-[#43554C]">Raw Counter Note</div>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-[#43554C]">
                  {noteText.trim()}
                </p>
              </div>
              <div className="bg-white p-3">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-[#0F4C3A]">
                  <ArrowRight className="h-3 w-3" />
                  Scrubbed Wire Prompt
                </div>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-[#10211A]">
                  {previewRedaction.sanitizedText}
                </p>
              </div>
            </div>

            {previewRedaction.redactions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-[#C5D0C4] bg-white px-3 py-2">
                {previewRedaction.redactions.map((item, idx) => (
                  <span
                    key={`${item.kind}-${idx}`}
                    className={`rounded-xs border px-1.5 py-0.5 font-mono text-[10px] font-medium ${redactionChipStyle(item.kind)}`}
                  >
                    {item.kind} -&gt; {item.masked}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
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
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xs border border-[#C5D0C4] bg-white px-3 py-2 text-xs font-medium text-[#10211A] transition hover:bg-[#EEF1EC] disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5 text-[#0F4C3A]" />
              Scan Receipt (JPEG/PNG)
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={handleSampleReceiptScan}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xs border border-[#0F4C3A]/40 bg-[#EEF1EC] px-3 py-2 text-xs font-medium text-[#0F4C3A] transition hover:bg-[#dce4dc] disabled:opacity-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-[#0F4C3A]" />
              Try Sample Receipt
            </button>

            {speechSupported && (
              <button
                type="button"
                disabled={busy}
                onClick={handleToggleDictation}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xs border px-3 py-2 text-xs font-medium transition ${
                  listening
                    ? 'border-red-400 bg-red-50 text-red-800'
                    : 'border-[#C5D0C4] bg-white text-[#10211A] hover:bg-[#EEF1EC]'
                }`}
              >
                {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5 text-[#0F4C3A]" />}
                {listening ? 'Stop Mic' : 'Dictate Note'}
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={busy || !noteText.trim()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xs bg-[#0F4C3A] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#0B3B2D] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Sparkles className="h-3.5 w-3.5 animate-pulse" /> : <Send className="h-3.5 w-3.5" />}
            {busy ? 'Routing Inference...' : 'Record Ledger Entry'}
          </button>
        </div>

        {receiptPreview && (
          <div className="flex items-center justify-between gap-3 rounded-xs border border-[#C5D0C4] bg-[#EEF1EC]/55 p-2.5 text-xs">
            <div className="flex items-center gap-2.5">
              <img
                src={receiptPreview}
                alt="Scanned wholesale supplier receipt"
                className="h-14 w-12 rounded-xs border border-[#C5D0C4] object-cover"
              />
              <div>
                <div className="font-medium text-[#10211A]">Last Scanned Supplier Receipt</div>
                <div className="text-[11px] text-[#43554C]">
                  Sent as inline PNG/JPEG multimodal input during scanning.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReceiptPreview(null)}
              className="cursor-pointer rounded-xs px-2 py-1 text-[11px] text-[#43554C] hover:bg-white"
            >
              Hide
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
