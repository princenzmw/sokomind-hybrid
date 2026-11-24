import type {
  AnonymizedLedgerSummary,
  LedgerCategory,
  LedgerEntry,
  PrivacyRedaction,
  PrivacyRedactionResult,
} from './types';

const KENYA_PHONE_RE = /(?:\+?254|0)(?:7\d{2}|1\d{2})[\s-]?\d{3}[\s-]?\d{3}\b/g;
const MPESA_CODE_RE = /\b[A-Z]{2,3}[A-Z0-9]{7,8}\b/g;
const CUSTOMER_NAME_RE =
  /\b(?:(?:Mama|Baba|Kwa|Duka|Mzee)\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?|(?:Customer|Client|Supplier|Mrs?|Ms)\.?\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b/g;

function stableAlias(raw: string): string {
  let hash = 2166136261;
  const normalized = raw.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const code = (hash >>> 0).toString(16).toUpperCase().slice(0, 4).padStart(4, '0');
  return `Customer #${code}`;
}

export function deriveCustomerAlias(rawText: string): string {
  const match = rawText.match(CUSTOMER_NAME_RE);
  if (match && match[0]) {
    return stableAlias(match[0]);
  }
  return 'Walk-in Shopper';
}

export function redactShopNote(rawText: string): PrivacyRedactionResult {
  const redactions: PrivacyRedaction[] = [];
  let sanitized = rawText;

  sanitized = sanitized.replace(KENYA_PHONE_RE, (match) => {
    const masked = '[PHONE_REDACTED]';
    redactions.push({ kind: 'PHONE', original: match, masked });
    return masked;
  });

  sanitized = sanitized.replace(MPESA_CODE_RE, (match) => {
    // Require at least one digit so uppercase English acronyms like KES or MPSA are preserved.
    if (!/\d/.test(match)) {
      return match;
    }
    const masked = '[MPESA_REF_REDACTED]';
    redactions.push({ kind: 'MPESA_CODE', original: match, masked });
    return masked;
  });

  sanitized = sanitized.replace(CUSTOMER_NAME_RE, (match) => {
    const masked = `[${stableAlias(match)}]`;
    redactions.push({ kind: 'CUSTOMER_NAME', original: match, masked });
    return masked;
  });

  return { sanitizedText: sanitized, redactions };
}

export function buildAnonymizedLedgerSummary(entries: LedgerEntry[]): AnonymizedLedgerSummary {
  let totalCashCollectedKes = 0;
  let totalCreditOutstandingKes = 0;
  let weightedMarginNumerator = 0;
  let totalVolumeForMargin = 0;
  let onDeviceCalls = 0;

  const categoryMap = new Map<
    LedgerCategory,
    { count: number; volumeKes: number; creditOwedKes: number }
  >();
  const itemMap = new Map<string, { units: number; revenueKes: number }>();

  for (const entry of entries) {
    totalCashCollectedKes += entry.paidKes;
    totalCreditOutstandingKes += entry.creditOwedKes;

    if (entry.category !== 'Wholesale Restock' && entry.category !== 'Shop Expense') {
      weightedMarginNumerator += entry.totalKes * entry.estimatedMarginPct;
      totalVolumeForMargin += entry.totalKes;
    }

    if (entry.inferenceSource === 'ON_DEVICE') {
      onDeviceCalls += 1;
    }

    const catStats = categoryMap.get(entry.category) ?? {
      count: 0,
      volumeKes: 0,
      creditOwedKes: 0,
    };
    catStats.count += 1;
    catStats.volumeKes += entry.totalKes;
    catStats.creditOwedKes += entry.creditOwedKes;
    categoryMap.set(entry.category, catStats);

    for (const item of entry.items) {
      const cleanName = redactShopNote(item.name).sanitizedText.trim();
      const existing = itemMap.get(cleanName) ?? { units: 0, revenueKes: 0 };
      existing.units += item.quantity;
      existing.revenueKes += item.lineTotalKes;
      itemMap.set(cleanName, existing);
    }
  }

  const categories = Array.from(categoryMap.entries()).map(([category, stats]) => ({
    category,
    count: stats.count,
    volumeKes: Math.round(stats.volumeKes),
    creditOwedKes: Math.round(stats.creditOwedKes),
  }));

  const topItems = Array.from(itemMap.entries())
    .map(([sku, stats]) => ({
      sku,
      unitsSoldOrRestocked: stats.units,
      revenueKes: Math.round(stats.revenueKes),
    }))
    .sort((a, b) => b.revenueKes - a.revenueKes)
    .slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    totalCashCollectedKes: Math.round(totalCashCollectedKes),
    totalCreditOutstandingKes: Math.round(totalCreditOutstandingKes),
    weightedMarginPct:
      totalVolumeForMargin > 0
        ? Number((weightedMarginNumerator / totalVolumeForMargin).toFixed(1))
        : 0,
    onDeviceSharePct:
      entries.length > 0 ? Math.round((onDeviceCalls / entries.length) * 100) : 0,
    categories,
    topItems,
  };
}
