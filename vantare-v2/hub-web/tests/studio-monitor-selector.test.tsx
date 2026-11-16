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
    render(
      <CanvasResolution
        canvas={sample.value.canvas}
        monitor={sample.value.monitor}
        enabled
        onChange={onChange}
      />,
    );
    if (!sample.value.monitor) {
      const button = screen.getByRole("button", { name: t.monitorNotDetected });
      expect(button.hasAttribute("disabled")).toBe(true);
      const description = button.getAttribute("aria-describedby");
      expect(
        description && document.getElementById(description)?.textContent,
      ).toBe(t.monitorNotDetectedHelp);
      fireEvent.click(button);
      expect(screen.queryByRole("radiogroup")).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
      return;
    }
    fireEvent.click(screen.getByRole("button", { name: t.resolution }));
    const monitor = await screen.findByRole("radio", { name: /Tu monitor/ });
    expect(screen.getAllByRole("radio")[0]).toBe(monitor);
    expect(monitor.textContent).toContain(
      `${sample.value.monitor.width} × ${sample.value.monitor.height}`,
    );
    expect(monitor.getAttribute("aria-checked")).toBe(
      String(sample.value.canvas?.source === "monitor"),
    );
    fireEvent.click(monitor);
    expect(onChange.mock.calls).toEqual(
      sample.value.canvas?.source === "monitor" ? [] : [[{ kind: "monitor" }]],
    );
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
  const button = screen.getByRole("button", { name: t.monitorNotDetected });
  expect(button.hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("radiogroup")).toBeNull();
  fireEvent.click(button);
  expect(onChange).not.toHaveBeenCalled();
});
