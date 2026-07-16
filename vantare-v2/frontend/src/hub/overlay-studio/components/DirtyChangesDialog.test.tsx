import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DirtyChangesDialog } from "./DirtyChangesDialog";

describe("DirtyChangesDialog", () => {
  afterEach(() => cleanup());

  it("renders save discard and cancel actions when open", () => {
    render(
      <DirtyChangesDialog
        open
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId("studio-dirty-dialog")).toBeTruthy();
    expect(screen.getByTestId("studio-dirty-save")).toBeTruthy();
    expect(screen.getByTestId("studio-dirty-discard")).toBeTruthy();
    expect(screen.getByTestId("studio-dirty-cancel")).toBeTruthy();
  });

  it("does not render when closed", () => {
    render(
      <DirtyChangesDialog
        open={false}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("studio-dirty-dialog")).toBeNull();
  });

  it("dispatches the selected action", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    render(
      <DirtyChangesDialog open onSave={onSave} onDiscard={onDiscard} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByTestId("studio-dirty-discard"));
    fireEvent.click(screen.getByTestId("studio-dirty-cancel"));
    fireEvent.click(screen.getByTestId("studio-dirty-save"));

    expect(onDiscard).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("shows save errors and disables actions while saving", () => {
    render(
      <DirtyChangesDialog
        open
        saving
        errorMessage="disk full"
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId("studio-dirty-error").textContent).toContain("disk full");
    expect(screen.getByTestId("studio-dirty-save").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("studio-dirty-discard").hasAttribute("disabled")).toBe(true);
  });
});