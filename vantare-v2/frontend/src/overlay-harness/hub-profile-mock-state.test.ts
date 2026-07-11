import { describe, expect, it } from "vitest";
import {
  buildDefaultCreatedProfileDocument,
  createHubProfile,
  loadHubDocument,
  resetHubMockState,
  setActiveHubProfile,
} from "./hub-profile-mock-state";
import { parseStandingsContent } from "../overlay/widget-types/standings/standings-content";

describe("hub-profile-mock-state", () => {
  it("creates profiles with standings columns so V3 editor can render", () => {
    resetHubMockState("empty");
    const created = createHubProfile("Race HUD");
    expect("error" in created).toBe(false);
    if ("error" in created) {
      return;
    }

    setActiveHubProfile(created.id, created.file);
    const loaded = loadHubDocument(created.file);
    expect(loaded).not.toBeNull();

    const standings = loaded?.document.layouts.general?.widgets.find((widget) => widget.type === "standings");
    expect(standings).toBeTruthy();
    expect(() => parseStandingsContent(standings?.content ?? {})).not.toThrow();
  });

  it("builds the same widget set as backend create profile", () => {
    const document = buildDefaultCreatedProfileDocument("custom-test", "Test");
    const types = document.layouts.general?.widgets.map((widget) => widget.type) ?? [];
    expect(types).toEqual(["delta", "relative", "standings"]);
  });
});