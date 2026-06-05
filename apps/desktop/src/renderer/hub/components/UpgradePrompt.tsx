import type { LicenseTier } from '@vantare/auth';

interface UpgradePromptProps {
  feature: string;
  requiredTier: LicenseTier;
  onDismiss?: () => void;
}

const TIER_LABELS: Record<LicenseTier, string> = {
  free: 'Free',
  pro: 'Pro',
  ultimate: 'Ultimate',
};

export default function UpgradePrompt({ feature, requiredTier, onDismiss }: UpgradePromptProps) {
  return (
    <div
      data-testid="upgrade-prompt"
      className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-amber-200">
            {feature} requires {TIER_LABELS[requiredTier]}
          </p>
          <p className="text-xs text-amber-200/70 mt-1">
            Upgrade your license to unlock this feature.
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-amber-200/60 hover:text-amber-200 text-xs"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
      <button
        type="button"
        data-testid="upgrade-prompt-cta"
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500 text-black hover:bg-amber-400 transition-colors"
      >
        View plans
      </button>
    </div>
  );
}
