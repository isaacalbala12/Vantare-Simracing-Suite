import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WidgetInstanceV3 } from "../../core/profile-document";
import { relativeDefinition } from "./relative-definition";
import { RelativeContentInspector } from "./RelativeContentInspector";

afterEach(() => cleanup());

function createWidget(): WidgetInstanceV3 {
  return relativeDefinition.createDefault("relative-test");
}

describe("RelativeContentInspector", () => {
  it("renders filter and column controls", () => {
    render(<RelativeContentInspector widget={createWidget()} onContentChange={vi.fn()} />);
    expect(screen.getByTestId("studio-relative-filters")).toBeTruthy();
    expect(screen.getByTestId("studio-relative-columns")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Delante" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Detrás" })).toBeTruthy();
    expect(screen.queryByTestId("studio-relative-include-player")).toBeNull();
    expect(screen.getByTestId("studio-relative-column-position")).toBeTruthy();
  });

  it("dispatches one content change when a filter changes", () => {
    const onContentChange = vi.fn();
    render(<RelativeContentInspector widget={createWidget()} onContentChange={onContentChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Misma clase" }));
    expect(onContentChange).toHaveBeenCalledTimes(1);
    expect(onContentChange.mock.calls[0]?.[0]).toMatchObject({
      rangeAhead: 3,
      rangeBehind: 3,
      includePlayer: true,
      classScope: "sameClass",
    });
  });

  it("publishes the configured ahead/behind window without touching other fields", () => {
    const onContentChange = vi.fn();
    render(<RelativeContentInspector widget={createWidget()} onContentChange={onContentChange} />);
    fireEvent.click(within(screen.getByRole("group", { name: "Delante" })).getByRole("button", { name: "5" }));
    expect(onContentChange.mock.calls[0]?.[0]).toMatchObject({ rangeAhead: 5, rangeBehind: 3, includePlayer: true });
    fireEvent.click(within(screen.getByRole("group", { name: "Detrás" })).getByRole("button", { name: "0" }));
    expect(onContentChange.mock.calls[1]?.[0]).toMatchObject({ rangeAhead: 3, rangeBehind: 0, includePlayer: true });
  });
});

 it("uses labelled Orbit controls without abbreviated native selects", () => {
   const { container } = render(<RelativeContentInspector widget={createWidget()} onContentChange={vi.fn()} />);
   expect(container.querySelector('select')).toBeNull();
   expect(screen.getByRole('button', { name: 'Misma clase' })).toBeTruthy();
 });
