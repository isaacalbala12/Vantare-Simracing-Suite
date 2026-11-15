// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { studioMonitorCases } from "../src/contract/generated/studio";
import { canvasText as t } from "../src/renderer/i18n/studio-canvas";
import { CanvasResolution } from "../src/renderer/ui/studio/CanvasResolution";

afterEach(cleanup);
for (const sample of studioMonitorCases) {
  it(`uses Rust monitor independently of canvas: ${sample.name}`, async () => {
    const onChange = vi.fn();
    // A null canvas hides the selector in CanvasStage. Exercise its null-monitor
    // guard too, without letting these synthetic canvas dimensions fill it in.
    render(
      <CanvasResolution
        canvas={
          sample.value.canvas ?? {
            width: 3840,
            height: 2160,
            source: "custom",
          }
        }
        monitor={sample.value.monitor}
        enabled
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: t.resolution }));
    const monitor = await screen.findByRole("radio", { name: /Tu monitor/ });
    if (sample.value.monitor) {
      expect(monitor.textContent).toContain(
        `${sample.value.monitor.width} × ${sample.value.monitor.height}`,
      );
      expect(monitor.getAttribute("aria-checked")).toBe(
        String(sample.value.canvas?.source === "monitor"),
      );
      fireEvent.click(monitor);
      expect(onChange.mock.calls).toEqual(
        sample.value.canvas?.source === "monitor"
          ? []
          : [[{ kind: "monitor" }]],
      );
    } else {
      expect(monitor.textContent).toContain(t.monitorUnavailable);
      expect(monitor.textContent).not.toContain("3840");
      fireEvent.click(monitor);
      expect(onChange).not.toHaveBeenCalled();
    }
  });
}

it("does not retain an earlier monitor after disconnection", async () => {
  const onChange = vi.fn();
  const canvas = { width: 1920, height: 1080, source: "custom" } as const;
  const { rerender } = render(
    <CanvasResolution
      canvas={canvas}
      monitor={{ width: 2560, height: 1440 }}
      enabled
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: t.resolution }));
  expect(
    (await screen.findByRole("radio", { name: /Tu monitor/ })).textContent,
  ).toContain("2560 × 1440");
  rerender(
    <CanvasResolution
      canvas={canvas}
      monitor={null}
      enabled
      onChange={onChange}
    />,
  );
  const monitor = screen.getByRole("radio", { name: /Tu monitor/ });
  expect(monitor.textContent).toContain(t.monitorUnavailable);
  expect(monitor.textContent).not.toContain("2560");
  fireEvent.click(monitor);
  expect(onChange).not.toHaveBeenCalled();
});
