// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { homeWidgetKinds } from "../src/contract/generated/home";
import { LayoutPreview } from "../src/renderer/ui/home/LayoutPreview";
import { WidgetThumb } from "../src/renderer/ui/widgets/WidgetThumb";

beforeAll(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(cleanup);
it("uses the common thumbnail source for every home widget kind", () => {
  render(
    <LayoutPreview
      layout={{
        state: "ready",
        width: 1920,
        height: 1080,
        widgets: homeWidgetKinds.map((kind) => ({
          kind,
          x: 20,
          y: 20,
          w: 150,
          h: 36,
          opacity: 100,
        })),
      }}
    />,
  );
  const images = screen.getAllByRole("img");
  expect(images).toHaveLength(homeWidgetKinds.length);
  for (const image of images) {
    const thumbnail = image.querySelector(".v-widget-thumbnail");
    expect(thumbnail).toBeTruthy();
    if (thumbnail instanceof SVGElement)
      expect(thumbnail.querySelector("image")?.getAttribute("href")).toMatch(
        /\.svg$/,
      );
    else expect(thumbnail?.getAttribute("src")).toMatch(/\.png$/);
  }
});
it("fills positioned widget boxes without fitting the thumbnail canvas", () => {
  render(
    <LayoutPreview
      layout={{
        state: "ready",
        width: 1920,
        height: 1080,
        widgets: [{ kind: "delta", x: 20, y: 20, w: 150, h: 36, opacity: 50 }],
      }}
    />,
  );
  const box = screen.getByRole("img", { name: "Delta" });
  expect(box.style.opacity).toBe("0.5");
  const thumbnail = box.querySelector(".v-widget-thumbnail");
  if (thumbnail instanceof SVGElement)
    expect(thumbnail.getAttribute("preserveAspectRatio")).toBe("none");
  else expect((thumbnail as HTMLImageElement).style.objectFit).toBe("fill");
});
it("preserves the default fit used by Studio and other thumbnail consumers", () => {
  const { container } = render(<WidgetThumb kind="delta" />);
  const thumbnail = container.querySelector(".v-widget-thumbnail");
  if (thumbnail instanceof SVGElement)
    expect(thumbnail.getAttribute("preserveAspectRatio")).toBeNull();
  else expect((thumbnail as HTMLImageElement).style.objectFit).toBe("contain");
});
