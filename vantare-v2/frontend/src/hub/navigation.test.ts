import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isSection, type Section } from "./navigation";

describe("hub navigation contract", () => {
  it("contains the v5.2 sections in display order", () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual([
      "dashboard",
      "profiles",
      "launcher",
      "calendar",
      "engineer",
      "telemetry",
      "roadmap",
      "setup",
    ]);
  });

  it("accepts only known sections", () => {
    expect(isSection("launcher")).toBe(true);
    expect(isSection("dashboard")).toBe(true);
    expect(isSection("roadmap")).toBe(true);
    expect(isSection("calendar")).toBe(true);
    expect(isSection("plans")).toBe(false);
    expect(isSection("")).toBe(false);
  });

  it("keeps labels user-facing and stable", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Hub",
      "Overlays Studio",
      "Launcher",
      "Carreras",
      "Ingeniero",
      "Telemetría",
      "Roadmap",
      "Ajustes",
    ]);
  });

  it("exports a Section type that includes launcher and roadmap", () => {
    const section: Section = "launcher";
    expect(section).toBe("launcher");
    const roadmap: Section = "roadmap";
    expect(roadmap).toBe("roadmap");
  });
});
