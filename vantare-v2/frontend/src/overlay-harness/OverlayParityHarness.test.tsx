import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildHarnessTelemetry, buildHarnessViewModel, buildHarnessWidget } from "./harness-fixtures";
import {
  HARNESS_WIDGETS,
  OverlayParityHarness,
  OverlayParityHarnessPage,
  parseHarnessQuery,
} from "./OverlayParityHarness";
import { readRendererMarkup } from "./parity-html";

afterEach(() => cleanup());

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

  it("accepts all four core widgets and special variants", () => {
    expect(parseHarnessQuery("?widget=standings")).toMatchObject({ widget: "standings" });
    expect(parseHarnessQuery("?widget=relative&variant=relative-fill")).toMatchObject({
      widget: "relative",
      variant: "relative-fill",
    });
    expect(parseHarnessQuery("?widget=pedals&variant=pedals-full")).toMatchObject({
      widget: "pedals",
      variant: "pedals-full",
    });
  });

  it("accepts each canonical Crystal design only with its functional widget type", () => {
    expect(
      parseHarnessQuery("?widget=delta&system=vantare-crystal&design=delta-crystal-simple"),
    ).toMatchObject({ widget: "delta", designId: "delta-crystal-simple" });
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

  it("renders each core widget marker", () => {
    for (const widget of HARNESS_WIDGETS) {
      cleanup();
      const parsed = parseHarnessQuery(`?widget=${widget}`);
      if ("error" in parsed) {
        throw new Error(parsed.error);
      }
      render(<OverlayParityHarness query={parsed} />);
      expect(document.querySelector(`[data-widget-renderer="${widget}"]`)).toBeTruthy();
    }
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

  it.each(HARNESS_WIDGETS)(
    "keeps %s renderer markup identical across studio/desktop/obs",
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

      expect(markups[0]).toBe(markups[1]);
      expect(markups[1]).toBe(markups[2]);
    },
  );

  it.each(HARNESS_WIDGETS)("serializes stable view models for %s", (widget) => {
    const built = buildHarnessWidget(widget, "vantare-original");
    const snapshot = buildHarnessTelemetry({
      session: "race",
      location: "track",
      state: "ready",
      widget,
    });
    const modelA = JSON.stringify(buildHarnessViewModel(built, snapshot));
    const modelB = JSON.stringify(buildHarnessViewModel(built, snapshot));
    expect(modelA).toBe(modelB);
    expect(modelA).toContain(`"type":"${widget}"`);
  });

  it("renders all four widgets in stale/disconnected/error states", () => {
    for (const widget of HARNESS_WIDGETS) {
      for (const state of ["stale", "disconnected", "error"] as const) {
        cleanup();
        const parsed = parseHarnessQuery(`?widget=${widget}&state=${state}&surface=obs`);
        if ("error" in parsed) {
          throw new Error(parsed.error);
        }
        render(<OverlayParityHarness query={parsed} />);
        expect(document.querySelector(`[data-widget-renderer="${widget}"]`)).toBeTruthy();
      }
    }
  });

  it("renders parameter errors explicitly", () => {
    render(<OverlayParityHarnessPage search="?state=broken" />);
    expect(screen.getByRole("alert").textContent).toMatch(/invalid state/i);
  });
});
