import type { LicenseTier } from './types';

export enum Feature {
  STANDINGS = 'standings',
  RELATIVE = 'relative',
  DELTA_BAR = 'delta-bar',
  FUEL_CALCULATOR = 'fuel-calculator',
  FLAGS = 'flags',
  TRACK_MAP = 'track-map',
  STREAM_ALERTS = 'stream-alerts',
  INPUT_TELEMETRY = 'input-telemetry',
  HEAD_TO_HEAD = 'head-to-head',
  BLIND_SPOT = 'blind-spot',
  DATA_BLOCKS = 'data-blocks',
  CUSTOM_THEMES = 'custom-themes',
  IRACING = 'iracing',
  LMU = 'lmu',
  AC = 'ac',
}

export type Tier = LicenseTier;

export const tierFeatures: Record<Tier, Feature[]> = {
  free: [
    Feature.STANDINGS,
    Feature.RELATIVE,
    Feature.DELTA_BAR,
    Feature.IRACING,
  ],
  pro: [
    Feature.STANDINGS,
    Feature.RELATIVE,
    Feature.DELTA_BAR,
    Feature.FUEL_CALCULATOR,
    Feature.FLAGS,
    Feature.TRACK_MAP,
    Feature.STREAM_ALERTS,
    Feature.INPUT_TELEMETRY,
    Feature.HEAD_TO_HEAD,
    Feature.BLIND_SPOT,
    Feature.IRACING,
    Feature.LMU,
    Feature.AC,
  ],
  ultimate: [
    Feature.STANDINGS,
    Feature.RELATIVE,
    Feature.DELTA_BAR,
    Feature.FUEL_CALCULATOR,
    Feature.FLAGS,
    Feature.TRACK_MAP,
    Feature.STREAM_ALERTS,
    Feature.INPUT_TELEMETRY,
    Feature.HEAD_TO_HEAD,
    Feature.BLIND_SPOT,
    Feature.DATA_BLOCKS,
    Feature.CUSTOM_THEMES,
    Feature.IRACING,
    Feature.LMU,
    Feature.AC,
  ],
};

export function hasFeature(tier: Tier, feature: Feature): boolean {
  return tierFeatures[tier]?.includes(feature) ?? false;
}

export function getRequiredTier(feature: Feature): Tier {
  if (tierFeatures.free.includes(feature)) return 'free';
  if (tierFeatures.pro.includes(feature)) return 'pro';
  return 'ultimate';
}

export function getFeaturesForTier(tier: Tier): Feature[] {
  return tierFeatures[tier] ?? [];
}
