import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(async () => {
  await act(() => vi.dynamicImportSettled());
  cleanup();
  localStorage.clear();
});

async function loadConsumer() {
  const { I18nProvider, useI18n } = await import("./I18nProvider");
  function Consumer({ id }: { id: string }) {
    const { locale, setLocale, t } = useI18n();
    return (
      <div>
        <span data-testid={`${id}-locale`}>{locale}</span>
        <span data-testid={`${id}-welcome`}>{t("onboarding.welcome")}</span>
        <button onClick={() => setLocale("en")}>English</button>
        <button onClick={() => setLocale("es")}>Español</button>
      </div>
    );
  }
  return { I18nProvider, Consumer };
}

describe("shared language selection", () => {
  it("keeps the Spanish fallback outside a provider when the saved language is English", async () => {
    localStorage.setItem("vantare.locale", "en");
    const { I18nProvider, Consumer } = await loadConsumer();
    render(
      <>
        <Consumer id="outside" />
        <I18nProvider><Consumer id="inside" /></I18nProvider>
      </>,
    );
    expect(screen.getByTestId("outside-welcome").textContent).toBe("Bienvenido a Vantare");
    expect(screen.getByTestId("inside-welcome").textContent).toBe("Welcome to Vantare");
  });

  it("preserves the last language choice after all pending work settles", async () => {
    const { I18nProvider, Consumer } = await loadConsumer();
    render(<I18nProvider><Consumer id="current" /></I18nProvider>);
    await act(async () => {
      screen.getByRole("button", { name: "English" }).click();
      screen.getByRole("button", { name: "Español" }).click();
      await vi.dynamicImportSettled();
    });
    expect(screen.getByTestId("current-locale").textContent).toBe("es");
    expect(screen.getByTestId("current-welcome").textContent).toBe("Bienvenido a Vantare");
    expect(localStorage.getItem("vantare.locale")).toBe("es");
  });

  it("does not let an earlier provider overwrite the latest choice after remount", async () => {
    const { I18nProvider, Consumer } = await loadConsumer();
    const first = render(<I18nProvider><Consumer id="first" /></I18nProvider>);
    act(() => screen.getByRole("button", { name: "English" }).click());
    first.unmount();
    render(<I18nProvider><Consumer id="second" /></I18nProvider>);
    await act(async () => {
      screen.getByRole("button", { name: "Español" }).click();
      await vi.dynamicImportSettled();
    });
    expect(screen.getByTestId("second-locale").textContent).toBe("es");
    expect(screen.getByTestId("second-welcome").textContent).toBe("Bienvenido a Vantare");
    expect(localStorage.getItem("vantare.locale")).toBe("es");
  });
});
