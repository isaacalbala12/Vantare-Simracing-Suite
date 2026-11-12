import {
  calendarBandsLimit,
  calendarSlotsLimit,
} from "../../contract/generated/calendar";
import { calendarText } from "../i18n/calendar";
import { calendarAlertsText as text } from "../i18n/calendarAlerts";
import type { CalendarPreferenceFailure } from "../screens/calendar/CalendarPreferences";
import { Button } from "./Button";
export function CalendarPreferencesFailure({
  failure,
  canRetry,
  onRetry,
  onDiscard,
}: {
  failure: CalendarPreferenceFailure;
  canRetry: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const message =
    failure === "calendarConflict"
      ? text.conflict
      : failure === "calendarScheduleUnavailable"
        ? calendarText.scheduleRequired
        : failure === "bandsLimit"
          ? text.bandsLimit(calendarBandsLimit)
          : failure === "slotsLimit"
            ? text.slotsLimit(calendarSlotsLimit)
            : failure === "duplicates"
              ? text.duplicates
              : calendarText.preferencesFailed;
  return (
    <div role="alert">
      <p>{message}</p>
      {canRetry && failure !== "calendarConflict" && (
        <Button onClick={onRetry}>{calendarText.retry}</Button>
      )}
      <Button onClick={onDiscard}>{calendarText.discardChange}</Button>
    </div>
  );
}
