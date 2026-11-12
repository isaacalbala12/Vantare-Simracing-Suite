import fixture from "../../../../native/hub/reference/fixtures/notifications-r8.json";
import {
  notificationDestinations,
  notificationSeverities,
  notificationSources,
} from "../../contract/generated/notifications";
import type { NoticeInput } from "../screens/notifications/center";

/** QA-only: the five visible records of the frozen GPUI bank, never real events. */
export function notificationScene(scene?: string, now = new Date()) {
  const name =
    scene ??
    (typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("escena"));
  if (name !== "notificaciones-cinco") return [];
  const records = fixture.slice(0, 5);
  // The bank uses Paris civil time; preserve its labels on any QA host/date.
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const civil = (at: number) => {
    const parts = clock.formatToParts(at);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    return {
      day: Date.UTC(value("year"), value("month") - 1, value("day")),
      hour: value("hour"),
      minute: value("minute"),
    };
  };
  const latest = Math.max(
    ...records.map((record) => civil(record.occurredAt).day),
  );
  return records.map((record) => {
    const source = notificationSources.find(
      (source) => source === record.source,
    );
    const severity = notificationSeverities.find(
      (severity) => severity === record.severity,
    );
    const target = record.action?.target;
    const action = notificationDestinations.find(
      (destination) => destination === target,
    );
    if (!source || !severity || (target && !action))
      throw new Error("Invalid notification bank fixture");
    const time = civil(record.occurredAt);
    const at = new Date(now);
    at.setDate(at.getDate() - (latest - time.day) / 86_400_000);
    at.setHours(time.hour, time.minute, 0, 0);
    const input: NoticeInput = {
      source,
      severity,
      action,
      dedupeKey: record.dedupeKey,
      title: record.titleKey,
      text: record.textKey,
    };
    return { input, at: at.getTime(), muted: !record.unread };
  });
}

declare const __VANTARE_RENDERER_MOCK__: boolean;
/** Capture-only seeding stays at the QA boundary; production compiles to a no-op. */
export function seedNotificationScene(
  add: (input: NoticeInput, at: number, muted: boolean) => void,
) {
  if (__VANTARE_RENDERER_MOCK__)
    for (const { input, at, muted } of notificationScene())
      add(input, at, muted);
}
