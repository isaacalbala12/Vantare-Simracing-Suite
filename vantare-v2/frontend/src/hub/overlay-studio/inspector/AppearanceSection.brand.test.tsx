import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetInstanceV3 } from "../../../overlay/core/profile-document";
import type { StudioPolicy } from "../access/studio-access";
import { standingsDefinition } from "../../../overlay/widget-types/standings/standings-definition";
import { I18nProvider } from "../../../i18n/I18nProvider";
import { WidgetPropertyInspectorView } from "./WidgetPropertyInspectorView";

beforeEach(() => localStorage.setItem("vantare.locale", "es"));
afterEach(() => {
  cleanup();
  localStorage.removeItem("vantare.locale");
});

const freePolicy: StudioPolicy = {
  revision: 1, overlaysBasic: true, overlaysAdvanced: false, engineerAI: false,
  brandCrystal: "required", brandEfficiency: "required", brandOriginal: "none",
};
const paidPolicy: StudioPolicy = {
  ...freePolicy, revision: 2, overlaysAdvanced: true,
  brandCrystal: "optional", brandEfficiency: "optional",
};

function standings(systemId: string, showBrand?: boolean): WidgetInstanceV3 {
  const widget = standingsDefinition.createDefault("standings-main");
  widget.visual = {
    ...widget.visual, systemId,
    appearanceOverrides: showBrand === undefined ? {} : { showBrand },
  };
  return widget;
}

function inspector(widget: WidgetInstanceV3, policy: StudioPolicy, dispatch = vi.fn()) {
  return <I18nProvider>
    <WidgetPropertyInspectorView
      sectionId="appearance" widget={widget} session="general"
      runtimeContext={{ playerPresent: false, vehicleCount: 0 }}
      policy={policy} dispatch={dispatch}
    />
  </I18nProvider>;
}

const brandToggle = () => screen.getByRole("button", { name: "Mostrar marca Vantare" });

describe.each(["vantare-crystal", "vantare-functional"])("%s brand preference", (systemId) => {
  it.each([false, true])("preserves the stored preference %s across downgrade and upgrade", (showBrand) => {
    const widget = standings(systemId, showBrand);
    const dispatch = vi.fn();
    const view = render(inspector(widget, paidPolicy, dispatch));
    expect(brandToggle().getAttribute("aria-pressed")).toBe(String(showBrand));
    expect(brandToggle().hasAttribute("disabled")).toBe(false);

    view.rerender(inspector(widget, freePolicy, dispatch));
    expect(brandToggle().getAttribute("aria-pressed")).toBe("true");
    expect(brandToggle().hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("studio-inspector-brand-required-hint").textContent)
      .toBe("Marca obligatoria: siempre visible en este plan");
    fireEvent.click(brandToggle());
    expect(dispatch).not.toHaveBeenCalled();
    expect(widget.visual.appearanceOverrides).toEqual({ showBrand });

    view.rerender(inspector(widget, paidPolicy, dispatch));
    expect(brandToggle().getAttribute("aria-pressed")).toBe(String(showBrand));
    expect(brandToggle().hasAttribute("disabled")).toBe(false);
    expect(screen.queryByTestId("studio-inspector-brand-required-hint")).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("lets paid users opt in and out, with branding off by default", () => {
    const dispatch = vi.fn();
    const view = render(inspector(standings(systemId), paidPolicy, dispatch));
    expect(brandToggle().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(brandToggle());
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "widget/visual", visual: expect.objectContaining({ appearanceOverrides: { showBrand: true } }),
    }));
    view.rerender(inspector(standings(systemId, true), paidPolicy, dispatch));
    fireEvent.click(brandToggle());
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "widget/visual", visual: expect.objectContaining({ appearanceOverrides: { showBrand: false } }),
    }));
  });

  it("requires the brand before any native snapshot arrives", () => {
    render(inspector(standings(systemId), null));
    expect(brandToggle().getAttribute("aria-pressed")).toBe("true");
    expect(brandToggle().hasAttribute("disabled")).toBe(true);
  });
});
