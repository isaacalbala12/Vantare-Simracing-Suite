import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_WIDGET_TYPES } from "../overlay/core/profile-document";
import { createScenarioWidget } from "../overlay/authoring/fixtures/authoring-v2-workshop-frame";
import { OverlayParityHarness, OverlayParityHarnessPage } from "./OverlayParityHarness";
import { parseHarnessQuery } from "./overlay-parity-query";
import { readRendererMarkup } from "./parity-html";
import { getOverlayV2ViewModelEntry } from "../overlay/core/overlay-v2-view-models";

afterEach(() => cleanup());

type StandingsColumns = { metricId?: string; enabled?: boolean }[];

function standingsColumns(variant: "standings-multiclass" | "standings-minimal" | "standings-all-columns"): StandingsColumns {
  const widget = createScenarioWidget({
    widget: "standings",
    system: "vantare-original",
    variant,
  });
  const columns = (widget.content as Record<string, unknown>).columns;
  expect(Array.isArray(columns)).toBe(true);
  return columns as StandingsColumns;
}

describe("parseHarnessQuery", () => {
  it("defaults to Delta Original race track ready harness", () => {
    expect(parseHarnessQuery("")).toEqual({
      widget: "delta",
      system: "vantare-original",
      session: "race",
      location: "track",
      state: "ready",
      surface: "harness",
      variant: "default",
    });
  });

  it("accepts the Parity content variants", () => {
    expect(parseHarnessQuery("?widget=relative&variant=relative-fill")).toMatchObject({
      widget: "relative",
      variant: "relative-fill",
    });
    expect(parseHarnessQuery("?widget=standings&variant=standings-multiclass")).toMatchObject({
      widget: "standings",
      variant: "standings-multiclass",
    });
    expect(parseHarnessQuery("?widget=standings&variant=standings-minimal")).toMatchObject({
      widget: "standings",
      variant: "standings-minimal",
    });
    expect(parseHarnessQuery("?widget=standings&variant=standings-all-columns")).toMatchObject({
      widget: "standings",
      variant: "standings-all-columns",
    });
  });

  it("rejects telemetry-fabricating variants as invalid variant", () => {
    for (const variant of [
      "relative-multiclass",
      "standings-stress60",
      "standings-replay",
      "pedals-zero",
      "pedals-full",
    ]) {
      const widget =
        variant === "relative-multiclass" ? "relative" : variant.startsWith("standings") ? "standings" : "pedals";
      expect(parseHarnessQuery(`?widget=${widget}&variant=${variant}`)).toEqual({
        error: `invalid variant parameter: ${variant}`,
      });
    }
  });

  it("rejects standings variants on other widgets", () => {
    for (const variant of ["standings-multiclass", "standings-minimal", "standings-all-columns"]) {
      expect(parseHarnessQuery(`?widget=delta&variant=${variant}`)).toEqual({
        error: `${variant} variant requires widget=standings`,
      });
    }
  });

  it("rejects engineer-radio outside vantare-crystal like Workshop", () => {
    expect(parseHarnessQuery("?widget=engineer-radio&system=vantare-original")).toEqual({
      error: "engineer-radio requires system=vantare-crystal",
    });
  });

  it("accepts each canonical Crystal design only with its functional widget type", () => {
    expect(
      parseHarnessQuery("?widget=delta&system=vantare-crystal&design=delta-crystal-simple"),
    ).toMatchObject({
      widget: "delta",
      design: { designId: "delta-crystal-simple", widgetType: "delta", width: 420, height: 69 },
    });
    expect(
      parseHarnessQuery("?widget=pedals&system=vantare-crystal&design=delta-crystal-simple"),
    ).toEqual({ error: "design delta-crystal-simple requires widget=delta" });
  });

  it("rejects invalid query values with explicit errors", () => {
    expect(parseHarnessQuery("?widget=telemetry")).toEqual({
      error: "invalid widget parameter: telemetry",
    });
    expect(parseHarnessQuery("?variant=relative-fill&widget=delta")).toEqual({
      error: "relative-fill variant requires widget=relative",
    });
  });
});

describe("createScenarioWidget", () => {
  it("throws on non-canonical variants even when cast", () => {
    expect(() =>
      createScenarioWidget({
        widget: "pedals",
        system: "vantare-original",
        variant: "no-such-variant" as "default",
      }),
    ).toThrow(/variante no soportada/);
  });

  it("applies the resolved design dimensions", () => {
    const widget = createScenarioWidget({
      widget: "delta",
      system: "vantare-crystal",
      variant: "default",
      designId: "delta-crystal-simple",
    });
    expect(widget.layout).toMatchObject({ x: 120, y: 96, zIndex: 1, w: 420, h: 69 });
  });

  it("applies relative fill with a minimum frame height", () => {
    const widget = createScenarioWidget({
      widget: "relative",
      system: "vantare-original",
      variant: "relative-fill",
    });
    expect((widget.content as Record<string, unknown>).rowHeightMode).toBe("fill");
    expect(widget.layout.h).toBeGreaterThanOrEqual(320);
    expect(widget.layout).toMatchObject({ x: 120, y: 96, zIndex: 1 });
  });

  it("selects the multiclass field with bestLap on for standings-multiclass", () => {
    const widget = createScenarioWidget({
      widget: "standings",
      system: "vantare-original",
      variant: "standings-multiclass",
    });
    expect((widget.content as Record<string, unknown>).classScope).toBe("all-classes");
    expect(standingsColumns("standings-multiclass").find((column) => column.metricId === "bestLap")).toMatchObject({
      enabled: true,
    });
  });

  it("keeps only position and driverName on for standings-minimal", () => {
    for (const column of standingsColumns("standings-minimal")) {
      expect(column.enabled).toBe(column.metricId === "position" || column.metricId === "driverName");
    }
  });

  it("enables every column for standings-all-columns", () => {
    const columns = standingsColumns("standings-all-columns");
    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns) {
      expect(column.enabled).toBe(true);
    }
  });
});

describe("OverlayParityHarness", () => {
  it("renders a fixed 1920x1080 stage with the default Delta host", () => {
    const parsed = parseHarnessQuery("");
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    render(<OverlayParityHarness query={parsed} />);
    const stage = document.querySelector("[data-overlay-parity-stage]") as HTMLElement;
    expect(stage.style.width).toBe("1920px");
    expect(stage.style.height).toBe("1080px");
    expect(document.querySelector('[data-widget-system="vantare-original"]')).toBeTruthy();
  });

  it("renders each default widget marker", () => {
    expect(ALL_WIDGET_TYPES).toHaveLength(20);
    for (const widget of ALL_WIDGET_TYPES) {
      cleanup();
      const parsed = parseHarnessQuery(`?widget=${widget}`);
      if ("error" in parsed) {
        throw new Error(parsed.error);
      }
      render(<OverlayParityHarness query={parsed} />);
      expect(document.querySelector(`[data-widget-renderer="${widget}"]`)).toBeTruthy();
    }
  });

  it.each([
    "?widget=relative&variant=relative-fill",
    "?widget=standings&variant=standings-multiclass",
    "?widget=standings&variant=standings-minimal",
    "?widget=standings&variant=standings-all-columns",
  ])("keeps content variant %s rendering its renderer", (search) => {
    const parsed = parseHarnessQuery(search);
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    render(<OverlayParityHarness query={parsed} />);
    expect(document.querySelector(`[data-widget-renderer="${parsed.widget}"]`)).toBeTruthy();
  });

  it("keeps the exact Crystal contract dimensions for official designs", () => {
    const parsed = parseHarnessQuery(
      "?widget=delta&system=vantare-crystal&design=delta-crystal-simple",
    );
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    render(<OverlayParityHarness query={parsed} />);
    const frame = document.querySelector("[data-overlay-parity-widget-frame]") as HTMLElement;
    expect(frame.style.width).toBe("420px");
    expect(frame.style.height).toBe("69px");
    expect(document.querySelector('[data-widget-renderer="delta"]')).toBeTruthy();
  });

  it("switches only the host render mode label for surface changes", () => {
    const parsed = parseHarnessQuery("?surface=obs");
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    render(<OverlayParityHarness query={parsed} />);
    expect(screen.getByText("obs")).toBeTruthy();
    expect(document.querySelector('[data-widget-renderer="delta"]')).toBeTruthy();
  });

  it("uses the deterministic Input history from the canonical V2 frame", () => {
    const parsed = parseHarnessQuery(
      "?widget=input-telemetry&system=vantare-crystal&design=input-crystal-blade",
    );
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    render(<OverlayParityHarness query={parsed} />);
    expect(document.querySelector(".vc-input-graph path")?.getAttribute("d")).toContain("L");
  });

  it.each(ALL_WIDGET_TYPES)(
    "keeps %s runtime markup identical while Studio may label an explicit preview",
    (widget) => {
      const surfaces = ["studio", "desktop", "obs"] as const;
      const markups: string[] = [];

      for (const surface of surfaces) {
        cleanup();
        const parsed = parseHarnessQuery(`?widget=${widget}&surface=${surface}`);
        if ("error" in parsed) {
          throw new Error(parsed.error);
        }
        const view = render(<OverlayParityHarness query={parsed} />);
        const markup = readRendererMarkup(view.container, widget);
        expect(markup).toBeTruthy();
        markups.push(markup!);
      }

      expect(markups[1]).toBe(markups[2]);
      if (widget === "engineer-radio") {
        expect(markups[0]).toContain('data-preview="true"');
        expect(markups[0]).toContain("PREVIEW");
        expect(markups[1]).not.toContain("data-preview");
      } else {
        expect(markups[0]).toBe(markups[1]);
      }
    },
  );

  it("renders all widgets in stale/disconnected/error states", () => {
    for (const widget of ALL_WIDGET_TYPES) {
      for (const state of ["stale", "disconnected", "error"] as const) {
        cleanup();
        const parsed = parseHarnessQuery(`?widget=${widget}&state=${state}&surface=obs`);
        if ("error" in parsed) {
          throw new Error(parsed.error);
        }
        render(<OverlayParityHarness query={parsed} />);
        const renderer = document.querySelector(`[data-widget-renderer="${widget}"]`);
        if (widget === "engineer-radio" || (state === "error" && getOverlayV2ViewModelEntry(widget))) {
          expect(renderer).toBeNull();
        } else {
          expect(renderer).toBeTruthy();
        }
      }
    }
  });

  it("renders parameter errors explicitly", () => {
    render(<OverlayParityHarnessPage search="?state=broken" />);
    expect(screen.getByRole("alert").textContent).toMatch(/invalid state/i);
  });
});
