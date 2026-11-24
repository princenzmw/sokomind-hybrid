import { describe, expect, it } from 'vitest';
import { InferenceMode, InferenceSource } from 'firebase/ai';
import {
  extractJsonObject,
  generateMarginStrategyCloud,
  mapRoutingModeToSdk,
  mapTelemetrySource,
  parseShopNoteHybrid,
} from '../firebaseAi';

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

  it('uses explicit PREVIEW_LOCAL telemetry when Firebase env config is absent', async () => {
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
});
