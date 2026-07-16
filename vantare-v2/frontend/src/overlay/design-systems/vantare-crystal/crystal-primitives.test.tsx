import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CrystalBrand,
  CrystalFooter,
  CrystalHeader,
  CrystalPill,
  CrystalStatusFrame,
  CrystalSurface,
  CrystalTableRow,
} from "./crystal-primitives";

describe("Crystal pure primitives", () => {
  it("composes semantic glass primitives from presentational props", () => {
    render(
      <CrystalSurface aria-label="Crystal surface">
        <CrystalHeader title="RELATIVE" meta="LIVE">
          <CrystalBrand>VANTARE</CrystalBrand>
          <CrystalPill tone="gaining">-0.240</CrystalPill>
        </CrystalHeader>
        <CrystalTableRow selected status="live">
          <span>ISAAC</span>
          <span>1:23.456</span>
        </CrystalTableRow>
        <CrystalStatusFrame status="stale" message="Waiting for telemetry" />
        <CrystalFooter>SOF: 2,450</CrystalFooter>
      </CrystalSurface>,
    );

    expect(screen.getByRole("region", { name: "Crystal surface" }).getAttribute("data-crystal-primitive")).toBe("surface");
    expect(screen.getByText("VANTARE").getAttribute("data-crystal-primitive")).toBe("brand");
    expect(screen.getByText("-0.240").getAttribute("data-tone")).toBe("gaining");
    expect(screen.getByRole("row").getAttribute("data-selected")).toBe("true");
    expect(screen.getByRole("row").getAttribute("data-status")).toBe("live");
    expect(screen.getByRole("status").textContent).toContain("Waiting for telemetry");
    expect(screen.getByText("SOF: 2,450").getAttribute("data-crystal-primitive")).toBe("footer");
  });

  it("does not depend on application state, persistence, or runtime bridges", () => {
    const source = readFileSync(join(__dirname, "crystal-primitives.tsx"), "utf8");
    expect(source).not.toMatch(/profile|wails|sse|access-policy|telemetry|layout/i);
  });
});
