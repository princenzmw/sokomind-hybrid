import { describe, expect, it } from 'vitest';
import {
  aggregateOpenCreditTabs,
  buildAnonymizedLedgerSummary,
  deriveCustomerAlias,
  redactShopNote,
} from '../privacyFirewall';
import type { LedgerEntry } from '../types';

describe('privacyFirewall', () => {
  it('masks Kenyan phone numbers, M-PESA references, and customer names while keeping currency codes', () => {
    const raw =
      'Mama Njeri 0712 345 678 and Baba Kevin +254722110998 paid KES 625 via M-PESA SJK4829LMN';
    const result = redactShopNote(raw);

    expect(result.sanitizedText).not.toContain('0712 345 678');
    expect(result.sanitizedText).not.toContain('+254722110998');
    expect(result.sanitizedText).not.toContain('SJK4829LMN');
    expect(result.sanitizedText).not.toContain('Mama Njeri');
    expect(result.sanitizedText).not.toContain('Baba Kevin');
    expect(result.sanitizedText).toContain('KES 625');
    expect(result.sanitizedText).toContain('[PHONE_REDACTED]');
    expect(result.sanitizedText).toContain('[MPESA_REF_REDACTED]');
    expect(result.redactions).toHaveLength(5);
  });

  it('derives deterministic customer aliases without exposing real names', () => {
    const alias1 = deriveCustomerAlias('Mama Njeri took bread KES 65');
    const alias2 = deriveCustomerAlias('Mama Njeri paid tab KES 65');
    const walkIn = deriveCustomerAlias('2x unga cash KES 350');

    expect(alias1).toMatch(/^Customer #[0-9A-F]{4}$/);
    expect(alias1).toBe(alias2);
    expect(walkIn).toBe('Walk-in Shopper');
  });

  it('produces an anonymized aggregate summary free of raw customer PII', () => {
    const entries: LedgerEntry[] = [
      {
        id: '1',
        createdAt: '2026-11-25T08:00:00Z',
        rawInput: 'Mama Wanjiku 0721440812 paid KES 300, deni KES 200 ref TKL9120PQR',
        sanitizedInput: '[Customer #1234] [PHONE_REDACTED] paid KES 300, deni KES 200',
        redactionCount: 3,
        customerAlias: 'Customer #1234',
        category: 'Credit Tab',
        paymentMethod: 'MIXED',
        items: [
          {
            name: 'Pembe Maize Flour 2kg',
            quantity: 2,
            unit: 'pack',
            unitPriceKes: 175,
            lineTotalKes: 350,
          },
        ],
        totalKes: 500,
        paidKes: 300,
        creditOwedKes: 200,
        estimatedMarginPct: 20,
        summary: 'Credit Tab',
        inferenceSource: 'ON_DEVICE',
        requestedMode: 'PREFER_ON_DEVICE',
        latencyMs: 95,
      },
      {
        id: '2',
        createdAt: '2026-11-25T09:00:00Z',
        rawInput: 'Wholesale restock KES 1000',
        sanitizedInput: 'Wholesale restock KES 1000',
        redactionCount: 0,
        customerAlias: 'Walk-in Shopper',
        category: 'Wholesale Restock',
        paymentMethod: 'SUPPLIER_EXPENSE',
        items: [
          {
            name: 'Cooking Oil 1L',
            quantity: 3,
            unit: 'bottle',
            unitPriceKes: 300,
            lineTotalKes: 900,
          },
        ],
        totalKes: 1000,
        paidKes: 0,
        creditOwedKes: 0,
        estimatedMarginPct: 0,
        summary: 'Wholesale Restock',
        inferenceSource: 'IN_CLOUD',
        requestedMode: 'ONLY_IN_CLOUD',
        latencyMs: 540,
      },
    ];

    const summary = buildAnonymizedLedgerSummary(entries);
    const serialized = JSON.stringify(summary);

    expect(summary.totalCashCollectedKes).toBe(300);
    expect(summary.totalCreditOutstandingKes).toBe(200);
    expect(summary.onDeviceSharePct).toBe(50);
    expect(summary.weightedMarginPct).toBe(20);
    expect(serialized).not.toContain('Mama Wanjiku');
    expect(serialized).not.toContain('0721440812');
    expect(serialized).not.toContain('TKL9120PQR');
  });

  it('masks Kenyan national IDs, emails, and extended honorifics', () => {
    const raw =
      'Bi Amina ID No: 28491023 (amina.shop@example.com) paid KES 450, Ndugu Juma took 1x mkate';
    const result = redactShopNote(raw);

    expect(result.sanitizedText).not.toContain('28491023');
    expect(result.sanitizedText).not.toContain('amina.shop@example.com');
    expect(result.sanitizedText).not.toContain('Bi Amina');
    expect(result.sanitizedText).not.toContain('Ndugu Juma');
    expect(result.sanitizedText).toContain('[ID_REDACTED]');
    expect(result.sanitizedText).toContain('[EMAIL_REDACTED]');
    expect(result.redactions.map((r) => r.kind)).toEqual(
      expect.arrayContaining(['EMAIL', 'NATIONAL_ID', 'CUSTOMER_NAME']),
    );
  });

  it('aggregates net open credit tabs minus repayments per customer alias', () => {
    const entries: LedgerEntry[] = [
      {
        id: '1',
        createdAt: '2026-11-25T08:00:00Z',
        rawInput: 'Mama Njeri tab',
        sanitizedInput: '[Customer #AAAA] tab',
        redactionCount: 1,
        customerAlias: 'Customer #AAAA',
        category: 'Credit Tab',
        paymentMethod: 'CREDIT',
        items: [],
        totalKes: 500,
        paidKes: 100,
        creditOwedKes: 400,
        estimatedMarginPct: 18,
        summary: 'Tab',
        inferenceSource: 'ON_DEVICE',
        requestedMode: 'PREFER_ON_DEVICE',
        latencyMs: 90,
      },
      {
        id: '2',
        createdAt: '2026-11-25T10:00:00Z',
        rawInput: 'Mama Njeri repaid',
        sanitizedInput: '[Customer #AAAA] repaid',
        redactionCount: 1,
        customerAlias: 'Customer #AAAA',
        category: 'Credit Repayment',
        paymentMethod: 'MPESA',
        items: [],
        totalKes: 150,
        paidKes: 150,
        creditOwedKes: 0,
        estimatedMarginPct: 20,
        summary: 'Repayment',
        inferenceSource: 'ON_DEVICE',
        requestedMode: 'PREFER_ON_DEVICE',
        latencyMs: 85,
      },
    ];

    const open = aggregateOpenCreditTabs(entries);
    expect(open).toEqual([
      {
        customerAlias: 'Customer #AAAA',
        openBalanceKes: 250,
        tabCount: 1,
        lastActivity: '2026-11-25T10:00:00Z',
      },
    ]);
  });
});
