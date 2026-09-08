import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function requestId(name: string) { return (vi.mocked(Events.Emit).mock.calls.filter(call => call[0] === name).at(-1)?.[1] as {requestId?: string})?.requestId; }

function mount(candidateTarget?: string) {
  return render(
    <I18nProvider>
      <ScheduleImportSection candidateTarget={candidateTarget} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  listeners.clear();
  localStorage.clear();
  vi.mocked(Events.Emit).mockClear();
});

afterEach(() => {
  cleanup();
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
    expect((screen.getByTestId("orbit-settings-schedule-source") as HTMLTextAreaElement).value).toBe(
      "Daily Race Schedule from: 25th August 2026",
    );
    expect(Events.Emit).toHaveBeenCalledWith("schedule:parse", {
      text: "Daily Race Schedule from: 25th August 2026", requestId: expect.any(String),
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
    await act(async () => {
      listeners.get("schedule:preview")?.({ data: {...preview, requestId: requestId("schedule:parse")} });
    });

    expect((screen.getByTestId("orbit-settings-schedule-source") as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.getByTestId("orbit-settings-schedule-summary").textContent).toContain("1 series");
    expect(screen.getByTestId("orbit-settings-schedule-preview").textContent).toContain(
      "8 Hours of Daytona",
    );
    expect(screen.getByTestId("orbit-settings-schedule-preview").textContent).toContain("Hypercar, LMGT3");
    expect(screen.getByTestId("orbit-settings-schedule-preview").textContent).toContain("SR B2");
    expect(screen.getByTestId("orbit-settings-schedule-preview").textContent).toContain("reparto justo");

    fireEvent.click(screen.getByTestId("orbit-settings-schedule-save"));
    expect(Events.Emit).toHaveBeenCalledWith("schedule:draft:save", { text: "source", requestId: expect.any(String) });
    expect((screen.getByTestId("orbit-settings-schedule-publish") as HTMLButtonElement).disabled).toBe(true);

    listeners.get("schedule:draft-saved")?.({ data: { draftId: "draft-1", requestId: requestId("schedule:draft:save") } });
    await waitFor(() =>
      expect((screen.getByTestId("orbit-settings-schedule-publish") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId("orbit-settings-schedule-publish"));
    expect(Events.Emit).toHaveBeenCalledWith("schedule:publish", { draftId: "draft-1" });
    expect(within(screen.getByTestId("orbit-settings-schedule-preview")).getByText("reparto justo")).toBeTruthy();
  });
});

it("abre el candidato del aviso y solo publica tras aceptarlo y recibir su borrador", async () => {
  mount("123:hash");
  await act(async () => listeners.get("schedule:discord:inbox")?.({data:{candidates:[{messageId:"123",sourceHash:"hash",sourceText:"source",receivedAt:"2026-09-08T00:00:00Z"}]}}));
  expect(Events.Emit).toHaveBeenCalledWith("schedule:parse",{text:"source",requestId:expect.any(String)});
  await act(async () => listeners.get("schedule:preview")?.({data:{...preview,requestId:"stale"}}));
  expect(screen.queryByTestId("orbit-settings-schedule-preview")).toBeNull();
  await act(async () => listeners.get("schedule:preview")?.({data:{...preview,requestId:requestId("schedule:parse")}}));
  expect(vi.mocked(Events.Emit).mock.calls.some(c=>c[0]==="schedule:publish")).toBe(false);
  fireEvent.click(screen.getByRole("button",{name:"Aceptar y publicar"}));
  await act(async () => listeners.get("schedule:draft-saved")?.({data:{draftId:"wrong",requestId:"stale"}}));
  expect(vi.mocked(Events.Emit).mock.calls.some(c=>c[0]==="schedule:publish")).toBe(false);
  await act(async () => listeners.get("schedule:draft-saved")?.({data:{draftId:"right",requestId:requestId("schedule:draft:save")}}));
  expect(Events.Emit).toHaveBeenCalledWith("schedule:publish",{draftId:"right"});
  await act(async () => listeners.get("schedule:published")?.({data:{draftId:"wrong"}}));
  expect(localStorage.getItem("vantare.calendar.published-candidate")).toBeNull();
  await act(async () => listeners.get("schedule:error")?.({data:{message:"publication failed",requestId:"right"}}));
  expect(localStorage.getItem("vantare.calendar.published-candidate")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Aceptar y publicar"}));
  await act(async () => listeners.get("schedule:published")?.({data:{draftId:"right"}}));
  expect(localStorage.getItem("vantare.calendar.published-candidate")).toBe("123:hash");
  expect((screen.getByRole("button",{name:"Aceptar y publicar"}) as HTMLButtonElement).disabled).toBe(true);
});
