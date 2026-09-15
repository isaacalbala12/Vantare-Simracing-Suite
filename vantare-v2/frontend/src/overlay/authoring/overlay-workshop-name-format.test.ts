import { describe, expect, it } from "vitest";
import type { WidgetInstanceV3 } from "../core/profile-document";
import { buildWorkshopWidget } from "./fixtures/authoring-v2-workshop-frame";
import { parseOverlayWorkshopQuery, serializeOverlayWorkshopQuery } from "./overlay-workshop-query";

function driverNameFormat(widget: WidgetInstanceV3): Record<string, unknown> | undefined {
  const columns = (widget.content.columns ?? []) as { metricId: string; format?: Record<string, unknown> }[];
  return columns.find((column) => column.metricId === "driverName")?.format;
}

describe("Workshop nameFormat", () => {
  it("parses the format on widgets with a driver column and serializes it back", () => {
    const parsed = parseOverlayWorkshopQuery("?widget=standings&system=vantare-functional&nameFormat=initial");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.nameFormat).toBe("initial");
    expect(serializeOverlayWorkshopQuery(parsed)).toContain("nameFormat=initial");
  });

  it("rejects unknown formats and drops the param on widgets without a driver column", () => {
    expect(parseOverlayWorkshopQuery("?widget=standings&nameFormat=bogus"))
      .toEqual({ error: "invalid nameFormat parameter: bogus" });
    const delta = parseOverlayWorkshopQuery("?widget=delta&nameFormat=surname");
    if ("error" in delta) throw new Error(delta.error);
    expect(delta.nameFormat).toBeUndefined();
    expect(serializeOverlayWorkshopQuery(delta)).not.toContain("nameFormat");
  });

  it.each(["standings", "relative"] as const)("writes format.mode on the %s driver column", (widget) => {
    const instance = buildWorkshopWidget({
      widget,
      system: "vantare-functional",
      variant: "default",
      session: "race",
      nameFormat: "surname",
    });
    expect(driverNameFormat(instance)).toMatchObject({ mode: "surname" });
  });

  it("merges with the existing column format instead of replacing it", () => {
    const instance = buildWorkshopWidget({
      widget: "standings",
      system: "vantare-functional",
      variant: "default",
      session: "race",
      nameFormat: "initial",
    });
    expect(driverNameFormat(instance)).toMatchObject({ mode: "initial", maxChars: 16 });
  });

  it("leaves the column format untouched when no format is requested", () => {
    const instance = buildWorkshopWidget({
      widget: "standings",
      system: "vantare-functional",
      variant: "default",
      session: "race",
    });
    expect(driverNameFormat(instance)).toMatchObject({ mode: "full" });
  });
});
