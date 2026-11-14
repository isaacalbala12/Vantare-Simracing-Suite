import type { SettingsView } from "../contract/generated/contract";
import { testNotification } from "./appearance";
import { calendarNoticeSession } from "./calendar-notices";
import { operationNotices } from "./operation-notices";
import { presentSystemNotice } from "./system-notifications";
/** Both paths share the trusted bootstrap decision, never a renderer argument. */
export function notificationDelivery(
  mode: { mockRequested: boolean; mockAllowed: boolean; qa: boolean },
  clock = Date.now,
) {
  const present =
    mode.qa || (mode.mockRequested && mode.mockAllowed)
      ? () => true
      : presentSystemNotice;
  return {
    present,
    calendar: calendarNoticeSession(present, clock),
    operations: operationNotices(present),
    test: (settings?: SettingsView) => testNotification(settings, present),
  };
}
