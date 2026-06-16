import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewInspector } from "./PreviewInspector";
import type { ProfileConfig } from "../../lib/profile";

const profile: ProfileConfig = {
  id: "test",
  name: "Test",
  displayMode: "racing",
  monitorIndex: 0,
  widgets: [
    { id: "delta", type: "delta", enabled: true, name: "Delta", updateHz: 30, position: { x: 10, y: 20, w: 400, h: 100 } },
  ],
};

describe("PreviewInspector", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows placeholder when no widget selected", () => {
    render(
      <PreviewInspector profile={profile} widget={null} onChangeProfile={vi.fn()} />,
    );
    expect(screen.getByText("Selecciona un widget en el preview.")).toBeTruthy();
  });

  it("renders widget id and type", () => {
    render(
      <PreviewInspector profile={profile} widget={profile.widgets[0]} onChangeProfile={vi.fn()} />,
    );
    const texts = screen.getAllByText("delta");
    expect(texts.length).toBeGreaterThanOrEqual(2);
  });

  it("renames widget from name input", () => {
    const onChangeProfile = vi.fn();
    render(
      <PreviewInspector profile={profile} widget={profile.widgets[0]} onChangeProfile={onChangeProfile} />,
    );

    const input = screen.getByDisplayValue("Delta");
    fireEvent.change(input, { target: { value: "Nuevo nombre" } });

    expect(onChangeProfile).toHaveBeenCalled();
    const updated = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(updated.widgets[0].name).toBe("Nuevo nombre");
  });

  it("updates updateHz from input", () => {
    const onChangeProfile = vi.fn();
    render(
      <PreviewInspector profile={profile} widget={profile.widgets[0]} onChangeProfile={onChangeProfile} />,
    );

    const hzInput = screen.getByDisplayValue("30");
    fireEvent.change(hzInput, { target: { value: "60" } });

    expect(onChangeProfile).toHaveBeenCalled();
    const updated = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(updated.widgets[0].updateHz).toBe(60);
  });

  it("calls onDuplicate from Duplicar button", () => {
    const onDuplicate = vi.fn();
    render(
      <PreviewInspector
        profile={profile}
        widget={profile.widgets[0]}
        onChangeProfile={vi.fn()}
        onDuplicate={onDuplicate}
      />,
    );

    fireEvent.click(screen.getByText("Duplicar"));
    expect(onDuplicate).toHaveBeenCalledWith(profile.widgets[0]);
  });

  it("calls onReset from Reset posicion button", () => {
    const onReset = vi.fn();
    render(
      <PreviewInspector
        profile={profile}
        widget={profile.widgets[0]}
        onChangeProfile={vi.fn()}
        onReset={onReset}
      />,
    );

    fireEvent.click(screen.getByText("Reset posicion"));
    expect(onReset).toHaveBeenCalledWith(profile.widgets[0]);
  });

  it("calls onDelete after confirming Eliminar", () => {
    const onDelete = vi.fn();
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    render(
      <PreviewInspector
        profile={profile}
        widget={profile.widgets[0]}
        onChangeProfile={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("Eliminar"));
    expect(window.confirm).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledWith("delta");

    window.confirm = originalConfirm;
  });

  it("does not call onDelete when confirm is cancelled", () => {
    const onDelete = vi.fn();
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => false);

    render(
      <PreviewInspector
        profile={profile}
        widget={profile.widgets[0]}
        onChangeProfile={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("Eliminar"));
    expect(onDelete).not.toHaveBeenCalled();

    window.confirm = originalConfirm;
  });
});
