// @vitest-environment jsdom
import { CSPProvider } from "@base-ui/react/csp-provider";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { pilotText as text } from "../src/renderer/i18n/pilot.es";
import { centeredCrop } from "../src/renderer/screens/settings/photo-crop";
import { PilotCropper } from "../src/renderer/ui/PilotCropper";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount(pending = false) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect() {},
    drawImage() {},
  } as unknown as CanvasRenderingContext2D);
  const image = { width: 800, height: 400 } as ImageBitmap;
  const onChange = vi.fn(),
    onCancel = vi.fn(),
    onApply = vi.fn();
  render(
    <CSPProvider disableStyleElements>
      <PilotCropper
        image={image}
        crop={centeredCrop(800, 400)}
        pending={pending}
        onChange={onChange}
        onCancel={onCancel}
        onApply={onApply}
      />
    </CSPProvider>,
  );
  return { onChange, onCancel, onApply };
}
it("moves and zooms with the native keyboard gestures and cancels the scroll default", async () => {
  const { onChange } = mount();
  const stage = screen.getByRole("button", { name: text.cropLabel });
  stage.focus();
  await userEvent.setup().keyboard("{ArrowRight}+");
  expect(onChange.mock.calls[0][0](centeredCrop(800, 400)).x).toBeCloseTo(0.27);
  expect(onChange.mock.calls[1][0](centeredCrop(800, 400)).side).toBeCloseTo(
    0.8,
  );
  expect(document.activeElement).toBe(stage);
  const wheel = new WheelEvent("wheel", {
    deltaY: -100,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(stage, wheel);
  expect(wheel.defaultPrevented).toBe(true);
  expect(onChange).toHaveBeenCalledTimes(3);
});
it("applies only on explicit confirmation and preserves cancel", async () => {
  const { onApply, onCancel } = mount();
  expect(onApply).not.toHaveBeenCalled();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: text.cropApply }));
  expect(onApply).toHaveBeenCalledOnce();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: text.cropCancel }));
  expect(onCancel).toHaveBeenCalledOnce();
});
it("ignores gestures while persistence is pending", async () => {
  const { onChange } = mount(true);
  const stage = screen.getByRole("button", { name: text.cropLabel });
  stage.focus();
  await userEvent.setup().keyboard("{ArrowRight}+");
  fireEvent.wheel(stage, { deltaY: -10 });
  expect(onChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(stage);
});

it("composes two moves before a paint instead of losing the first delta", () => {
  const { onChange } = mount();
  const stage = screen.getByRole("button", { name: text.cropLabel });
  fireEvent.keyDown(stage, { key: "ArrowRight" });
  fireEvent.keyDown(stage, { key: "ArrowRight" });
  let crop = centeredCrop(800, 400);
  for (const [update] of onChange.mock.calls) crop = update(crop);
  expect(crop.x).toBeCloseTo(0.29);
});
