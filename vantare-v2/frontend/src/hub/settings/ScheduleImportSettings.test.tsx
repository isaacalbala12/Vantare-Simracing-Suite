import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Events } from "@wailsio/runtime";
import { ScheduleImportSettings, type SchedulePreview } from "./ScheduleImportSettings";

// The Wails runtime is mocked at the module level in this suite so the
// component can be driven purely by the events it claims to speak.
vi.mock("@wailsio/runtime", () => {
  const handlers = new Map<string, ((event: { data: unknown }) => void)[]>();
  return {
    Events: {
      On: (name: string, handler: (event: { data: unknown }) => void) => {
        const list = handlers.get(name) ?? [];
        list.push(handler);
        handlers.set(name, list);
        return () => {
          handlers.set(
            name,
            (handlers.get(name) ?? []).filter((h) => h !== handler),
          );
        };
      },
      Emit: vi.fn(),
      __dispatch: (name: string, data: unknown) => {
        for (const handler of handlers.get(name) ?? []) handler({ data });
      },
      __reset: () => handlers.clear(),
    },
  };
});

type MockEvents = typeof Events & {
  __dispatch: (name: string, data: unknown) => void;
  __reset: () => void;
};

const mockEvents = Events as MockEvents;

/** Delivers a backend event the way the runtime would, inside React's act. */
function dispatch(name: string, data: unknown): void {
  act(() => {
    mockEvents.__dispatch(name, data);
  });
}

const preview: SchedulePreview = {
  validFrom: "2026-08-04",
  validUntil: "2026-08-11",
  seriesCount: 2,
  series: [
    {
      id: "beginner-lmgt3-fixed",
      name: "LMGT3 Fixed",
      tier: "beginner",
      track: "Bahrain (Outer)",
      classes: ["LMGT3"],
      raceMin: 20,
      cadence: "cada 15min",
      setup: "fixed",
      noteCount: 0,
    },
    {
      id: "weekly-le-mans-24h-scaled",
      name: "2.4h Le Mans",
      tier: "weekly",
      track: "Le Mans (WEC)",
      classes: ["Hypercar", "LMP2 (WEC)", "LMGT3"],
      raceMin: 144,
      cadence: "3 días × 8 horas",
      setup: "open",
      timeScale: 10,
      safetyRating: "SR S2",
      noteCount: 1,
    },
  ],
};

beforeEach(() => {
  mockEvents.__reset();
  vi.mocked(Events.Emit).mockClear();
});

afterEach(cleanup);

describe("ScheduleImportSettings", () => {
  it("asks for a pending draft as soon as it opens", () => {
    render(<ScheduleImportSettings />);
    expect(Events.Emit).toHaveBeenCalledWith("schedule:draft:get");
  });

  it("will not interpret an empty paste", () => {
    render(<ScheduleImportSettings />);
    expect(screen.getByTestId<HTMLButtonElement>("schedule-import-parse").disabled).toBe(true);
  });

  it("sends the pasted text to be interpreted", () => {
    render(<ScheduleImportSettings />);

    fireEvent.change(screen.getByTestId("schedule-import-text"), {
      target: { value: "Daily Race Schedule from: 4th August 2026" },
    });
    fireEvent.click(screen.getByTestId("schedule-import-parse"));

    expect(Events.Emit).toHaveBeenCalledWith("schedule:parse", {
      text: "Daily Race Schedule from: 4th August 2026",
    });
  });

  it("shows what the parser understood, rules included", () => {
    render(<ScheduleImportSettings />);
    dispatch("schedule:preview", preview);

    expect(screen.getByTestId("schedule-import-preview")).toBeTruthy();
    const leMans = screen.getByTestId("schedule-import-row-weekly-le-mans-24h-scaled");
    expect(leMans.textContent).toContain("Le Mans (WEC)");
    expect(leMans.textContent).toContain("Hypercar");
    expect(leMans.textContent).toContain("LMP2 (WEC)");
    expect(leMans.textContent).toContain("10x");
    expect(leMans.textContent).toContain("SR S2");
    expect(leMans.textContent).toContain("aviso");
  });

  it("cannot publish before there is a draft to publish", () => {
    render(<ScheduleImportSettings />);
    dispatch("schedule:preview", preview);

    expect(screen.getByTestId<HTMLButtonElement>("schedule-import-publish").disabled).toBe(true);
  });

  it("only enables publishing once the draft is saved", () => {
    render(<ScheduleImportSettings />);
    dispatch("schedule:preview", preview);
    dispatch("schedule:draft-saved", { draftId: "draft-1" });

    const publish = screen.getByTestId<HTMLButtonElement>("schedule-import-publish");
    expect(publish.disabled).toBe(false);

    fireEvent.click(publish);
    expect(Events.Emit).toHaveBeenCalledWith("schedule:publish", { draftId: "draft-1" });
  });

  it("restores an interrupted review from a pending draft", () => {
    render(<ScheduleImportSettings />);
    dispatch("schedule:draft", {
      draftId: "draft-7",
      sourceText: "Daily Race Schedule from: 4th August 2026",
      preview,
    });

    expect(screen.getByTestId<HTMLTextAreaElement>("schedule-import-text").value).toContain(
      "4th August 2026",
    );
    expect(screen.getByTestId("schedule-import-preview")).toBeTruthy();
    expect(screen.getByTestId<HTMLButtonElement>("schedule-import-publish").disabled).toBe(false);
  });

  it("says why a paste was rejected instead of failing quietly", () => {
    render(<ScheduleImportSettings />);
    dispatch("schedule:error", { message: "Necesitas rol owner para importar el horario" });

    expect(screen.getByTestId("schedule-import-error").textContent).toBe(
      "Necesitas rol owner para importar el horario",
    );
  });

  it("clears the draft once it is published so it cannot go out twice", () => {
    render(<ScheduleImportSettings />);
    dispatch("schedule:draft-saved", { draftId: "draft-1" });
    dispatch("schedule:published", { draftId: "draft-1" });

    expect(screen.getByTestId<HTMLButtonElement>("schedule-import-publish").disabled).toBe(true);
    expect(screen.getByTestId("schedule-import-status").textContent).toContain("Publicado");
  });
});
