import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../AppShell", () => ({
  AppRuntime: ({ children }: { children?: React.ReactNode }) => <div data-runtime>{children ?? "normal"}</div>,
}));
vi.mock("./OverlayWorkshopDevRoute", () => ({
  OverlayWorkshopAccessRoute: () => <div data-workshop-route>workshop</div>,
}));

import { OverlayWorkshopInternalApp } from "./OverlayWorkshopInternalApp";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("OverlayWorkshopInternalApp", () => {
  it("owns the internal route instead of AppShell", () => {
    window.history.replaceState(null, "", "/workshop");
    render(<OverlayWorkshopInternalApp />);
    expect(document.querySelector("[data-workshop-route]")).toBeTruthy();
  });

  it("preserves the normal runtime away from the internal route", () => {
    render(<OverlayWorkshopInternalApp />);
    expect(screen.getByText("normal")).toBeTruthy();
  });
});
