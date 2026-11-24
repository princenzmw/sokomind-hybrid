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
  HybridBenchmarkResult,
  InferenceTelemetry,
  LedgerCategory,
  LedgerEntry,
  LineItem,
  PaymentMethod,
  RoutingMode,
  StrategyAdvice,
  TelemetrySource,
} from './types';

const PRIMARY_CLOUD_MODEL = 'gemini-3.8-flash';
const FALLBACK_CLOUD_MODEL = 'gemini-3.5-flash-lite';

function isTransientCloudError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /(?:429|500|503|INTERNAL|UNAVAILABLE|high demand|overloaded|quota)/i.test(msg);
}

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

export async function warmupOnDeviceModel(onProgress?: (pct: number) => void): Promise<void> {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Firebase credentials are required before downloading Chrome Gemini Nano.');
  }
  const ai = getAiClient(services.app);
  const model = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE });
  await model.initializeDeviceModel((progressValue) => {
    const pct = Math.max(0, Math.min(100, Math.round(progressValue * 100)));
    onProgress?.(pct);
  });
}

export interface HybridNoteResult {
  entry: LedgerEntry;
  telemetry: InferenceTelemetry;
}

async function withCloudResilience<T>(
  requestedMode: RoutingMode,
  runner: (cloudModel: string) => Promise<T>,
): Promise<{ result: T; cloudModelUsed: string }> {
  try {
    const result = await runner(PRIMARY_CLOUD_MODEL);
    return { result, cloudModelUsed: PRIMARY_CLOUD_MODEL };
  } catch (err) {
    if (requestedMode !== 'ONLY_ON_DEVICE' && isTransientCloudError(err)) {
      const result = await runner(FALLBACK_CLOUD_MODEL);
      return { result, cloudModelUsed: FALLBACK_CLOUD_MODEL };
    }
    throw err;
  }
}

export async function parseShopNoteHybrid(
  rawInput: string,
  requestedMode: RoutingMode,
  options?: { offline?: boolean },
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
        modelUsed: 'local-deterministic',
        latencyMs: entry.latencyMs,
        redactedCount: entry.redactionCount,
        fallbackUsed: false,
        estimatedCloudTokensSaved: 260,
        note: 'Preview parser active (set VITE_FIREBASE_* keys for live Firebase AI Logic).',
      },
    };
  }

  if (options?.offline) {
    if (requestedMode === 'ONLY_IN_CLOUD' || requestedMode === 'PREFER_IN_CLOUD') {
      throw new Error(
        `Offline mode active: ${requestedMode} requires network connectivity unless switched to PREFER_ON_DEVICE or ONLY_ON_DEVICE.`,
      );
    }
    const nano = await detectOnDeviceNanoStatus();
    if (nano !== 'available') {
      const entry = buildPreviewLedgerEntry(rawInput, requestedMode);
      return {
        entry,
        telemetry: {
          id: `tel-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          timestamp: entry.createdAt,
          task: 'note_parse',
          requestedMode,
          inferenceSource: 'PREVIEW_LOCAL',
          modelUsed: 'local-deterministic',
          latencyMs: entry.latencyMs,
          redactedCount: entry.redactionCount,
          fallbackUsed: false,
          estimatedCloudTokensSaved: 260,
          note: 'Offline without Chrome Gemini Nano: parsed deterministically on device and queued for sync.',
        },
      };
    }
  }

  const started = performance.now();
  const { sanitizedText, redactions } = redactShopNote(rawInput);
  const ai = getAiClient(services.app);
  const effectiveMode = options?.offline ? 'ONLY_ON_DEVICE' : requestedMode;

  const { result, cloudModelUsed } = await withCloudResilience(effectiveMode, (cloudModel) => {
    const model = getGenerativeModel(ai, {
      mode: mapRoutingModeToSdk(effectiveMode),
      inCloudParams: {
        model: cloudModel,
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
    return model.generateContent(
      `Extract this Kenyan retail shop note into ledger JSON. PII tokens have already been masked.\nNote: ${sanitizedText}`,
    );
  });

  const latencyMs = Math.max(1, Math.round(performance.now() - started));
  const payload = extractJsonObject(result.response.text());
  const source = mapTelemetrySource(result.response.inferenceSource, effectiveMode);
  const modelUsed = source === 'ON_DEVICE' ? 'gemini-nano' : cloudModelUsed;

  const rawCategory = String(payload.category ?? 'Sale') as LedgerCategory;
  const category: LedgerCategory = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'Sale';
  const rawPayment = String(payload.paymentMethod ?? 'CASH') as PaymentMethod;
  const paymentMethod: PaymentMethod = VALID_PAYMENTS.has(rawPayment) ? rawPayment : 'CASH';

  const totalKes = Math.max(0, Number(payload.totalKes ?? 0) || 0);
  const paidKes = Math.max(0, Number(payload.paidKes ?? 0) || 0);
  const creditOwedKes = Math.max(0, Number(payload.creditOwedKes ?? Math.max(0, totalKes - paidKes)) || 0);
  const items = coerceLineItems(payload.items, totalKes);
  const fallbackUsed = effectiveMode === 'PREFER_ON_DEVICE' && source === 'IN_CLOUD';

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
    modelUsed,
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
      modelUsed,
      latencyMs,
      redactedCount: redactions.length,
      fallbackUsed,
      estimatedCloudTokensSaved: source === 'ON_DEVICE' ? 280 : 0,
      note: fallbackUsed
        ? `On-device model unavailable; completed via Cloud ${cloudModelUsed}.`
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
        modelUsed: 'local-deterministic',
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
  const { result, cloudModelUsed } = await withCloudResilience(requestedMode, (cloudModel) => {
    const model = getGenerativeModel(ai, {
      mode: mapRoutingModeToSdk(requestedMode),
      inCloudParams: {
        model: cloudModel,
        systemInstruction: NOTE_SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      },
    });
    return model.generateContent([
      'Extract items, total KES, paid KES, credit owed KES, and category from this retail receipt or handwritten notebook image.',
      { type: 'inlineData', inlineData: { data: base64Data, mimeType } },
    ]);
  });

  const latencyMs = Math.max(1, Math.round(performance.now() - started));
  const payload = extractJsonObject(result.response.text());
  const source = mapTelemetrySource(result.response.inferenceSource, requestedMode);
  const modelUsed = source === 'ON_DEVICE' ? 'gemini-nano' : cloudModelUsed;

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
    modelUsed,
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
      modelUsed,
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
        modelUsed: 'local-deterministic',
        latencyMs: advice.latencyMs,
        redactedCount: entries.reduce((sum, e) => sum + e.redactionCount, 0),
        fallbackUsed: false,
        estimatedCloudTokensSaved: 0,
        note: 'Preview strategy summary active (set VITE_FIREBASE_* keys for Cloud Gemini 3.8 Flash).',
      },
    };
  }

  const started = performance.now();
  const auditedPayload = buildAnonymizedLedgerSummary(entries);
  const ai = getAiClient(services.app);
  const { result, cloudModelUsed } = await withCloudResilience('ONLY_IN_CLOUD', (cloudModel) => {
    const model = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: cloudModel,
        systemInstruction: STRATEGY_SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      },
    });
    return model.generateContent(
      `Analyze this anonymized micro-retail daily ledger summary and provide concrete restock and credit-collection advice in JSON:\n${JSON.stringify(auditedPayload, null, 2)}`,
    );
  });

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
      modelUsed: cloudModelUsed,
      latencyMs,
      redactedCount: entries.reduce((sum, e) => sum + e.redactionCount, 0),
      fallbackUsed: false,
      estimatedCloudTokensSaved: 0,
    },
  };
}

export async function runHybridBenchmark(rawInput: string): Promise<HybridBenchmarkResult> {
  const { sanitizedText, redactions } = redactShopNote(rawInput);
  const onDevice = await parseShopNoteHybrid(rawInput, 'PREFER_ON_DEVICE');
  const cloud = await parseShopNoteHybrid(rawInput, 'ONLY_IN_CLOUD');

  return {
    note: rawInput,
    sanitizedNote: sanitizedText,
    redactedCount: redactions.length,
    onDeviceRun: onDevice.telemetry,
    cloudRun: cloud.telemetry,
  };
}
