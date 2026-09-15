import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/I18nProvider";
import type { WidgetInstanceV3 } from "../../core/profile-document";
import { standingsDefinition } from "./standings-definition";
import { StandingsContentInspector } from "./StandingsContentInspector";

afterEach(() => cleanup());

function renderInspector(widget?: WidgetInstanceV3) {
  const onContentChange = vi.fn();
  render(
    <I18nProvider>
      <StandingsContentInspector
        widget={widget ?? standingsDefinition.createDefault("standings-test")}
        onContentChange={onContentChange}
      />
    </I18nProvider>,
  );
  return onContentChange;
}

// El locale por defecto del provider es `es`.
describe("StandingsContentInspector driver-name format", () => {
  it("offers the three formats on the Piloto column and none on the others", () => {
    renderInspector();
    expect(screen.getByTestId("studio-standings-column-name-format-driverName")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Nombre · Piloto" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Nombre · Posición" })).toBeNull();
  });

  it.each([
    { option: "N. Apellido", mode: "initial" },
    { option: "Apellido", mode: "surname" },
    { option: "Completo", mode: "full" },
  ])("publishes format.mode=$mode keeping the rest of the column format", ({ option, mode }) => {
    const onContentChange = renderInspector();
    const group = screen.getByRole("group", { name: "Nombre · Piloto" });
    fireEvent.click(within(group).getByRole("button", { name: option }));
    expect(onContentChange).toHaveBeenCalledTimes(1);
    const next = onContentChange.mock.calls[0]?.[0] as {
      columns: { metricId: string; format?: Record<string, unknown> }[];
    };
    const driver = next.columns.find((column) => column.metricId === "driverName");
    expect(driver?.format).toMatchObject({ mode, maxChars: 16 });
  });
});
