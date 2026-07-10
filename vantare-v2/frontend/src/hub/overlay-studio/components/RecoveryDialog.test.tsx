import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecoveryDialog } from "./RecoveryDialog";

describe("RecoveryDialog", () => {
  afterEach(() => cleanup());

  it("shows profile name and captured time with recover and discard actions", () => {
    const onRecover = vi.fn();
    const onDiscard = vi.fn();
    render(
      <RecoveryDialog
        open
        profileName="Perfil A"
        capturedAt="2026-07-10T12:34:00.000Z"
        onRecover={onRecover}
        onDiscard={onDiscard}
      />,
    );

    expect(screen.getByTestId("studio-recovery-dialog")).toBeTruthy();
    expect(screen.getByTestId("studio-recovery-profile").textContent).toContain("Perfil A");
    expect(screen.getByTestId("studio-recovery-time").textContent).toContain("2026");
    expect(screen.queryByTestId("studio-recovery-stale-warning")).toBeNull();

    fireEvent.click(screen.getByTestId("studio-recovery-recover"));
    fireEvent.click(screen.getByTestId("studio-recovery-discard"));
    expect(onRecover).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("shows a stale revision warning when provided", () => {
    render(
      <RecoveryDialog
        open
        profileName="Perfil A"
        capturedAt="2026-07-10T12:34:00.000Z"
        staleRevisionWarning="recovery base revision differs from disk revision"
        onRecover={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByTestId("studio-recovery-stale-warning").textContent).toContain("revisión");
  });
});