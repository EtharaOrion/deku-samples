import { describe, it, expect } from 'vitest';
import { dryMass, creditGranted, contentBp, factorFromWindow, byproductShareBp, blendContent, requiredRemainingBp } from '../api/src/engine/int.js';

describe('every derived integer is floored', () => {
  it('dry mass of 12345 g at 5000 bp moisture is 6172, not 6173', () => {
    expect(dryMass(12345, 5000)).toBe(6172);
  });
  it('content_bp of 200000 g on a 300000 g lot is 6666, not 6667', () => {
    expect(contentBp(200000, 300000)).toBe(6666);
  });
  it('credit granted at a consumption is dry mass times factor, floored', () => {
    expect(creditGranted(450000, 8000)).toBe(360000);
    expect(creditGranted(299999, 8000)).toBe(239999);
  });
  it('a conversion factor is the arithmetic of its window', () => {
    expect(factorFromWindow(800000, 1000000)).toBe(8000);
    expect(factorFromWindow(1, 3)).toBe(3333);
  });
  it('a byproduct share is byproduct mass over total output, floored', () => {
    expect(byproductShareBp(40000, 760000)).toBe(526);
  });
  it('a blend is mass-weighted and floored', () => {
    expect(blendContent(400000, 9000, 200000, 7500)).toBe(8500);
  });
  it('a required remaining average is computed, never asserted', () => {
    expect(requiredRemainingBp(200, 5000, 0, 0)).toBe(5000);
  });
});
