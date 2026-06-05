import { useMemo } from 'react';
import { Feature, getRequiredTier, hasFeature } from '@vantare/auth';
import { useTelemetryStore } from '@vantare/ui-core';
import { useAuthStore } from '../stores/auth-store';
import { useAppStore } from '../stores/app-store';

export function useLicense() {
  const license = useAuthStore((s) => s.license);
  const user = useAuthStore((s) => s.user);
  const demoMode = useAppStore((s) => s.demoMode);
  const isMock = useTelemetryStore((s) => s.isMock);

  const tier = license?.tier ?? user?.tier ?? 'free';
  const bypassGating = demoMode || isMock;

  const canAccess = useMemo(
    () => (feature: Feature) => bypassGating || hasFeature(tier, feature),
    [bypassGating, tier],
  );

  const requiredTier = useMemo(
    () => (feature: Feature) => getRequiredTier(feature),
    [],
  );

  return {
    tier,
    license,
    user,
    isAuthenticated: Boolean(user),
    bypassGating,
    canAccess,
    requiredTier,
    Feature,
  };
}
