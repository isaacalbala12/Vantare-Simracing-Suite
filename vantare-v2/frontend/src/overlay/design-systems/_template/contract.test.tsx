import { describe, expect, it } from "vitest";
import { exampleSystemManifest } from "./manifest";

describe("visual-system template", () => {
  it("is explicit, versioned and remains unregistered", () => {
    expect(exampleSystemManifest.id).toBe("example-system");
    expect(exampleSystemManifest.version).toBe(1);
    expect(exampleSystemManifest.widgets).toHaveLength(1);
    expect(exampleSystemManifest.widgets[0]?.widgetType).toBe("delta");
    expect(exampleSystemManifest.widgets[0]?.defaultSettings).toEqual({ label: "default" });
  });
});
