// @vitest-environment jsdom

import { CSPProvider } from "@base-ui/react/csp-provider";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ZoomControl } from "../src/renderer/ui/ZoomControl";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function size(width: number, height: number) {
  vi.stubGlobal("outerWidth", width);
  vi.stubGlobal("outerHeight", height);
}
function mount(value: number) {
  const onChange = vi.fn();
  render(
    <CSPProvider disableStyleElements>
      <ZoomControl
        value={value}
        disabled={false}
        onChange={onChange}
        label="Zoom"
        less="Menos"
        more="Más"
        reset="Restablecer"
      />
    </CSPProvider>,
  );
  return onChange;
}
it("disables unattainable levels, then enables them on resize without sending a save", () => {
  size(1280, 720);
  const change = mount(100),
    more = screen.getByRole("button", { name: "Más" }) as HTMLButtonElement;
  expect(more.disabled).toBe(true);
  fireEvent.click(more);
  expect(change).not.toHaveBeenCalled();
  act(() => {
    size(1920, 1080);
    fireEvent(window, new Event("resize"));
  });
  expect(more.disabled).toBe(false);
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(more);
  expect(change).toHaveBeenCalledExactlyOnceWith(110);
});
it("displays the effective ceiling while preserving a larger saved request", () => {
  size(1440, 900);
  const change = mount(125);
  expect(
    screen.getByRole("button", { name: "Restablecer" }).textContent,
  ).toContain("112.5%");
  expect(
    (screen.getByRole("button", { name: "Más" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  act(() => {
    size(1920, 1080);
    fireEvent(window, new Event("resize"));
  });
  expect(
    screen.getByRole("button", { name: "Restablecer" }).textContent,
  ).toContain("125%");
  expect(change).not.toHaveBeenCalled();
});
