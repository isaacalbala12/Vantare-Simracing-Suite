import type { LicenseTier } from '@vantare/auth';

interface FeatureBadgeProps {
  requiredTier: LicenseTier;
}

const TIER_STYLES: Record<LicenseTier, string> = {
  free: 'bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)]',
  pro: 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]',
  ultimate: 'bg-[var(--color-secondary)]/20 text-[var(--color-secondary)]',
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
