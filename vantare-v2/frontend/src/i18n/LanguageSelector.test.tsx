import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "./I18nProvider";
import { LanguageSelector } from "./LanguageSelector";

const STORAGE_KEY = "vantare.locale";

describe("LanguageSelector", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders with data-testid language-selector", () => {
    render(
      <I18nProvider>
        <LanguageSelector />
      </I18nProvider>,
    );
    expect(screen.getByTestId("language-selector")).toBeTruthy();
  });

  it("shows 4 language options", () => {
    render(
      <I18nProvider>
        <LanguageSelector />
      </I18nProvider>,
    );
    const select = screen.getByTestId("language-selector") as HTMLSelectElement;
    // 4 real options + possibly a placeholder
    const options = select.querySelectorAll("option");
    expect(options.length).toBe(4);
  });

  it("defaults to Spanish", () => {
    render(
      <I18nProvider>
        <LanguageSelector />
      </I18nProvider>,
    );
    const select = screen.getByTestId("language-selector") as HTMLSelectElement;
    expect(select.value).toBe("es");
  });

  it("reflects saved locale from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    render(
      <I18nProvider>
        <LanguageSelector />
      </I18nProvider>,
    );
    const select = screen.getByTestId("language-selector") as HTMLSelectElement;
    expect(select.value).toBe("en");
  });

  it("has an accessible label", () => {
    render(
      <I18nProvider>
        <LanguageSelector />
      </I18nProvider>,
    );
    const label = screen.getByText("Idioma");
    expect(label).toBeTruthy();
    // The label should be associated with the select via htmlFor
    const select = screen.getByTestId("language-selector");
    expect(label.getAttribute("for")).toBe(select.id);
  });
});
