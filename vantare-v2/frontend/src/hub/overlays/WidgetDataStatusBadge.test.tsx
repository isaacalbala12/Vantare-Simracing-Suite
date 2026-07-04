import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetDataStatusBadge } from "./WidgetDataStatusBadge";

afterEach(() => {
  cleanup();
});

describe("WidgetDataStatusBadge", () => {
  it("renders DATA OK for ok status", () => {
    render(<WidgetDataStatusBadge status="ok" />);
    expect(screen.getByText("DATA OK")).toBeDefined();
  });

  it("renders DATA PARTIAL for partial status", () => {
    render(<WidgetDataStatusBadge status="partial" />);
    expect(screen.getByText("DATA PARTIAL")).toBeDefined();
  });

  it("renders DATA PENDING for pending status", () => {
    render(<WidgetDataStatusBadge status="pending" />);
    expect(screen.getByText("DATA PENDING")).toBeDefined();
  });
});
