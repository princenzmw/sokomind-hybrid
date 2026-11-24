import { buildAnonymizedLedgerSummary, deriveCustomerAlias, redactShopNote } from './privacyFirewall';
import type {
  LedgerCategory,
  LedgerEntry,
  LineItem,
  PaymentMethod,
  RoutingMode,
  StrategyAdvice,
} from './types';

interface ParsedDraft {
  category: LedgerCategory;
  paymentMethod: PaymentMethod;
  items: LineItem[];
  totalKes: number;
  paidKes: number;
  creditOwedKes: number;
  estimatedMarginPct: number;
  summary: string;
}

const KNOWN_SKUS: Array<{ pattern: RegExp; label: string; unit: string; defaultPrice: number }> = [
  { pattern: /unga(?:\s+ya\s+ugali)?|maize\s+flour|pembe/i, label: 'Pembe Maize Flour 2kg', unit: 'pack', defaultPrice: 175 },
  { pattern: /mafuta(?:\s+ya\s+kupika)?|cooking\s+oil|fresh\s*fri/i, label: 'Cooking Oil 1L', unit: 'bottle', defaultPrice: 310 },
  { pattern: /sukari|sugar/i, label: 'Kabras Sugar 1kg', unit: 'pack', defaultPrice: 165 },
  { pattern: /maziwa|milk|brookside/i, label: 'Fresh Milk 500ml', unit: 'pkt', defaultPrice: 65 },
  { pattern: /mkate|bread/i, label: 'Broadways Bread 400g', unit: 'loaf', defaultPrice: 65 },
  { pattern: /sabuni|soap|omo|geisha/i, label: 'Omo Washing Powder 500g', unit: 'pack', defaultPrice: 190 },
  { pattern: /mchele|rice|basmati/i, label: 'Basmati Rice 1kg', unit: 'kg', defaultPrice: 230 },
  { pattern: /majani|tea/i, label: 'Ketepa Tea Bags 50s', unit: 'box', defaultPrice: 140 },
];

export function parseShopNoteLocally(rawText: string): ParsedDraft {
  const lower = rawText.toLowerCase();
  const isRestock = /\b(restock|wholesale|supplier|carton|bale|bought stock|delivered)\b/i.test(lower);
  const isRepayment = /\b(repaid|paid tab|settled deni|cleared debt|alilipa deni)\b/i.test(lower);
  const hasMpesa = /\b(mpesa|m-pesa|till|paybill)\b/i.test(lower) || /\b[A-Z]{2,3}\d[A-Z0-9]{6,7}\b/.test(rawText);

  const kesMatches = Array.from(rawText.matchAll(/(?:kes|ksh)\s*([0-9,]+(?:\.\d+)?)/gi)).map((m) =>
    Number(m[1].replaceAll(',', '')),
  );
  const creditMatch = rawText.match(/(?:deni|credit|tab|balance|owes)\s*(?:kes|ksh)?\s*([0-9,]+(?:\.\d+)?)/i);
  const paidMatch = rawText.match(/(?:paid|lipa|cash|mpesa|received)\s*(?:kes|ksh)?\s*([0-9,]+(?:\.\d+)?)/i);

  const items: LineItem[] = [];
  for (const sku of KNOWN_SKUS) {
    if (sku.pattern.test(rawText)) {
      const qtyMatch = rawText.match(new RegExp(`(\\d+)\\s*(?:x|pcs|pack|pkts|kg|bales)?\\s*(?:${sku.pattern.source})`, 'i'));
      const quantity = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : 1;
      items.push({
        name: sku.label,
        quantity,
        unit: sku.unit,
        unitPriceKes: sku.defaultPrice,
        lineTotalKes: quantity * sku.defaultPrice,
      });
    }
  }

  const itemSum = items.reduce((acc, item) => acc + item.lineTotalKes, 0);
  const inferredTotal = kesMatches.length > 0 ? Math.max(...kesMatches) : itemSum || 450;

  let paidKes = paidMatch ? Number(paidMatch[1].replaceAll(',', '')) : inferredTotal;
  let creditOwedKes = creditMatch ? Number(creditMatch[1].replaceAll(',', '')) : 0;

  if (/\b(deni|credit|tab|kwa mkopo)\b/i.test(lower) && creditOwedKes === 0 && !isRepayment) {
    if (kesMatches.length >= 2) {
      creditOwedKes = kesMatches[1];
      paidKes = Math.max(0, inferredTotal - creditOwedKes);
    } else {
      creditOwedKes = Math.max(0, inferredTotal - (paidMatch ? paidKes : 0));
      paidKes = inferredTotal - creditOwedKes;
    }
  }

  const totalKes = Math.max(inferredTotal, paidKes + creditOwedKes);
  if (items.length === 0) {
    items.push({
      name: isRestock ? 'Mixed Wholesale Stock' : isRepayment ? 'Tab Settlement' : 'Mixed Retail Basket',
      quantity: 1,
      unit: 'lot',
      unitPriceKes: totalKes,
      lineTotalKes: totalKes,
    });
  }

  let category: LedgerCategory = 'Sale';
  let paymentMethod: PaymentMethod = hasMpesa ? 'MPESA' : 'CASH';
  if (isRestock) {
    category = 'Wholesale Restock';
    paymentMethod = 'SUPPLIER_EXPENSE';
  } else if (isRepayment) {
    category = 'Credit Repayment';
    paymentMethod = hasMpesa ? 'MPESA' : 'CASH';
  } else if (creditOwedKes > 0) {
    category = 'Credit Tab';
    paymentMethod = paidKes > 0 ? 'MIXED' : 'CREDIT';
  }

  const estimatedMarginPct = isRestock ? 0 : creditOwedKes > 0 ? 18.5 : 22.0;

  return {
    category,
    paymentMethod,
    items,
    totalKes,
    paidKes: isRestock ? 0 : paidKes,
    creditOwedKes,
    estimatedMarginPct,
    summary: `${category}: KES ${totalKes.toLocaleString()} (${items.map((i) => `${i.quantity}x ${i.name}`).join(', ')})`,
  };
}

export function buildPreviewLedgerEntry(rawInput: string, requestedMode: RoutingMode): LedgerEntry {
  const started = performance.now();
  const { sanitizedText, redactions } = redactShopNote(rawInput);
  const draft = parseShopNoteLocally(rawInput);
  const latencyMs = Math.max(3, Math.round(performance.now() - started));

  return {
    id: `entry-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    rawInput,
    sanitizedInput: sanitizedText,
    redactionCount: redactions.length,
    customerAlias: deriveCustomerAlias(rawInput),
    category: draft.category,
    paymentMethod: draft.paymentMethod,
    items: draft.items,
    totalKes: draft.totalKes,
    paidKes: draft.paidKes,
    creditOwedKes: draft.creditOwedKes,
    estimatedMarginPct: draft.estimatedMarginPct,
    summary: draft.summary,
    inferenceSource: 'PREVIEW_LOCAL',
    requestedMode,
    latencyMs,
  };
}

export function buildPreviewStrategyAdvice(entries: LedgerEntry[]): StrategyAdvice {
  const started = performance.now();
  const summary = buildAnonymizedLedgerSummary(entries);
  const topSku = summary.topItems[0]?.sku ?? 'Pembe Maize Flour 2kg';

  return {
    generatedAt: new Date().toISOString(),
    inferenceSource: 'PREVIEW_LOCAL',
    latencyMs: Math.max(8, Math.round(performance.now() - started)),
    headline: `Collected KES ${summary.totalCashCollectedKes.toLocaleString()} with KES ${summary.totalCreditOutstandingKes.toLocaleString()} open across customer tabs.`,
    restockPriorities: [
      `Prioritize fast-turn staples led by ${topSku} (${summary.topItems[0]?.unitsSoldOrRestocked ?? 1} units moved).`,
      'Keep working capital in high-velocity cooking oil and maize flour rather than slow specialty SKUs.',
    ],
    creditRiskActions: [
      `Follow up on open credit balance (KES ${summary.totalCreditOutstandingKes.toLocaleString()}) before extending new weekend tabs.`,
      'Request partial M-PESA settlement on multi-item baskets exceeding KES 500.',
    ],
    cashflowNote:
      'Local preview advisory active because live Firebase keys are omitted. Add VITE_FIREBASE_* keys to execute real Cloud Gemini 3.8 Flash strategy analysis.',
    auditedPayload: summary,
  };
}
