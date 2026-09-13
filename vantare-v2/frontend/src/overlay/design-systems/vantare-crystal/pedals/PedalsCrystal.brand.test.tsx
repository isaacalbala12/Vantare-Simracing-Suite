import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PedalsViewModel } from "../../../widget-types/pedals/pedals-view-model";
import { PedalsCrystal } from "./PedalsCrystal";

afterEach(() => cleanup());

const readyModel: PedalsViewModel = {
  type: "pedals",
  status: "ready",
  throttle: 0.5,
  brake: 0.2,
  clutch: 0,
  throttleText: "50%",
  brakeText: "20%",
  clutchText: "0%",
};

const defaultSettings = {
  transparentBackground: true,
  pedalThrottleColor: "#2ecc71",
  pedalBrakeColor: "#e74c3c",
  pedalClutchColor: "#3498db",
};

function brandNodes(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll("[data-crystal-primitive='brand']")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
}

describe("PedalsCrystal brand decision", () => {
  it("keeps no brand without an explicit decision (legacy look)", () => {
    const { container } = render(
      <PedalsCrystal model={readyModel} settings={defaultSettings} renderMode="harness" />,
    );
    expect(brandNodes(container)).toHaveLength(0);
    expect(container.querySelector(".vc-brand-band")).toBeNull();
  });

  it("mandatory free brand paints its own band above the channels", () => {
    const { container } = render(
      <PedalsCrystal
        model={readyModel}
        settings={{ ...defaultSettings, showBrand: false, brandVisible: true }}
        renderMode="harness"
      />,
    );
    const band = container.querySelector(".vc-brand-band");
    expect(band).toBeTruthy();
    expect(brandNodes(container)).toHaveLength(2);
    expect(band?.textContent).toContain("VANTARE");
    // Channels stay intact below the band.
    expect(container.querySelectorAll(".vc-pedals-channel")).toHaveLength(3);
  });

  it("paid opt-out hides the brand without touching the channels", () => {
    const { container } = render(
      <PedalsCrystal
        model={readyModel}
        settings={{ ...defaultSettings, brandVisible: false }}
        renderMode="harness"
      />,
    );
    expect(brandNodes(container)).toHaveLength(0);
    expect(container.querySelectorAll(".vc-pedals-channel")).toHaveLength(3);
  });
});
