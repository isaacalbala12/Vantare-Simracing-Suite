import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildEngineerPresentationFixture } from "./engineer-presentation-fixtures";
import { EngineerSubtitles } from "./EngineerSubtitles";

describe("EngineerSubtitles", () => {
  it.each(["es", "en", "it", "pt-BR"] as const)("renders the shared %s presentation as an independent live surface", (locale) => {
    const presentation = buildEngineerPresentationFixture(locale, "warning");
    const view = render(<EngineerSubtitles presentation={presentation} />);
    const root = view.container.querySelector("[data-engineer-subtitles]");
    expect(root?.getAttribute("lang")).toBe(locale);
    expect(root?.textContent).toContain(presentation.text);
    expect(root?.getAttribute("data-message-id")).toBe(presentation.id);
  });
});
