// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CalendarIcsView } from "../src/contract/generated/calendar";
import { calendarIcsText as text } from "../src/renderer/i18n/calendarIcs";
import { CalendarIcsDialog } from "../src/renderer/ui/CalendarIcsDialog";
import { TooltipProvider } from "../src/renderer/ui/Layers";

const view: CalendarIcsView = {
  calendar: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
  preparedHash: "a".repeat(64),
  total: 1,
  validUntil: "2026-10-13T00:00:00Z",
  entries: [
    {
      seriesId: "qa",
      summary: "LMGT3 Fixed · Sebring",
      track: "Sebring",
      start: Date.parse("2026-10-08T18:00:00Z"),
      end: Date.parse("2026-10-08T18:30:00Z"),
    },
  ],
};
const props = {
  scope: "favs" as const,
  alarm: true,
  lead: 10,
  utc: true,
  view,
  busy: false,
  onScope: vi.fn(),
  onAlarm: vi.fn(),
  onRetry: vi.fn(),
  onDownload: vi.fn(),
  onClose: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(p: Parameters<typeof CalendarIcsDialog>[0] = props) {
  return render(
    <TooltipProvider>
      <CalendarIcsDialog {...p} />
    </TooltipProvider>,
  );
}
it("shows the native scope labels, published preview and current reminder lead", () => {
  show();
  expect(screen.getByRole("dialog", { name: text.title })).toBeTruthy();
  expect(screen.getByText(text.preview(1))).toBeTruthy();
  expect(screen.getByText(view.entries[0].summary)).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: text.scopes[1].label }));
  expect(props.onScope).toHaveBeenLastCalledWith("events");
  fireEvent.click(screen.getByRole("checkbox", { name: text.alarm }));
  expect(props.onAlarm).toHaveBeenLastCalledWith(false);
  expect(screen.getByText(text.alarmHint(10))).toBeTruthy();
  expect(props.onDownload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: text.download }));
  expect(props.onDownload).toHaveBeenCalledOnce();
});
it("prevents export without a preview and exposes explicit retry and cancel", () => {
  show({ ...props, view: undefined, failure: "calendarExportTooLarge" });
  expect(screen.getByRole("alert").textContent).toContain(
    text.error("calendarExportTooLarge"),
  );
  expect(
    screen
      .getByRole("button", { name: text.download })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: text.retry }));
  expect(props.onRetry).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: text.cancel }));
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(props.onDownload).not.toHaveBeenCalled();
});
it("keeps the conflict explanation readable and freezes options while busy", () => {
  show({ ...props, busy: true, status: "conflict" });
  expect(screen.getByText(text.conflict)).toBeTruthy();
  for (const radio of screen.getAllByRole("radio"))
    expect(radio.getAttribute("aria-disabled")).toBe("true");
  expect(
    screen
      .getByRole("button", { name: text.download })
      .getAttribute("aria-disabled"),
  ).toBe("true");
});

it.each(["calendarExportExtension", "rejected"] as const)(
  "explains %s without enabling a consumed preparation",
  (failure) => {
    show({ ...props, view: undefined, failure });
    expect(screen.getByRole("alert").textContent).toContain(
      text.error(failure),
    );
    expect(
      screen
        .getByRole("button", { name: text.download })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: text.retry }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  },
);

it("keeps an option focused while preparing and blocks repeated changes", () => {
  const result = show();
  const option = screen.getByRole("radio", { name: text.scopes[0].label });
  option.focus();
  result.rerender(
    <TooltipProvider>
      <CalendarIcsDialog {...props} busy view={undefined} />
    </TooltipProvider>,
  );
  expect(document.activeElement).toBe(option);
  expect(option.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(screen.getByRole("radio", { name: text.scopes[1].label }));
  fireEvent.click(screen.getByRole("checkbox", { name: text.alarm }));
  fireEvent.click(screen.getByRole("button", { name: text.download }));
  expect(props.onScope).not.toHaveBeenCalled();
  expect(props.onAlarm).not.toHaveBeenCalled();
  expect(props.onDownload).not.toHaveBeenCalled();
  expect(screen.queryByText(text.preview(0))).toBeNull();
  expect(screen.getByText(text.previewPending)).toBeTruthy();
});

it("moves focus out of the retry alert before it unmounts", () => {
  const result = show({ ...props, view: undefined, failure: "io" });
  const retry = screen.getByRole("button", { name: text.retry });
  retry.focus();
  fireEvent.click(retry);
  const download = screen.getByRole("button", { name: text.download });
  expect(document.activeElement).toBe(download);
  result.rerender(
    <TooltipProvider>
      <CalendarIcsDialog {...props} busy view={undefined} />
    </TooltipProvider>,
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(document.activeElement).toBe(download);
  const description = document.getElementById(
    download.getAttribute("aria-describedby") ?? "",
  );
  expect(description?.textContent).toBe(text.expiry);
  expect(description?.className).not.toContain("sr-only");
});
it("ignores cancel, close and Escape while main is exporting", async () => {
  show({ ...props, busy: true, exporting: true });
  for (const name of [text.cancel, text.close]) {
    const button = screen.getByRole("button", { name });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
  }
  fireEvent.keyDown(screen.getByRole("dialog"), {
    key: "Escape",
    code: "Escape",
  });
  await Promise.resolve();
  expect(props.onClose).not.toHaveBeenCalled();
});
it("renders markup in a summary as literal text", () => {
  show({
    ...props,
    view: {
      ...view,
      entries: [{ ...view.entries[0], summary: "<b>Serie local</b>" }],
    },
  });
  expect(screen.getByText("<b>Serie local</b>")).toBeTruthy();
  expect(document.querySelector(".v-calendar-ics-entry b")).toBeNull();
});
