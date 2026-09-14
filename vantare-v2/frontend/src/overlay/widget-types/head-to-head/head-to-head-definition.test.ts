import { describe, expect, it } from "vitest";
import { conformAspectLockedLayout } from "../../core/profile-layout-conform";
import { headToHeadDefinition } from "./head-to-head-definition";
describe("headToHeadDefinition", () => { it("creates a 10Hz head-to-head widget", () => { const widget = headToHeadDefinition.createDefault("h2h-1"); expect(widget.type).toBe("head-to-head"); expect(widget.behavior.updateHz).toBe(10); expect(widget.content).toEqual({ target: "ahead", showSectors: true }); }); });

it("prevents wide-short layouts through the existing aspect contract", () => {
  const widget = headToHeadDefinition.createDefault("h2h");
  expect(headToHeadDefinition.capabilities.supportsAspectUnlock).toBe(false);
  expect(conformAspectLockedLayout({ ...widget, layout: { ...widget.layout, w: 720, h: 96 } }).layout).toMatchObject({ w: 720, h: 256 });
});

it("conforms tall persisted layouts while preserving width and position", () => {
  const widget = headToHeadDefinition.createDefault("h2h");
  const conformed = conformAspectLockedLayout({ ...widget, layout: { ...widget.layout, x: 120, y: 45, w: 360, h: 304, aspectLocked: false } });
  expect(conformed.layout).toMatchObject({ x: 120, y: 45, w: 360, h: 128 });
});
