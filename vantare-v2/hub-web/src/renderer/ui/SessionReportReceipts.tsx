import { useState } from "react";
import {
  type ReportReceiptView,
  reportModules,
} from "../../contract/generated/contract";
import { testingSummaryText as text } from "../i18n/testing-summary";
import { Button } from "./Button";
import { TestingCard, TestingFinePrint } from "./TestingLayout";

export function receiptTime(value: string, now: Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return text.missingDate;
  const dayNumber = (day: Date) =>
    Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86400000;
  const age = dayNumber(now) - dayNumber(date);
  const pad = (value: number) => String(value).padStart(2, "0");
  const day =
    age === 0
      ? text.today
      : age === 1
        ? text.yesterday
        : age >= 2 && age <= 6
          ? text.weekdays[date.getDay()]
          : `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
