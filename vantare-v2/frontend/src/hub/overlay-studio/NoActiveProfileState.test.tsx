import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoActiveProfileState } from "./NoActiveProfileState";

afterEach(() => cleanup());

describe("NoActiveProfileState", () => {
  it("renders actions and invokes callbacks", () => {
    const onCreateProfile = vi.fn();
    const onSelectProfile = vi.fn();
    const onOpenRecommended = vi.fn();

    render(
      <NoActiveProfileState
        onCreateProfile={onCreateProfile}
        onSelectProfile={onSelectProfile}
        onOpenRecommended={onOpenRecommended}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Crear perfil" }));
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar perfil" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver recomendados" }));

    expect(onCreateProfile).toHaveBeenCalledTimes(1);
    expect(onSelectProfile).toHaveBeenCalledTimes(1);
    expect(onOpenRecommended).toHaveBeenCalledTimes(1);
  });
});