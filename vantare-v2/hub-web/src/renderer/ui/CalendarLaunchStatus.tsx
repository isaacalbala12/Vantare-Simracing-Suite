import type { ReactNode } from "react";
import {
  type CalendarLaunchView,
  calendarLaunchLeadMs,
} from "../../contract/generated/calendar";
import { Icon } from "../assets/icons/Icon";
import {
  calendarLaunchStops,
  calendarLaunchUnknowns,
  calendarLaunchText as text,
} from "../i18n/calendarLaunch";
import { Button } from "./Button";
import { clock } from "./calendarDate";
import "./calendar-launch.css";

function LaunchNotice({
  title,
  children,
  actions,
  tone = "info",
  latest = false,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: "info" | "warn";
  latest?: boolean;
}) {
  return (
    <div
      className={`v-callout v-callout--${tone} v-calendar-launch-notice`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-calendar-launch-result={latest || undefined}
    >
      <Icon name="clock" />
      <div>
        <strong>{title}</strong>
        <div>{children}</div>
      </div>
      {actions}
    </div>
  );
}
export function CalendarLaunchStatus({
  value,
  busy,
  utc,
  onCancel,
}: {
  value: CalendarLaunchView | undefined;
  busy: boolean;
  utc: boolean;
  onCancel: (id: string) => void;
}) {
  if (!value) return null;
  const latest = value.latest;
  const progress = latest?.progress;
  const summary =
    progress?.kind === "queued"
      ? text.queued
      : progress?.kind === "running"
        ? text.running
        : progress?.kind === "unknown"
          ? `${text.unknown} ${calendarLaunchUnknowns[progress.reason]}`
          : progress?.kind === "notSent"
            ? calendarLaunchStops[progress.reason]
            : progress?.kind === "rejected"
              ? text.rejected
              : progress?.kind === "finished"
                ? progress.outcome.kind === "completed"
                  ? text.completed
                  : progress.outcome.kind === "cancelled"
                    ? text.cancelled
                    : progress.outcome.reason === "decision-expired"
                      ? text.expiredDecision
                      : text.failed
                : undefined;
  return (
    <>
      {[value.armed, value.automatic].map(
        (plan) =>
          plan && (
            <LaunchNotice
              key={plan.armId}
              title={
                plan.mode.kind === "once"
                  ? text.armed(
                      plan.profileName,
                      clock(plan.mode.startAt - calendarLaunchLeadMs, utc),
                    )
                  : text.automatic(plan.profileName)
              }
              actions={
                <Button
                  aria-label={
                    plan.mode.kind === "once"
                      ? text.cancelOnce
                      : text.cancelAutomatic
                  }
                  size="sm"
                  aria-disabled={busy}
                  onClick={() => {
                    if (!busy) onCancel(plan.armId);
                  }}
                >
                  {text.cancel}
                </Button>
              }
            >
              <p>{text.onlyOpen}</p>
              {plan.decisionRequired && <p>{text.ask}</p>}
            </LaunchNotice>
          ),
      )}
      {value.change && (
        <p role="status">{calendarLaunchStops[value.change.reason]}</p>
      )}
      {summary && (
        <LaunchNotice
          latest
          title={summary}
          tone={
            progress?.kind === "unknown" ||
            progress?.kind === "notSent" ||
            progress?.kind === "rejected"
              ? "warn"
              : "info"
          }
        >
          {latest?.profileName}
          {(progress?.kind === "queued" ||
            progress?.kind === "running" ||
            progress?.kind === "unknown") && <p>{text.sentCannotCancel}</p>}
        </LaunchNotice>
      )}
    </>
  );
}
