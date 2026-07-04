import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WidgetAccessBadge } from "./WidgetAccessBadge";

afterEach(() => {
  cleanup();
});

describe("WidgetAccessBadge", () => {
  it("renders FREE for free tier", () => {
    render(<WidgetAccessBadge tier="free" />);
    expect(screen.getByText("free")).toBeDefined();
  });

  it("renders PRO for pro tier", () => {
    render(<WidgetAccessBadge tier="pro" />);
    expect(screen.getByText("pro")).toBeDefined();
  });

  it("renders TESTER for tester tier", () => {
    render(<WidgetAccessBadge tier="tester" />);
    expect(screen.getByText("tester")).toBeDefined();
  });

  it("renders EXPERIMENTAL for experimental tier", () => {
    render(<WidgetAccessBadge tier="experimental" />);
    expect(screen.getByText("experimental")).toBeDefined();
  });
});
