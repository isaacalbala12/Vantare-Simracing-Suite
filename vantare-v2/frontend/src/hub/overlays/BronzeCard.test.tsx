import { afterEach, describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BronzeCard } from "./BronzeCard";

afterEach(cleanup);

describe("BronzeCard", () => {
  it("renders children inside a card with bc class", () => {
    render(
      <BronzeCard>
        <span data-testid="content">Hello</span>
      </BronzeCard>
    );
    expect(screen.getByTestId("content")).toBeTruthy();
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("applies active class when active prop is true", () => {
    render(
      <BronzeCard active data-testid="card">
        <span>Active card</span>
      </BronzeCard>
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("bc-active");
  });

  it("applies custom className alongside bc", () => {
    render(
      <BronzeCard className="custom-class" data-testid="card">
        <span>Custom</span>
      </BronzeCard>
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("bc");
    expect(card.className).toContain("custom-class");
  });

  it("renders tag, eyebrow, primary, secondary, and meta sub-components", () => {
    render(
      <BronzeCard>
        <BronzeCard.Tag>Time Attack</BronzeCard.Tag>
        <BronzeCard.Eyebrow>Color</BronzeCard.Eyebrow>
        <BronzeCard.Primary>Verde · Rojo</BronzeCard.Primary>
        <BronzeCard.Divider />
        <BronzeCard.Secondary>Fondo oscuro</BronzeCard.Secondary>
        <BronzeCard.Meta>crystal.json</BronzeCard.Meta>
      </BronzeCard>
    );
    expect(screen.getByText("Time Attack")).toBeTruthy();
    expect(screen.getByText("Color")).toBeTruthy();
    expect(screen.getByText("Verde · Rojo")).toBeTruthy();
    expect(screen.getByText("Fondo oscuro")).toBeTruthy();
    expect(screen.getByText("crystal.json")).toBeTruthy();
  });
});
