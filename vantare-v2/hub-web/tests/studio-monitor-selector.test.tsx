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
      expect(screen.queryByRole("button")).toBeNull();
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
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("radiogroup")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

it("deduplicates a custom canvas equal to the monitor and returns to monitor once", async () => {
  const onChange = vi.fn();
  render(
    <CanvasResolution
      canvas={{ width: 2560, height: 1440, source: "custom" }}
      monitor={{ width: 2560, height: 1440 }}
      enabled
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: t.resolution }));
  const rows = await screen.findAllByRole("radio");
  expect(rows).toHaveLength(4);
  expect(
    rows.filter((row) => row.textContent?.includes("2560 × 1440")),
  ).toHaveLength(1);
  expect(rows[0].getAttribute("aria-checked")).toBe("true");
  fireEvent.click(rows[0]);
  expect(onChange.mock.calls).toEqual([[{ kind: "monitor" }]]);
});
it("keeps a non-preset real monitor first without inventing another preset", async () => {
  render(
    <CanvasResolution
      canvas={{ width: 3000, height: 2000, source: "monitor" }}
      monitor={{ width: 3000, height: 2000 }}
      enabled
      onChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: t.resolution }));
  const rows = await screen.findAllByRole("radio");
  expect(rows).toHaveLength(5);
  expect(rows[0].textContent).toBe("Tu monitor · 3000 × 2000");
  expect(rows[0].getAttribute("aria-checked")).toBe("true");
});
