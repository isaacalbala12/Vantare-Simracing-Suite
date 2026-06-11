import React, { useEffect } from 'react';
import { GlassPanel, useTheme, LiveDot } from '@vantare/ui-core';
import { useAlertsStore } from '../../../shared/stores/alerts-store';
import type { Alert, AlertType } from '../../../shared/types/alerts';

// ── Constants ──────────────────────────────────────────────────────────────

/** Auto-dismiss timeout for the currently visible alert (ms). */
const ALERT_DISMISS_MS = 5000;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Human-readable label per alert type. */
function getAlertLabel(type: AlertType): string {
  switch (type) {
    case 'overtake':
      return 'Overtake';
    case 'pole':
      return 'Pole Position';
    case 'fastest_lap':
      return 'Fastest Lap';
    default:
      return 'Alert';
  }
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * StreamAlerts renders the current alert from the queue store.
 *
 * - Subscribes to `useAlertsStore` via selector (not `.getState()` in render)
 *   so any enqueue / dismiss triggers a re-render.
 * - Auto-dismisses after `ALERT_DISMISS_MS` (5s). The timer is keyed on
 *   `currentAlert.id` so a fresh alert always restarts the countdown and the
 *   timer is cleaned up on unmount or when the alert changes.
 * - Click anywhere on the alert to dismiss immediately.
 * - Entrance uses the `hf-fade-in` animation class from animations.css.
 *
 * Queue semantics: when `dismissCurrent()` is called, the store shifts the
 * next item from `queue` into `currentAlert`. This component re-renders and
 * shows the new alert (also with a fresh 5s timer).
 */
export default function StreamAlerts() {
  const currentAlert = useAlertsStore((s) => s.currentAlert);
  const dismissCurrent = useAlertsStore((s) => s.dismissCurrent);
  const { themeId } = useTheme();
  const isF1 = themeId === 'f1';

  useEffect(() => {
    if (!currentAlert) return;
    const timer = setTimeout(() => {
      dismissCurrent();
    }, ALERT_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [currentAlert, dismissCurrent]);

  if (!currentAlert) {
    return null;
  }

  // Cast to Alert narrows currentAlert after the null guard.
  const alert = currentAlert as Alert;

  return (
    <div
      data-testid="stream-alert"
      className="stream-alert-shell hf-fade-in"
      data-alert-type={alert.type}
      onClick={dismissCurrent}
      role="button"
      tabIndex={0}
    >
      <GlassPanel className={`stream-alert${isF1 ? ' f1' : ''}`}>
        <div className="stream-alert-content">
          <span className="stream-alert-label">{getAlertLabel(alert.type)}</span>
          <span className="stream-alert-message">{alert.message}</span>
          {isF1 && <LiveDot />}
        </div>
      </GlassPanel>
    </div>
  );
}
