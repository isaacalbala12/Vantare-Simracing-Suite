import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  OverlayParityHarness,
  OverlayParityHarnessPage,
  parseHarnessQuery,
} from "./OverlayParityHarness";

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
    });
  });

  it("rejects invalid query values with explicit errors", () => {
    expect(parseHarnessQuery("?widget=standings")).toEqual({
      error: "invalid widget parameter: standings",
    });
    expect(parseHarnessQuery("?system=legacy")).toEqual({
      error: "invalid system parameter: legacy",
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

  it("switches only the host render mode label for surface changes", () => {
    const parsed = parseHarnessQuery("?surface=obs");
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    render(<OverlayParityHarness query={parsed} />);
    expect(screen.getByText("obs")).toBeTruthy();
    expect(document.querySelector('[data-widget-renderer="delta"]')).toBeTruthy();
  });

  it("renders parameter errors explicitly", () => {
    render(<OverlayParityHarnessPage search="?state=broken" />);
    expect(screen.getByRole("alert").textContent).toMatch(/invalid state/i);
  });
});