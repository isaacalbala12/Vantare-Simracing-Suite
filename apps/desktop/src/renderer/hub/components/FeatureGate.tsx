import type { ReactNode } from 'react';
import { Feature } from '@vantare/auth';
import { useLicense } from '../../shared/hooks/useLicense';
import FeatureBadge from './FeatureBadge';
import UpgradePrompt from './UpgradePrompt';

interface FeatureGateProps {
  feature: Feature;
  label?: string;
  children: ReactNode;
  fallback?: ReactNode;
  showBadge?: boolean;
}

export default function FeatureGate({
  feature,
  label,
  children,
  fallback,
  showBadge = true,
}: FeatureGateProps) {
  const { canAccess, requiredTier } = useLicense();
  const allowed = canAccess(feature);
  const displayName = label ?? feature;

  if (allowed) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div data-testid={`feature-gate-${feature}`} className="space-y-2">
      <div className="flex items-center gap-2 opacity-60 pointer-events-none select-none">
        <span className="text-sm text-[var(--color-text-muted)]">{displayName}</span>
        {showBadge && <FeatureBadge requiredTier={requiredTier(feature)} />}
      </div>
      <UpgradePrompt feature={displayName} requiredTier={requiredTier(feature)} />
    </div>
  );
}
