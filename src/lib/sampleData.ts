import { deriveCustomerAlias, redactShopNote } from './privacyFirewall';
import type { LedgerEntry } from './types';

export interface SamplePreset {
  id: string;
  label: string;
  channel: string;
  text: string;
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'sheng-credit',
    label: 'Swahili / Sheng Credit Tab',
    channel: 'On-Device PII Safe',
    text: 'Mama Njeri 0712 345 678 alichukua 2x unga ya ugali na 1x mafuta ya kupika KES 660, alilipa KES 300 cash, deni KES 360',
  },
  {
    id: 'mpesa-sale',
    label: 'M-PESA Morning Sale',
    channel: 'On-Device Receipt Parse',
    text: 'Sold 3x sukari 1kg and 2x fresh milk 500ml total KES 625 paid via M-PESA ref SJK4829LMN from +254722110998',
  },
  {
    id: 'credit-repayment',
    label: 'Deni Settlement',
    channel: 'On-Device PII Safe',
    text: 'Baba Otieno 0733 908 112 repaid tab KES 450 via M-PESA TKL9120PQR for broadways bread and ketepa tea',
  },
  {
    id: 'wholesale-restock',
    label: 'Wholesale Restock',
    channel: 'Cloud-Ready Aggregate',
    text: 'Wholesale restock from supplier Kamau Distributors: 10x Pembe Maize Flour 2kg and 6x Cooking Oil 1L KES 3,420',
  },
];

function seedEntry(
  id: string,
  hoursAgo: number,
  rawInput: string,
  partial: Pick<
    LedgerEntry,
    | 'category'
    | 'paymentMethod'
    | 'items'
    | 'totalKes'
    | 'paidKes'
    | 'creditOwedKes'
    | 'estimatedMarginPct'
    | 'summary'
    | 'inferenceSource'
    | 'latencyMs'
  >,
): LedgerEntry {
  const { sanitizedText, redactions } = redactShopNote(rawInput);
  return {
    id,
    createdAt: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString(),
    rawInput,
    sanitizedInput: sanitizedText,
    redactionCount: redactions.length,
    customerAlias: deriveCustomerAlias(rawInput),
    requestedMode: partial.inferenceSource === 'IN_CLOUD' ? 'PREFER_IN_CLOUD' : 'PREFER_ON_DEVICE',
    ...partial,
  };
}

export const INITIAL_LEDGER_ENTRIES: LedgerEntry[] = [
  seedEntry(
    'seed-1',
    6.5,
    'Mama Wanjiku 0721 440 812 took 2x Pembe Maize Flour 2kg and 1x Kabras Sugar 1kg KES 515, paid KES 300 cash, deni KES 215',
    {
      category: 'Credit Tab',
      paymentMethod: 'MIXED',
      items: [
        { name: 'Pembe Maize Flour 2kg', quantity: 2, unit: 'pack', unitPriceKes: 175, lineTotalKes: 350 },
        { name: 'Kabras Sugar 1kg', quantity: 1, unit: 'pack', unitPriceKes: 165, lineTotalKes: 165 },
      ],
      totalKes: 515,
      paidKes: 300,
      creditOwedKes: 215,
      estimatedMarginPct: 19.2,
      summary: 'Credit Tab: KES 515 (2x Pembe Maize Flour 2kg, 1x Kabras Sugar 1kg)',
      inferenceSource: 'ON_DEVICE',
      latencyMs: 142,
    },
  ),
  seedEntry(
    'seed-2',
    5.0,
    'Walk-in M-PESA SGH8204QWE 2x Cooking Oil 1L and 2x Broadways Bread 400g total KES 750 paid',
    {
      category: 'Sale',
      paymentMethod: 'MPESA',
      items: [
        { name: 'Cooking Oil 1L', quantity: 2, unit: 'bottle', unitPriceKes: 310, lineTotalKes: 620 },
        { name: 'Broadways Bread 400g', quantity: 2, unit: 'loaf', unitPriceKes: 65, lineTotalKes: 130 },
      ],
      totalKes: 750,
      paidKes: 750,
      creditOwedKes: 0,
      estimatedMarginPct: 22.4,
      summary: 'Sale: KES 750 (2x Cooking Oil 1L, 2x Broadways Bread 400g)',
      inferenceSource: 'ON_DEVICE',
      latencyMs: 128,
    },
  ),
  seedEntry(
    'seed-3',
    3.5,
    'Baba Kevin +254718902341 alilipa deni KES 600 via M-PESA RFK3109ZXM',
    {
      category: 'Credit Repayment',
      paymentMethod: 'MPESA',
      items: [{ name: 'Tab Settlement', quantity: 1, unit: 'lot', unitPriceKes: 600, lineTotalKes: 600 }],
      totalKes: 600,
      paidKes: 600,
      creditOwedKes: 0,
      estimatedMarginPct: 20.0,
      summary: 'Credit Repayment: KES 600 settled via M-PESA',
      inferenceSource: 'ON_DEVICE',
      latencyMs: 118,
    },
  ),
  seedEntry(
    'seed-4',
    2.0,
    'Multimodal supplier invoice scan: 12x Fresh Milk 500ml and 6x Omo Washing Powder 500g total KES 1,650',
    {
      category: 'Wholesale Restock',
      paymentMethod: 'SUPPLIER_EXPENSE',
      items: [
        { name: 'Fresh Milk 500ml', quantity: 12, unit: 'pkt', unitPriceKes: 55, lineTotalKes: 660 },
        { name: 'Omo Washing Powder 500g', quantity: 6, unit: 'pack', unitPriceKes: 165, lineTotalKes: 990 },
      ],
      totalKes: 1650,
      paidKes: 0,
      creditOwedKes: 0,
      estimatedMarginPct: 0,
      summary: 'Wholesale Restock: KES 1,650 (12x Fresh Milk 500ml, 6x Omo Washing Powder 500g)',
      inferenceSource: 'IN_CLOUD',
      latencyMs: 690,
    },
  ),
];
