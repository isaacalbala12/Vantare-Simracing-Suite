import { useState } from "react";
import {
  type ReportReceiptView,
  reportModules,
} from "../../contract/generated/contract";
import { testingSummaryText as text } from "../i18n/testing-summary";
import { Button } from "./Button";
import { TestingCard, TestingFinePrint } from "./TestingLayout";

export function receiptTime(value: string, now: Date) {
  const stamp =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  const parsed = new Date(value);
  if (!stamp || !Number.isFinite(parsed.getTime())) return text.missingDate;
  const [, year, month, dayOfMonth, hour, minute] = stamp.map(Number);
  const daysInMonth = new Date(Date.UTC(year + 400, month, 0)).getUTCDate();
  if (
    month < 1 ||
    month > 12 ||
    dayOfMonth < 1 ||
    dayOfMonth > daysInMonth ||
    hour > 23 ||
    minute > 59
  )
    return text.missingDate;
  // GPUI uses the session's current fixed offset, including for older receipts.
  const offset = now.getTimezoneOffset() * 60_000;
  const date = new Date(parsed.getTime() - offset);
  const current = new Date(now.getTime() - offset);
  const dayNumber = (day: Date) => Math.floor(day.getTime() / 86400000);
  const age = dayNumber(current) - dayNumber(date);
  const pad = (value: number) => String(value).padStart(2, "0");
  const day =
    age === 0
      ? text.today
      : age === 1
        ? text.yesterday
        : age >= 2 && age <= 6
          ? text.weekdays[date.getUTCDay()]
          : `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${String(date.getUTCFullYear()).padStart(4, "0")}`;
  return `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function SessionReportReceipts({
  receipts,
  reports,
  blocked,
  onRefresh,
  now = new Date(),
}: {
  receipts: { value: ReportReceiptView; title: string; module: string }[];
  reports: { id: string; title: string; state: string }[];
  blocked: boolean;
  onRefresh: () => void;
  now?: Date;
}) {
  const [expanded, setExpanded] = useState<string>();
  return (
    <TestingCard title={text.sessionReports}>
      {receipts.map(({ value, title, module }) => (
        <div className="v-testing-receipt" key={value.id}>
          <button
            type="button"
            aria-expanded={expanded === value.id}
            aria-label={`${text.detail} ${title || text.missingTitle}`}
            onClick={() =>
              setExpanded(expanded === value.id ? undefined : value.id)
            }
          >
            <strong>{title || text.missingTitle}</strong>
            <TestingFinePrint>{value.id}</TestingFinePrint>
            <span>
              {reportModules.find(([id]) => id === module)?.[1] ??
                text.missingModule}
              {text.separator}
              {receiptTime(value.createdAt, now)}
              {text.separator}
              {value.state === "submitted" ? text.received : text.unknownState}
            </span>
          </button>
          {expanded === value.id && (
            <div>
              <p>{text.privateReceipt}</p>
              <p>{text.conversation}</p>
              <Button disabled title={text.supportHelp}>
                {text.support}
              </Button>
            </div>
          )}
        </div>
      ))}
      {reports.map((report) => (
        <p key={report.id}>
          {report.title}
          {text.separator}
          {text.states[report.state as keyof typeof text.states] ??
            text.unknownState}
        </p>
      ))}
      <Button disabled={blocked} onClick={onRefresh}>
        {text.refreshReports}
      </Button>
      <TestingFinePrint>{text.receiptHelp}</TestingFinePrint>
    </TestingCard>
  );
}
