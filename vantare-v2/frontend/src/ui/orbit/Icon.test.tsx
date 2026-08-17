import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon";

describe("Orbit Icon", () => {
  it("renders the requested sprite symbol with rail geometry", () => {
    const { container } = render(
      <Icon name="i-inicio" size={23} strokeWidth={1.75} />,
    );

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("23");
    expect(svg?.getAttribute("height")).toBe("23");
    expect(svg?.getAttribute("stroke-width")).toBe("1.75");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("use")?.getAttribute("href")).toMatch(
      /orbit-icons\.svg(?:\?no-inline)?#i-inicio$/,
    );
  });
});
