import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ScheduleImportSection } from "./ScheduleImportSection";

const listeners = new Map<string, (event: unknown) => void>();

vi.mock("@wailsio/runtime", () => ({
  Events: {
    Emit: vi.fn(),
    On: vi.fn((name: string, listener: (event: unknown) => void) => {
      listeners.set(name, listener);
      return () => listeners.delete(name);
    }),
  },
}));

vi.mock("../../lib/access", () => ({
  useAccess: () => ({
    planLabel: "free",
    planStatus: "active",
    roles: ["owner"],
    capabilities: ["vantare.operational.owner"],
    isBlocked: false,
    isUnconfigured: false,
  }),
}));

vi.mock("../orbit/use-calendar-starts", () => ({
  useCalendarStarts: () => ({ calendar: { series: [] }, starts: [], target: null }),
}));

const preview = {
  validFrom: "2026-08-25",
  validUntil: "2026-09-01",
  seriesCount: 1,
  sourceNotesCount: 0,
  series: [
    {
      id: "special-1",
      name: "8 Hours of Daytona",
      tier: "weekly",
      eventKind: "special",
      format: "team",
      licenseLabel: "SR B2",
      track: "Daytona (RC)",
      classes: ["Hypercar", "LMGT3"],
      raceMin: 480,
      eventDurationMin: 495,
      cadence: "3 días × 4 horas",
      recurrence: {
        kind: "weekly-slots",
        days: ["Fri", "Sat", "Sun"],
        timesUTC: ["03:00", "08:00", "13:00", "20:00"],
      },
      setup: "open",
      startOffsetMinute: 0,
      splits: 44,
      assists: "",
      tyreWarmers: false,
      tyres: 30,
      safetyRating: "SR B2",
      fairShare: true,
      forbiddenBadges: ["RookieDriver"],
      noteCount: 1,
    },
  ],
};

function mount() {
  return render(
    <I18nProvider>
      <ScheduleImportSection />
    </I18nProvider>,
  );
}

beforeEach(() => {
  listeners.clear();
  vi.mocked(Events.Emit).mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ScheduleImportSection", () => {
  it("loads the local inbox and sends the selected source to the real parser", async () => {
    mount();
    expect(Events.Emit).toHaveBeenCalledWith("schedule:draft:get");
    expect(Events.Emit).toHaveBeenCalledWith("schedule:discord:inbox:get");

    listeners.get("schedule:discord:inbox")?.({
      data: {
        candidates: [
          {
            messageId: "123",
            sourceHash: "hash",
            guildId: "guild",
            channelId: "channel",
            sourceText: "Daily Race Schedule from: 25th August 2026",
            receivedAt: "2026-08-25T12:00:00Z",
          },
        ],
      },
    });

    const candidate = await screen.findByRole("button", { name: /Mensaje Discord/ });
    fireEvent.click(candidate);
    expect(screen.getByTestId("orbit-settings-schedule-source")).toHaveValue(
      "Daily Race Schedule from: 25th August 2026",
    );
    expect(Events.Emit).toHaveBeenCalledWith("schedule:parse", {
      text: "Daily Race Schedule from: 25th August 2026",
    });
  });

  it("shows the parsed diff and keeps publication behind an explicit owner action", async () => {
    mount();
    listeners.get("schedule:discord:inbox")?.({
      data: {
        candidates: [
          {
            messageId: "123",
            sourceHash: "hash",
            guildId: "guild",
            channelId: "channel",
            sourceText: "source",
            receivedAt: "2026-08-25T12:00:00Z",
          },
        ],
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Mensaje Discord/ }));
    listeners.get("schedule:preview")?.({ data: preview });

    expect(screen.getByTestId("orbit-settings-schedule-source")).toHaveAttribute("readonly");
    expect(screen.getByTestId("orbit-settings-schedule-summary").textContent).toContain("1 series");
    expect(screen.getByTestId("orbit-settings-schedule-preview").textContent).toContain(
      "8 Hours of Daytona",
    );
    expect(screen.getByTestId("orbit-settings-schedule-preview").textContent).toContain("Hypercar, LMGT3");
    expect(screen.getByTestId("orbit-settings-schedule-preview").textContent).toContain("SR B2");
    expect(screen.getByTestId("orbit-settings-schedule-preview").textContent).toContain("reparto justo");

    fireEvent.click(screen.getByTestId("orbit-settings-schedule-save"));
    expect(Events.Emit).toHaveBeenCalledWith("schedule:draft:save", { text: "source" });
    expect(screen.getByTestId("orbit-settings-schedule-publish")).toBeDisabled();

    listeners.get("schedule:draft-saved")?.({ data: { draftId: "draft-1" } });
    await waitFor(() => expect(screen.getByTestId("orbit-settings-schedule-publish")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("orbit-settings-schedule-publish"));
    expect(Events.Emit).toHaveBeenCalledWith("schedule:publish", { draftId: "draft-1" });
    expect(within(screen.getByTestId("orbit-settings-schedule-preview")).getByText("reparto justo")).toBeTruthy();
  });
});
