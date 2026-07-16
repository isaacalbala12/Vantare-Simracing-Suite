import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByTestId("studio-relative-range-ahead")).toBeTruthy();
    expect(screen.getByTestId("studio-relative-column-position")).toBeTruthy();
  });

  it("dispatches one content change when a filter changes", () => {
    const onContentChange = vi.fn();
    render(<RelativeContentInspector widget={createWidget()} onContentChange={onContentChange} />);
    fireEvent.change(screen.getByTestId("studio-relative-range-ahead"), { target: { value: "1" } });
    expect(onContentChange).toHaveBeenCalledTimes(1);
    expect(onContentChange.mock.calls[0]?.[0]).toMatchObject({ rangeAhead: 1 });
  });
});