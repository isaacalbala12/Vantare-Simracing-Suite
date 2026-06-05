import { describe, expect, it } from 'vitest';
import { Feature, getRequiredTier, hasFeature, tierFeatures } from '../feature-gate';

describe('feature-gate', () => {
  it('maps free tier features', () => {
    expect(hasFeature('free', Feature.STANDINGS)).toBe(true);
    expect(hasFeature('free', Feature.LMU)).toBe(false);
    expect(hasFeature('free', Feature.CUSTOM_THEMES)).toBe(false);
  });

  it('maps pro tier sims and overlays', () => {
    expect(hasFeature('pro', Feature.LMU)).toBe(true);
    expect(hasFeature('pro', Feature.CUSTOM_THEMES)).toBe(false);
  });

  it('maps ultimate tier custom themes', () => {
    expect(hasFeature('ultimate', Feature.CUSTOM_THEMES)).toBe(true);
  });

  it('returns required tier for features', () => {
    expect(getRequiredTier(Feature.DELTA_BAR)).toBe('free');
    expect(getRequiredTier(Feature.STREAM_ALERTS)).toBe('pro');
    expect(getRequiredTier(Feature.CUSTOM_THEMES)).toBe('ultimate');
  });

  it('exposes tier feature lists', () => {
    expect(tierFeatures.free.length).toBeGreaterThan(0);
    expect(tierFeatures.pro.length).toBeGreaterThan(tierFeatures.free.length);
    expect(tierFeatures.ultimate.length).toBeGreaterThanOrEqual(tierFeatures.pro.length);
  });
});
