import {
  notificationDestinations,
  notificationHistoryLimit,
  notificationSeverities,
  notificationSources,
  notificationTextLimit,
} from "../../../contract/generated/contract";
export type Source = (typeof notificationSources)[number];
export type Destination = (typeof notificationDestinations)[number];
export interface NoticeInput {
  source: Source;
  severity: (typeof notificationSeverities)[number];
  dedupeKey: string;
  title: string;
  text: string;
  action?: Destination;
}
export interface Notice extends NoticeInput {
  id: string;
  occurredAt: number;
  unread: boolean;
}
export interface Center {
  records: Notice[];
  sequence: number;
}
export function publish(
  center: Center,
  input: NoticeInput,
  at: number,
  muted = false,
): Center {
  if (
    !notificationSources.some((value) => value === input.source) ||
    !notificationSeverities.some((value) => value === input.severity) ||
    (input.action !== undefined &&
      !notificationDestinations.some((value) => value === input.action)) ||
    !input.dedupeKey ||
    !input.title ||
    [input.title, input.text, input.dedupeKey].some(
      (value) =>
        typeof value !== "string" || value.length > notificationTextLimit,
    ) ||
    !Number.isSafeInteger(at) ||
    !Number.isFinite(new Date(at).getTime())
  )
    return center;
  const previous = center.records.find(
    (record) => record.dedupeKey === input.dedupeKey,
  );
  if (
    previous &&
    previous.source === input.source &&
    previous.title === input.title &&
    previous.text === input.text &&
    previous.severity === input.severity &&
    previous.action === input.action
  )
    return center;
  if (!previous && center.sequence === Number.MAX_SAFE_INTEGER) return center;
  const sequence = previous ? center.sequence : center.sequence + 1;
  const record: Notice = {
    ...input,
    id: previous?.id ?? `n-${sequence}`,
    occurredAt: at,
    unread: !muted,
  };
  return {
    sequence,
    records: [
      record,
      ...center.records.filter((value) => value.id !== record.id),
    ].slice(0, notificationHistoryLimit),
  };
}
export type Filter =
  | "all"
  | "unread"
  | "launcher"
  | "beta"
  | "report"
  | "system";
export function filtered(records: Notice[], filter: Filter, tester: boolean) {
  return records
    .filter(
      (record) =>
        (tester || record.source !== "beta") &&
        (filter === "all" ||
          (filter === "unread"
            ? record.unread
            : filter === "system"
              ? record.source === "system" || record.source === "updater"
              : filter === record.source)),
    )
    .sort((a, b) => b.occurredAt - a.occurredAt);
}
// Compare civil local dates, rather than elapsed milliseconds, across DST changes.
export function dateGroup(
  at: number,
  now: Date,
): "today" | "yesterday" | "week" | "earlier" | "undated" {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return "undated";
  const day = (value: Date) =>
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const days = (day(now) - day(date)) / 86_400_000;
  return days <= 0
    ? "today"
    : days === 1
      ? "yesterday"
      : days <= 6
        ? "week"
        : "earlier";
}
