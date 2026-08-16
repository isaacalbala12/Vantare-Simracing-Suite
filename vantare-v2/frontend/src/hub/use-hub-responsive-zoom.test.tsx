import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHubResponsiveZoom } from "./use-hub-responsive-zoom";

function Harness() {
  useHubResponsiveZoom();
  return <div />;
}

describe("useHubResponsiveZoom", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("applies the window-height zoom factor on the document element", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(2160);
    render(<Harness />);

    expect(document.documentElement.style.zoom).toBe("2");
  });

  it("keeps zoom at 1 below the 1080p design base", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(600);
    render(<Harness />);

    expect(document.documentElement.style.zoom).toBe("1");
  });

  it("reapplies the factor on window resize", () => {
    const innerHeight = vi.spyOn(window, "innerHeight", "get").mockReturnValue(1080);
    const addEventListener = vi.spyOn(window, "addEventListener");
    render(<Harness />);

    expect(document.documentElement.style.zoom).toBe("1");

    innerHeight.mockReturnValue(1440);
    const resizeHandler = addEventListener.mock.calls.find(([event]) => event === "resize")?.[1] as () => void;
    resizeHandler();

    expect(document.documentElement.style.zoom).toBe("1.3333333333333333");
  });

  it("cleans up the zoom and its resize listener on unmount", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(2160);
    const view = render(<Harness />);

    expect(document.documentElement.style.zoom).toBe("2");

    view.unmount();
    expect(document.documentElement.style.zoom).toBe("");
    expect(addEventListener.mock.calls.filter(([event]) => event === "resize")).toHaveLength(1);
    expect(removeEventListener.mock.calls.filter(([event]) => event === "resize")).toHaveLength(1);
  });
});
