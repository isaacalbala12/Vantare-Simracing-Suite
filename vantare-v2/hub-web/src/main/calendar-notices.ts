import type { CalendarNotice } from "../contract/generated/calendar";
import {
  calendarNoticeClockSkewMs,
  calendarNoticePresentationLimit,
} from "../contract/generated/calendar";
import type { HostToUi } from "../contract/generated/contract";
import { calendarNoticeText } from "../renderer/i18n/calendar-notices";
import type { SystemNotice } from "./system-notifications";
/** Lives with the window, independent of mounted screen and renderer ports. */
export function calendarNoticeSession(
  present: (value: SystemNotice) => boolean,
  clock = Date.now,
) {
  let closed = false;
  const seen = new Map<string, number>();
  const tests = new Map<number, boolean>();
  function receive(value: CalendarNotice) {
    if (closed) return;
    const now = clock();
    for (const [id, until] of seen) if (until < now) seen.delete(id);
    if (
      value.issuedAt > now + calendarNoticeClockSkewMs ||
      value.expiresAt < now ||
      seen.has(value.id)
    )
      return;
    if (seen.size >= calendarNoticePresentationLimit) return;
    seen.set(value.id, value.expiresAt);
    const accepted = present({
      ...calendarNoticeText(value, Math.max(now, value.issuedAt)),
      silent: value.silent,
    });
    if (value.kind === "test") {
      if (tests.size >= calendarNoticePresentationLimit)
        tests.delete(tests.keys().next().value ?? 0);
      tests.set(value.requestId, accepted);
    }
  }
  return {
    receive,
    observe(message: HostToUi): HostToUi | undefined {
      if (message.kind === "event" && message.event.topic === "calendarNotice")
        return undefined;
      if (
        message.kind === "response" &&
        message.result.method === "calendar.noticeTest"
      ) {
        const accepted = tests.get(message.id) ?? false;
        tests.delete(message.id);
        return {
          ...message,
          result: { method: "calendar.noticeTest", accepted },
        };
      }
      if (message.kind === "failure") tests.delete(message.id);
      return message;
    },
    close() {
      closed = true;
      seen.clear();
      tests.clear();
    },
  };
}
