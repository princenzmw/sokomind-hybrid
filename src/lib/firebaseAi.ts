import { type FirebaseApp } from 'firebase/app';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  type AI,
  type InferenceMode as SdkInferenceMode,
  type InferenceSource as SdkInferenceSource,
} from 'firebase/ai';
import { getFirebaseServices } from './firebaseClient';
import { buildPreviewLedgerEntry, buildPreviewStrategyAdvice } from './localFallbackParser';
import {
  buildAnonymizedLedgerSummary,
  deriveCustomerAlias,
  redactShopNote,
} from './privacyFirewall';
import type {
  InferenceTelemetry,
  LedgerCategory,
  LedgerEntry,
  LineItem,
  PaymentMethod,
  RoutingMode,
  StrategyAdvice,
  TelemetrySource,
} from './types';

const CLOUD_MODEL = 'gemini-2.5-flash';

const NOTE_SYSTEM_PROMPT = `You extract East African micro-retail shop notes (English, Swahili, and Sheng) into strict JSON.
Return a single JSON object matching this shape:
{
  "category": "Sale" | "Credit Tab" | "Credit Repayment" | "Wholesale Restock" | "Shop Expense",
  "paymentMethod": "CASH" | "MPESA" | "CREDIT" | "MIXED" | "SUPPLIER_EXPENSE",
  "items": [{"name": string, "quantity": number, "unit": string, "unitPriceKes": number, "lineTotalKes": number}],
  "totalKes": number,
  "paidKes": number,
  "creditOwedKes": number,
  "estimatedMarginPct": number,
  "summary": string
}
Respond with valid JSON only.`;

const STRATEGY_SYSTEM_PROMPT = `You advise East African micro-retail owners using anonymized daily sales aggregates in KES.
Never ask for customer names or phone numbers.
Return valid JSON matching this shape:
{
  "headline": string,
  "restockPriorities": string[],
  "creditRiskActions": string[],
  "cashflowNote": string
}`;

let cachedAi: AI | null = null;

function getAiClient(app: FirebaseApp): AI {
  if (!cachedAi) {
    cachedAi = getAI(app, { backend: new GoogleAIBackend() });
  }
  return cachedAi;
}

export function mapRoutingModeToSdk(mode: RoutingMode): SdkInferenceMode {
  switch (mode) {
    case 'PREFER_ON_DEVICE':
      return InferenceMode.PREFER_ON_DEVICE;
    case 'ONLY_ON_DEVICE':
      return InferenceMode.ONLY_ON_DEVICE;
    case 'PREFER_IN_CLOUD':
      return InferenceMode.PREFER_IN_CLOUD;
    case 'ONLY_IN_CLOUD':
      return InferenceMode.ONLY_IN_CLOUD;
  }
}

export function mapTelemetrySource(
  source: SdkInferenceSource | undefined,
  requestedMode: RoutingMode,
): TelemetrySource {
  if (source === InferenceSource.ON_DEVICE) {
    return 'ON_DEVICE';
  }
  if (source === InferenceSource.IN_CLOUD) {
    return 'IN_CLOUD';
  }
  return requestedMode === 'ONLY_IN_CLOUD' ? 'IN_CLOUD' : 'ON_DEVICE';
}

export function extractJsonObject(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonSlice = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  const parsed: unknown = JSON.parse(jsonSlice);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Model did not return a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

const VALID_CATEGORIES = new Set<LedgerCategory>([
  'Sale',
  'Credit Tab',
  'Credit Repayment',
  'Wholesale Restock',
  'Shop Expense',
]);

const VALID_PAYMENTS = new Set<PaymentMethod>([
  'CASH',
  'MPESA',
  'CREDIT',
  'MIXED',
  'SUPPLIER_EXPENSE',
]);

function coerceLineItems(rawItems: unknown, fallbackTotal: number): LineItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [
      {
        name: 'Retail Item',
        quantity: 1,
        unit: 'lot',
        unitPriceKes: fallbackTotal,
        lineTotalKes: fallbackTotal,
      },
    ];
  }

  return rawItems.map((item) => {
    const rec = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const quantity = Math.max(1, Number(rec.quantity ?? 1) || 1);
    const unitPriceKes = Math.max(0, Number(rec.unitPriceKes ?? 0) || 0);
    const lineTotalKes = Math.max(0, Number(rec.lineTotalKes ?? quantity * unitPriceKes) || 0);
    return {
      name: String(rec.name ?? 'Retail Item'),
      quantity,
      unit: String(rec.unit ?? 'pcs'),
      unitPriceKes,
      lineTotalKes,
    };
  });
}

export async function detectOnDeviceNanoStatus(): Promise<'available' | 'downloadable' | 'unavailable'> {
  if (typeof globalThis === 'undefined') {
    return 'unavailable';
  }
  const win = globalThis as {
    LanguageModel?: { availability?: () => Promise<string> };
    ai?: { languageModel?: { capabilities?: () => Promise<{ available?: string }> } };
  };

  try {
    if (win.LanguageModel?.availability) {
      const state = await win.LanguageModel.availability();
      if (state === 'available' || state === 'readily') return 'available';
      if (state === 'downloadable' || state === 'downloading' || state === 'after-download') {
        return 'downloadable';
      }
    }
    if (win.ai?.languageModel?.capabilities) {
      const caps = await win.ai.languageModel.capabilities();
      if (caps.available === 'readily') return 'available';
      if (caps.available === 'after-download') return 'downloadable';
    }
  } catch {
    return 'unavailable';
  }
  return 'unavailable';
}

export interface HybridNoteResult {
  entry: LedgerEntry;
  telemetry: InferenceTelemetry;
}

export async function parseShopNoteHybrid(
  rawInput: string,
  requestedMode: RoutingMode,
): Promise<HybridNoteResult> {
  const services = getFirebaseServices();
  if (!services) {
    const entry = buildPreviewLedgerEntry(rawInput, requestedMode);
    return {
      entry,
      telemetry: {
        id: `tel-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        timestamp: entry.createdAt,
        task: 'note_parse',
        requestedMode,
        inferenceSource: 'PREVIEW_LOCAL',
        latencyMs: entry.latencyMs,
        redactedCount: entry.redactionCount,
        fallbackUsed: false,
        estimatedCloudTokensSaved: 260,
        note: 'Preview parser active (set VITE_FIREBASE_* keys for live Firebase AI Logic).',
      },
    };
  }

  const started = performance.now();
  const { sanitizedText, redactions } = redactShopNote(rawInput);
  const ai = getAiClient(services.app);
  const model = getGenerativeModel(ai, {
    mode: mapRoutingModeToSdk(requestedMode),
    inCloudParams: {
      model: CLOUD_MODEL,
      systemInstruction: NOTE_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    },
    onDeviceParams: {
      createOptions: {
        initialPrompts: [
          { role: 'system', content: [{ type: 'text', value: NOTE_SYSTEM_PROMPT }] },
        ],
      },
    },
  });

  const result = await model.generateContent(
    `Extract this Kenyan retail shop note into ledger JSON. PII tokens have already been masked.\nNote: ${sanitizedText}`,
  );
  const latencyMs = Math.max(1, Math.round(performance.now() - started));
  const payload = extractJsonObject(result.response.text());
  const source = mapTelemetrySource(result.response.inferenceSource, requestedMode);

  const rawCategory = String(payload.category ?? 'Sale') as LedgerCategory;
  const category: LedgerCategory = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'Sale';
  const rawPayment = String(payload.paymentMethod ?? 'CASH') as PaymentMethod;
  const paymentMethod: PaymentMethod = VALID_PAYMENTS.has(rawPayment) ? rawPayment : 'CASH';

  const totalKes = Math.max(0, Number(payload.totalKes ?? 0) || 0);
  const paidKes = Math.max(0, Number(payload.paidKes ?? 0) || 0);
  const creditOwedKes = Math.max(0, Number(payload.creditOwedKes ?? Math.max(0, totalKes - paidKes)) || 0);
  const items = coerceLineItems(payload.items, totalKes);
  const fallbackUsed =
    requestedMode === 'PREFER_ON_DEVICE' && source === 'IN_CLOUD';

  const entry: LedgerEntry = {
    id: `entry-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    rawInput,
    sanitizedInput: sanitizedText,
    redactionCount: redactions.length,
    customerAlias: deriveCustomerAlias(rawInput),
    category,
    paymentMethod,
    items,
    totalKes,
    paidKes,
    creditOwedKes,
    estimatedMarginPct: Math.max(0, Math.min(80, Number(payload.estimatedMarginPct ?? 20) || 0)),
    summary: String(payload.summary ?? `${category}: KES ${totalKes.toLocaleString()}`),
    inferenceSource: source,
    requestedMode,
    latencyMs,
  };

  return {
    entry,
    telemetry: {
      id: `tel-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      timestamp: entry.createdAt,
      task: 'note_parse',
      requestedMode,
      inferenceSource: source,
      latencyMs,
      redactedCount: redactions.length,
      fallbackUsed,
      estimatedCloudTokensSaved: source === 'ON_DEVICE' ? 280 : 0,
      note: fallbackUsed
        ? 'On-device model unavailable or fell back; completed via Cloud Gemini.'
        : undefined,
    },
  };
}

export async function scanSupplierReceiptHybrid(
  base64Data: string,
  mimeType: string,
  requestedMode: RoutingMode,
): Promise<HybridNoteResult> {
  const services = getFirebaseServices();
  if (!services) {
    const sampleNote =
      'Wholesale restock from supplier Nairobi Traders: 6x Pembe Maize Flour 2kg and 4x Cooking Oil 1L total KES 2,290';
    const entry = buildPreviewLedgerEntry(sampleNote, requestedMode);
    return {
      entry,
      telemetry: {
        id: `tel-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        timestamp: entry.createdAt,
        task: 'receipt_scan',
        requestedMode,
        inferenceSource: 'PREVIEW_LOCAL',
        latencyMs: entry.latencyMs,
        redactedCount: entry.redactionCount,
        fallbackUsed: false,
        estimatedCloudTokensSaved: 0,
        note: 'Multimodal preview sample generated because live Firebase keys are not configured.',
      },
    };
  }

  const started = performance.now();
  const ai = getAiClient(services.app);
  const model = getGenerativeModel(ai, {
    mode: mapRoutingModeToSdk(requestedMode),
    inCloudParams: {
      model: CLOUD_MODEL,
      systemInstruction: NOTE_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    },
  });

  const result = await model.generateContent([
    'Extract items, total KES, paid KES, credit owed KES, and category from this retail receipt or handwritten notebook image.',
    { type: 'inlineData', inlineData: { data: base64Data, mimeType } },
  ]);
  const latencyMs = Math.max(1, Math.round(performance.now() - started));
  const payload = extractJsonObject(result.response.text());
  const source = mapTelemetrySource(result.response.inferenceSource, requestedMode);

  const totalKes = Math.max(0, Number(payload.totalKes ?? 0) || 0);
  const paidKes = Math.max(0, Number(payload.paidKes ?? 0) || 0);
  const creditOwedKes = Math.max(0, Number(payload.creditOwedKes ?? 0) || 0);
  const items = coerceLineItems(payload.items, totalKes);
  const rawCategory = String(payload.category ?? 'Wholesale Restock') as LedgerCategory;
  const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'Wholesale Restock';
  const rawPayment = String(payload.paymentMethod ?? 'SUPPLIER_EXPENSE') as PaymentMethod;
  const paymentMethod = VALID_PAYMENTS.has(rawPayment) ? rawPayment : 'SUPPLIER_EXPENSE';

  const entry: LedgerEntry = {
    id: `entry-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    rawInput: `[Receipt image: ${mimeType}]`,
    sanitizedInput: `[Multimodal receipt scan: ${mimeType}]`,
    redactionCount: 0,
    customerAlias: 'Supplier Invoice',
    category,
    paymentMethod,
    items,
    totalKes,
    paidKes,
    creditOwedKes,
    estimatedMarginPct: category === 'Wholesale Restock' ? 0 : 20,
    summary: String(payload.summary ?? `Receipt Scan: KES ${totalKes.toLocaleString()}`),
    inferenceSource: source,
    requestedMode,
    latencyMs,
  };

  return {
    entry,
    telemetry: {
      id: `tel-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      timestamp: entry.createdAt,
      task: 'receipt_scan',
      requestedMode,
      inferenceSource: source,
      latencyMs,
      redactedCount: 0,
      fallbackUsed: requestedMode === 'PREFER_ON_DEVICE' && source === 'IN_CLOUD',
      estimatedCloudTokensSaved: source === 'ON_DEVICE' ? 420 : 0,
    },
  };
}

export interface StrategyResult {
  advice: StrategyAdvice;
  telemetry: InferenceTelemetry;
}

export async function generateMarginStrategyCloud(entries: LedgerEntry[]): Promise<StrategyResult> {
  const services = getFirebaseServices();
  if (!services) {
    const advice = buildPreviewStrategyAdvice(entries);
    return {
      advice,
      telemetry: {
        id: `tel-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        timestamp: advice.generatedAt,
        task: 'margin_strategy',
        requestedMode: 'ONLY_IN_CLOUD',
        inferenceSource: 'PREVIEW_LOCAL',
        latencyMs: advice.latencyMs,
        redactedCount: entries.reduce((sum, e) => sum + e.redactionCount, 0),
        fallbackUsed: false,
        estimatedCloudTokensSaved: 0,
        note: 'Preview strategy summary active (set VITE_FIREBASE_* keys for Cloud Gemini 2.5 Flash).',
      },
    };
  }

  const started = performance.now();
  const auditedPayload = buildAnonymizedLedgerSummary(entries);
  const ai = getAiClient(services.app);
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: CLOUD_MODEL,
      systemInstruction: STRATEGY_SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    },
  });

  const result = await model.generateContent(
    `Analyze this anonymized micro-retail daily ledger summary and provide concrete restock and credit-collection advice in JSON:\n${JSON.stringify(auditedPayload, null, 2)}`,
  );
  const latencyMs = Math.max(1, Math.round(performance.now() - started));
  const payload = extractJsonObject(result.response.text());
  const source = mapTelemetrySource(result.response.inferenceSource, 'ONLY_IN_CLOUD');

  const advice: StrategyAdvice = {
    generatedAt: new Date().toISOString(),
    inferenceSource: source,
    latencyMs,
    headline: String(payload.headline ?? 'Daily cashflow and restock summary generated.'),
    restockPriorities: Array.isArray(payload.restockPriorities)
      ? payload.restockPriorities.map(String)
      : ['Restock top-selling staple items first.'],
    creditRiskActions: Array.isArray(payload.creditRiskActions)
      ? payload.creditRiskActions.map(String)
      : ['Review open customer tabs before extending new credit.'],
    cashflowNote: String(payload.cashflowNote ?? 'Keep M-PESA settlement records aligned daily.'),
    auditedPayload,
  };

  return {
    advice,
    telemetry: {
      id: `tel-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      timestamp: advice.generatedAt,
      task: 'margin_strategy',
      requestedMode: 'ONLY_IN_CLOUD',
      inferenceSource: source,
      latencyMs,
      redactedCount: entries.reduce((sum, e) => sum + e.redactionCount, 0),
      fallbackUsed: false,
      estimatedCloudTokensSaved: 0,
    },
  };
}
