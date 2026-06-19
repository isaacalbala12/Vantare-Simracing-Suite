import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CommunityComingSoonView } from "./CommunityComingSoonView";

afterEach(() => {
  cleanup();
});

describe("CommunityComingSoonView", () => {
  it("shows a dedicated coming soon screen and back action", () => {
    const onBack = vi.fn();
    render(<CommunityComingSoonView onBack={onBack} />);

    expect(screen.getByRole("heading", { name: "Comunidad" })).toBeTruthy();
    expect(screen.getByText("Próximamente")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Volver a Overlays Studio/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
