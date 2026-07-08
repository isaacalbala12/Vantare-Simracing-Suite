import { motion } from "motion/react";
import { Events } from "@wailsio/runtime";

export type HubToastVariant = "success" | "partial" | "error";

type HubToastProps = {
  variant: HubToastVariant;
  message: string;
  profileId: string;
  /** Callback when retry is clicked. If omitted, emits launcher:profile:retry:failed. */
  onRetry?: (profileId: string) => void;
  /** Callback when the close button is clicked. */
  onClose?: () => void;
};

const variantStyles: Record<
  HubToastVariant,
  { border: string; bg: string; icon: string }
> = {
  success: {
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    icon: "✓",
  },
  partial: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    icon: "⚠",
  },
  error: {
    border: "border-red-500/40",
    bg: "bg-red-500/10",
    icon: "✕",
  },
};

/**
 * HubToast — fallback toast component for chain results.
 * Slides in from the top-right corner with Motion.
 * Shows a retry button for partial/error variants.
 */
export function HubToast({
  variant,
  message,
  profileId,
  onRetry,
  onClose,
}: HubToastProps) {
  const styles = variantStyles[variant];

  const handleRetry = () => {
    if (onRetry) {
      onRetry(profileId);
    } else {
      Events.Emit("launcher:profile:retry:failed", { id: profileId });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      data-testid={`hub-toast-${variant}`}
      className={`fixed top-4 right-4 z-[9999] min-w-[320px] max-w-md rounded-xl border ${styles.border} ${styles.bg} backdrop-blur-md p-4 shadow-2xl`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5" aria-hidden>
          {styles.icon}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-white" data-testid="hub-toast-message">
            {message}
          </p>

          {(variant === "partial" || variant === "error") && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleRetry}
                data-testid="hub-toast-retry"
                className="px-3 py-1 rounded-lg border border-amber-500/40 text-[10px] uppercase tracking-[.18em] text-amber-300 hover:bg-amber-500/10 transition-colors"
              >
                Reintentar fallidos
              </button>
            </div>
          )}
        </div>

        {onClose && (
          <button
            onClick={onClose}
            data-testid="hub-toast-close"
            className="shrink-0 p-1 rounded-md text-vantare-textDim hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        )}
      </div>
    </motion.div>
  );
}
