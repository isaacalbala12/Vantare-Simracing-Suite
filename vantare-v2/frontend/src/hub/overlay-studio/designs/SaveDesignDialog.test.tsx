import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveDesignDialog } from "./SaveDesignDialog";

describe("SaveDesignDialog", () => {
  afterEach(() => cleanup());

  it("defaults include content to false and requires a name", () => {
    const onSave = vi.fn();
    render(<SaveDesignDialog open onClose={vi.fn()} onSave={onSave} />);

    const include = screen.getByTestId("studio-save-design-include-content") as HTMLInputElement;
    expect(include.checked).toBe(false);
    expect(screen.queryByTestId("studio-save-design-content-warning")).toBeNull();

    const confirm = screen.getByTestId("studio-save-design-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("studio-save-design-name"), { target: { value: "  Race HUD  " } });
    expect(confirm.disabled).toBe(false);

    fireEvent.click(confirm);
    expect(onSave).toHaveBeenCalledWith({ name: "Race HUD", includesContent: false });
  });

  it("shows an explicit warning when content inclusion is enabled", () => {
    render(<SaveDesignDialog open onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.click(screen.getByTestId("studio-save-design-include-content"));
    expect(screen.getByTestId("studio-save-design-content-warning")).toBeTruthy();
  });

  it("resets fields when closed and reopened", () => {
    const { rerender } = render(<SaveDesignDialog open onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.change(screen.getByTestId("studio-save-design-name"), { target: { value: "Temp" } });
    fireEvent.click(screen.getByTestId("studio-save-design-include-content"));

    rerender(<SaveDesignDialog open={false} onClose={vi.fn()} onSave={vi.fn()} />);
    rerender(<SaveDesignDialog open onClose={vi.fn()} onSave={vi.fn()} />);

    expect((screen.getByTestId("studio-save-design-name") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("studio-save-design-include-content") as HTMLInputElement).checked).toBe(false);
  });
});