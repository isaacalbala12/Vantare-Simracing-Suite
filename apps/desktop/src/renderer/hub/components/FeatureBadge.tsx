import type { LicenseTier } from '@vantare/auth';

interface FeatureBadgeProps {
  requiredTier: LicenseTier;
}

const TIER_STYLES: Record<LicenseTier, string> = {
  free: 'bg-white/10 text-white/60',
  pro: 'bg-blue-500/20 text-blue-300',
  ultimate: 'bg-purple-500/20 text-purple-300',
};

export default function FeatureBadge({ requiredTier }: FeatureBadgeProps) {
  return (
    <span
      data-testid="feature-badge"
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${TIER_STYLES[requiredTier]}`}
    >
      {requiredTier}
    </span>
  );
}
