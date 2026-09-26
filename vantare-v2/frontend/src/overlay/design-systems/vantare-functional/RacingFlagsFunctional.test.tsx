import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RacingFlagsViewModel } from "../../widget-types/racing-flags/racing-flags-view-model";
import { RacingFlagsFunctional } from "./RacingFlagsFunctional";

afterEach(cleanup);

const yellowModel: RacingFlagsViewModel = {
  type: "racing-flags",
  status: "ready",
  globalFlag: "yellow",
  sectorFlags: [],
  message: "YELLOW",
  showSectorFlags: true,
  hideWhenGreen: false,
  hidden: false,
};
const whiteModel: RacingFlagsViewModel = { ...yellowModel, globalFlag: "white", message: "WHITE" };
const blackModel: RacingFlagsViewModel = { ...yellowModel, globalFlag: "black", message: "BLACK" };

describe("Functional Racing Flags", () => {
  it("renders the vivid yellow state with configurable text color", () => {
    const { container } = render(
      <RacingFlagsFunctional
        model={yellowModel}
        settings={{ textColor: "#ffcc00" }}
        renderMode="harness"
        motion="full"
        effects="full"
      />,
    );

    const root = container.querySelector<HTMLElement>('[data-widget-renderer="racing-flags"]');
    expect(root?.dataset.flag).toBe("yellow");
    expect(root?.dataset.motion).toBe("full");
    expect(root?.dataset.effects).toBe("full");
    expect(root?.dataset.textColor).toBe("#ffcc00");
    expect(root?.style.getPropertyValue("--vf-racing-flags-text-color")).toBe("#ffcc00");
    expect(root?.querySelector(".vf-racing-flags-banner strong")?.textContent).toBe("AMARILLA");
    expect(root?.querySelector(".vf-racing-flags-banner small")?.textContent).toBe("PRECAUCIÓN");
  });

  it.each(["reduced", "minimal"] as const)("keeps the flag semantic state under %s motion", (motion) => {
    const { container } = render(
      <RacingFlagsFunctional
        model={yellowModel}
        settings={{}}
        renderMode="harness"
        motion={motion}
        effects="full"
      />,
    );

    const root = container.querySelector<HTMLElement>('[data-widget-renderer="racing-flags"]');
    expect(root?.dataset.flag).toBe("yellow");
    expect(root?.dataset.motion).toBe(motion);
  });

  it("uses black text by default and white text only when the flag itself is black", () => {
    const defaultYellow = render(
      <RacingFlagsFunctional model={yellowModel} settings={{}} renderMode="harness" />,
    );
    expect(defaultYellow.container.querySelector<HTMLElement>('[data-widget-renderer="racing-flags"]')?.dataset.textColor).toBe("#000000");
    defaultYellow.unmount();

    const defaultBlack = render(
      <RacingFlagsFunctional model={blackModel} settings={{ textColor: "#000000" }} renderMode="harness" />,
    );
    expect(defaultBlack.container.querySelector<HTMLElement>('[data-widget-renderer="racing-flags"]')?.dataset.textColor).toBe("#ffffff");
    defaultBlack.unmount();

    const defaultWhite = render(
      <RacingFlagsFunctional model={whiteModel} settings={{}} renderMode="harness" />,
    );
    const defaultRoot = defaultWhite.container.querySelector<HTMLElement>('[data-widget-renderer="racing-flags"]');
    expect(defaultRoot?.dataset.textColor).toBe("#000000");
    expect(defaultRoot?.style.getPropertyValue("--vf-racing-flags-text-color")).toBe("#000000");

    defaultWhite.unmount();
    const customWhite = render(
      <RacingFlagsFunctional model={whiteModel} settings={{ textColor: "#ffcc00" }} renderMode="harness" />,
    );
    expect(customWhite.container.querySelector<HTMLElement>('[data-widget-renderer="racing-flags"]')?.dataset.textColor).toBe("#ffcc00");
  });
});
