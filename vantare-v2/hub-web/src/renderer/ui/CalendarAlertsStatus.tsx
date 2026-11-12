import type { CalendarDocumentState } from "../../contract/generated/calendar";
import { calendarAlertsText as text } from "../i18n/calendarAlerts";
export type AlertsDocumentState = CalendarDocumentState | "loading";
export function CalendarAlertsStatus({
  state,
}: {
  state: AlertsDocumentState;
}) {
  if (state === "ready") return null;
  return (
    <p role="status">
      {state === "loading"
        ? text.reading
        : state === "protected"
          ? text.protected
          : text.unavailable}
    </p>
  );
}
