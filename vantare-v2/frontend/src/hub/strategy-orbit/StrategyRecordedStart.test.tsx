import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrategyRecordedStart } from "./StrategyRecordedStart";

afterEach(cleanup);
it("selects a preparation mode without importing or advancing implicitly", () => {
  const onMode = vi.fn();
  const props = { mode: "manual" as const, onMode, t: (key: string) => key };
  const view = render(<StrategyRecordedStart {...props} />);
  const automatic = screen.getByRole("button", { name: /strategy.journey.automatic / });
  expect(automatic.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(automatic);
  expect(onMode).toHaveBeenCalledExactlyOnceWith("automatic");
  view.rerender(<StrategyRecordedStart {...props} mode="automatic" />);
  expect(automatic.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: /strategy.journey.manual / }).getAttribute("aria-pressed")).toBe("false");
});
