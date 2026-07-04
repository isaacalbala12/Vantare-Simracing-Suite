import type { ReactNode } from "react";
import { useAccess } from "../../lib/access";
import { getFeatureGate } from "../../lib/access-policy";
import type { FeatureId } from "../../lib/access-policy";

type AccessGateProps = {
  feature: FeatureId;
  /** What to render when access is allowed. */
  children: ReactNode;
  /** Optional custom locked UI. Defaults to a small badge + message. */
  locked?: ReactNode;
  /** When true, hides children entirely instead of showing locked UI. */
  hide?: boolean;
};

/**
 * Renders children when the current user has access to `feature`.
 * Otherwise renders a locked state (or nothing if `hide` is true).
 */
export function AccessGate({ feature, children, locked, hide }: AccessGateProps) {
  const access = useAccess();
  const gate = getFeatureGate(access, feature);

  if (gate.allowed) {
    return <>{children}</>;
  }

  if (hide) {
    return null;
  }

  if (locked) {
    return <>{locked}</>;
  }

  return <DefaultLocked feature={feature} reason={gate.reason} />;
}

type DefaultLockedProps = {
  feature: FeatureId;
  reason?: string;
};

function DefaultLocked({ reason }: DefaultLockedProps) {
  const message =
    reason === "blocked-license"
      ? "No disponible con la licencia actual"
      : reason === "unconfigured"
        ? "Requiere configuración de cuenta"
        : "Disponible para testers y planes de pago";

  return (
    <div
      role="status"
      data-testid="access-gate-locked"
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-vantare-textMuted"
    >
      <svg className="w-4 h-4 shrink-0 text-vantare-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m0 0v2m0-2h2m-2 0H10m9.364-7.364A9 9 0 1112 3a9 9 0 017.364 4.636z" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

/**
 * Hook to check if a feature is available. Returns `{ allowed, gate }`.
 * Useful when you need conditional logic (e.g. disable a button) rather than wrapping JSX.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useFeatureGate(feature: FeatureId) {
  const access = useAccess();
  const gate = getFeatureGate(access, feature);
  return { allowed: gate.allowed, gate };
}

