// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { testingSummaryText as text } from "../src/renderer/i18n/testing-summary";
import {
  receiptTime,
  SessionReportReceipts,
} from "../src/renderer/ui/SessionReportReceipts";
import {
  TestingSummaryRail,
  TestingSummaryView,
} from "../src/renderer/ui/TestingSummaryView";

afterEach(cleanup);
it("opens the new report action and displays real account/session counts without global statistics", () => {
  const open = vi.fn();
  render(
    <>
      <TestingSummaryView onNewReport={open}>
        <div />
      </TestingSummaryView>
      <TestingSummaryRail count={3} receipts={2} />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: text.newReport }));
  expect(open).toHaveBeenCalledOnce();
  expect(screen.getByText(`3 ${text.contributions}`)).toBeTruthy();
  expect(screen.getByText(`2 ${text.receipts}`)).toBeTruthy();
  expect(screen.getByText(text.weekHelp)).toBeTruthy();
});
it("expands the receipt locally without claiming current server status or enabling unavailable support", () => {
  const refresh = vi.fn();
  render(
    <SessionReportReceipts
      receipts={[
        {
          title: "Un fallo del Hub",
          module: "hub",
          value: {
            id: "15350000-0000-0000-0000-000000000001",
            state: "submitted",
            createdAt: "2026-11-11T12:00:00Z",
            draftState: "cleared",
          },
        },
      ]}
      reports={[]}
      blocked={false}
      onRefresh={refresh}
      now={new Date("2026-11-11T13:00:00Z")}
    />,
  );
  const detail = screen.getByRole("button", {
    name: `${text.detail} Un fallo del Hub`,
  });
  expect(detail.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(detail);
  expect(detail.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText(text.privateReceipt)).toBeTruthy();
  expect(
    screen.getByRole("button", { name: text.support }).hasAttribute("disabled"),
  ).toBe(true);
  expect(refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: text.refreshReports }));
  expect(refresh).toHaveBeenCalledOnce();
});
it("formats receipt dates using the GPUI day labels and an explicit missing date", () => {
  const now = new Date(2026, 10, 11, 14, 0);
  expect(receiptTime(new Date(2026, 10, 11, 12, 5).toISOString(), now)).toBe(
    "Hoy 12:05",
  );
  expect(receiptTime(new Date(2026, 10, 10, 8, 9).toISOString(), now)).toBe(
    "Ayer 08:09",
  );
  expect(receiptTime(new Date(2026, 10, 9, 8, 9).toISOString(), now)).toBe(
    "lun 08:09",
  );
  expect(receiptTime(new Date(2026, 9, 30, 8, 9).toISOString(), now)).toBe(
    "30/10/2026 08:09",
  );
  expect(receiptTime("invalid", now)).toBe(text.missingDate);
});
