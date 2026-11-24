import { afterEach, describe, expect, it, vi } from 'vitest';
import { InferenceMode, InferenceSource } from 'firebase/ai';
import {
  extractJsonObject,
  generateMarginStrategyCloud,
  mapRoutingModeToSdk,
  mapTelemetrySource,
  parseShopNoteHybrid,
  runHybridBenchmark,
} from '../firebaseAi';
import { sanitizeEntryForCloud } from '../ledgerStore';
import { resetFirebaseServicesForTest } from '../firebaseClient';

describe('firebaseAi hybrid router', () => {
  it('maps UI routing modes to Firebase AI Logic InferenceMode constants', () => {
    expect(mapRoutingModeToSdk('PREFER_ON_DEVICE')).toBe(InferenceMode.PREFER_ON_DEVICE);
    expect(mapRoutingModeToSdk('ONLY_ON_DEVICE')).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(mapRoutingModeToSdk('PREFER_IN_CLOUD')).toBe(InferenceMode.PREFER_IN_CLOUD);
    expect(mapRoutingModeToSdk('ONLY_IN_CLOUD')).toBe(InferenceMode.ONLY_IN_CLOUD);
  });

  it('reads ON_DEVICE vs IN_CLOUD InferenceSource accurately', () => {
    expect(mapTelemetrySource(InferenceSource.ON_DEVICE, 'PREFER_ON_DEVICE')).toBe('ON_DEVICE');
    expect(mapTelemetrySource(InferenceSource.IN_CLOUD, 'PREFER_ON_DEVICE')).toBe('IN_CLOUD');
    expect(mapTelemetrySource(undefined, 'ONLY_IN_CLOUD')).toBe('IN_CLOUD');
  });

  it('extracts JSON cleanly from plain and markdown-fenced responses', () => {
    expect(extractJsonObject('```json\n{"totalKes": 500}\n```')).toEqual({ totalKes: 500 });
    expect(extractJsonObject('{"category": "Sale"}')).toEqual({ category: 'Sale' });
    expect(() => extractJsonObject('[1, 2, 3]')).toThrow('Model did not return a JSON object');
  });

  afterEach(() => {
    resetFirebaseServicesForTest();
    vi.unstubAllEnvs();
  });

  it('uses explicit PREVIEW_LOCAL telemetry when Firebase env config is absent', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', '');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
    vi.stubEnv('VITE_FIREBASE_APP_ID', '');
    const note =
      'Mama Njeri 0712 345 678 took 2x unga ya ugali KES 350, paid KES 200 cash, deni KES 150';
    const res = await parseShopNoteHybrid(note, 'PREFER_ON_DEVICE');

    expect(res.entry.inferenceSource).toBe('PREVIEW_LOCAL');
    expect(res.telemetry.inferenceSource).toBe('PREVIEW_LOCAL');
    expect(res.entry.redactionCount).toBe(2);
    expect(res.entry.sanitizedInput).not.toContain('0712 345 678');
    expect(res.entry.creditOwedKes).toBe(150);

    const strategy = await generateMarginStrategyCloud([res.entry]);
    expect(strategy.advice.inferenceSource).toBe('PREVIEW_LOCAL');
    expect(JSON.stringify(strategy.advice.auditedPayload)).not.toContain('Mama Njeri');
  });

  it('strips rawInput before cloud persistence via sanitizeEntryForCloud', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
    vi.stubEnv('VITE_FIREBASE_APP_ID', '');
    const res = await parseShopNoteHybrid(
      'Mama Njeri 0712 345 678 took 1x unga KES 175',
      'PREFER_ON_DEVICE',
    );
    const sanitized = sanitizeEntryForCloud(res.entry);
    expect('rawInput' in sanitized).toBe(false);
    expect(sanitized.sanitizedInput).not.toContain('0712 345 678');
  });

  it('handles offline PREFER_ON_DEVICE via deterministic fallback and rejects ONLY_IN_CLOUD', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'fake-key');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'fake.firebaseapp.com');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'fake-proj');
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'fake-app');

    const offlineRes = await parseShopNoteHybrid(
      'Mama Njeri 0712 345 678 took 2x unga KES 350',
      'PREFER_ON_DEVICE',
      { offline: true },
    );
    expect(offlineRes.telemetry.inferenceSource).toBe('PREVIEW_LOCAL');
    expect(offlineRes.telemetry.modelUsed).toBe('local-deterministic');

    await expect(
      parseShopNoteHybrid('2x unga KES 350', 'ONLY_IN_CLOUD', { offline: true }),
    ).rejects.toThrow(/Offline mode active/);
  });

  it('runs hybrid benchmark comparison cleanly in preview mode', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
    vi.stubEnv('VITE_FIREBASE_APP_ID', '');

    const bench = await runHybridBenchmark(
      'Baba Kevin +254722110998 paid KES 600 via M-PESA SJK4829LMN',
    );
    expect(bench.redactedCount).toBe(3);
    expect(bench.sanitizedNote).not.toContain('Baba Kevin');
    expect(bench.onDeviceRun.requestedMode).toBe('PREFER_ON_DEVICE');
    expect(bench.cloudRun.requestedMode).toBe('ONLY_IN_CLOUD');
  });
});
