import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileConfig } from "../../lib/profile";
import { RelativeSettingsSection } from "./RelativeSettingsSection";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function profile(): ProfileConfig {
  return {
    schemaVersion: 2,
    id: "v2",
    displayMode: "edit",
    monitorIndex: 0,
    widgets: [
      {
        id: "relative",
        type: "relative",
        variantId: "variant-relative-default",
        enabled: true,
        position: { x: 40, y: 600, w: 320, h: 280 },
        props: { rangeAhead: 3, rangeBehind: 3 },
      },
    ],
    variants: [
      {
        id: "variant-relative-default",
        widgetType: "relative",
        templateId: "relative-vantare-default",
        columns: [
          { id: "position", metricId: "position", enabled: true },
          { id: "class", metricId: "class", enabled: true },
          { id: "carNumber", metricId: "carNumber", enabled: true },
          { id: "driverName", metricId: "driverName", enabled: true },
          { id: "gap", metricId: "gap", enabled: true },
          { id: "bestLap", metricId: "bestLap", enabled: false },
          { id: "lastLap", metricId: "lastLap", enabled: false },
        ],
      },
    ],
  };
}

describe("RelativeSettingsSection", () => {
  it("toggles best lap column in the variant", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Mostrar mejor vuelta" }));

    const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.widgets[0].position).toEqual(p.widgets[0].position);
    expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.enabled).toBe(true);
  });

  it("toggles last lap column in the variant", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Mostrar última vuelta" }));

    const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.variants?.[0].columns?.find((column) => column.id === "lastLap")?.enabled).toBe(true);
  });

  it("updates driver name truncation settings in the variant", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.change(screen.getByLabelText("Formato de nombre"), { target: { value: "truncate" } });
    const truncateProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(truncateProfile.widgets[0].position).toEqual(p.widgets[0].position);
    expect(truncateProfile.variants?.[0].columns?.find((column) => column.id === "driverName")?.format?.mode).toBe("truncate");

    cleanup();
    render(
      <RelativeSettingsSection
        profile={truncateProfile}
        widget={truncateProfile.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );
    fireEvent.change(screen.getByLabelText("Máximo caracteres nombre"), { target: { value: "14" } });
    const maxProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(maxProfile.variants?.[0].columns?.find((column) => column.id === "driverName")?.format?.maxChars).toBe(14);
  });

  it("updates lap format settings in the variant", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.change(screen.getByLabelText("Formato mejor vuelta"), { target: { value: "compact" } });
    const displayProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(displayProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.format?.display).toBe("compact");

    cleanup();
    render(
      <RelativeSettingsSection
        profile={displayProfile}
        widget={displayProfile.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );
    fireEvent.change(screen.getByLabelText("Decimales mejor vuelta"), { target: { value: "1" } });
    const decimalsProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(decimalsProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.format?.decimals).toBe(1);
  });

  it("updates width, color and alignment settings in the variant", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.change(screen.getByLabelText("Ancho mejor vuelta"), { target: { value: "88" } });
    const widthProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(widthProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.width).toBe(88);

    cleanup();
    render(
      <RelativeSettingsSection
        profile={widthProfile}
        widget={widthProfile.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );
    fireEvent.change(screen.getByLabelText("Color mejor vuelta"), { target: { value: "#ffcc00" } });
    const colorProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(colorProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.style?.color).toBe("#ffcc00");

    cleanup();
    render(
      <RelativeSettingsSection
        profile={colorProfile}
        widget={colorProfile.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );
    fireEvent.change(screen.getByLabelText("Alineación mejor vuelta"), { target: { value: "center" } });
    const alignProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(alignProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.style?.align).toBe("center");
  });

  it("does not render for non-relative widgets", () => {
    const p = profile();
    const widget = { ...p.widgets[0], id: "delta", type: "delta" };

    const { container } = render(
      <RelativeSettingsSection profile={p} widget={widget} onChangeProfile={vi.fn()} />,
    );

    expect(container.textContent).toBe("");
  });

  it("updates Relative range filters in the variant only", () => {
    const onChangeProfile = vi.fn();
    const p = profile();
    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    const filters = screen.getByTestId("relative-filters");
    fireEvent.change(within(filters).getByLabelText("Coches delante"), { target: { value: "2" } });

    const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.variants?.[0].filters?.rangeAhead).toBe(2);
    expect(next.widgets[0].props?.rangeAhead).toBe(3);
    expect(next.widgets[0].position).toEqual(p.widgets[0].position);
  });

  it("updates Relative class scope and player visibility in the variant", () => {
    const onChangeProfile = vi.fn();
    const p = profile();
    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    const filters = screen.getByTestId("relative-filters");
    fireEvent.change(within(filters).getByLabelText("Filtro de clase"), { target: { value: "sameClass" } });
    let next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.variants?.[0].filters?.classScope).toBe("sameClass");
    expect(next.widgets[0].props?.rangeAhead).toBe(3);
    expect(next.widgets[0].position).toEqual(p.widgets[0].position);

    onChangeProfile.mockClear();
    fireEvent.click(within(filters).getByRole("switch", { name: "Mostrar coche del jugador" }));
    next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.variants?.[0].filters?.includePlayer).toBe(false);
    expect(next.widgets[0].position).toEqual(p.widgets[0].position);
  });

  it("offers Coches delante as a 0 to 4 selector", () => {
    const onChangeProfile = vi.fn();
    const p = profile();
    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    const filters = screen.getByTestId("relative-filters");
    const rangeAheadSelect = within(filters).getByLabelText("Coches delante");
    expect(within(rangeAheadSelect).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["0", "1", "2", "3", "4"]);
    fireEvent.change(rangeAheadSelect, { target: { value: "4" } });

    const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.variants?.[0].filters?.rangeAhead).toBe(4);
    expect(next.widgets[0].props?.rangeAhead).toBe(3);
  });

  it("offers Coches detrás as a 0 to 4 selector", () => {
    const onChangeProfile = vi.fn();
    const p = profile();
    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    const filters = screen.getByTestId("relative-filters");
    const rangeBehindSelect = within(filters).getByLabelText("Coches detrás");
    expect(within(rangeBehindSelect).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["0", "1", "2", "3", "4"]);
    fireEvent.change(rangeBehindSelect, { target: { value: "0" } });

    const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.variants?.[0].filters?.rangeBehind).toBe(0);
    expect(next.widgets[0].props?.rangeBehind).toBe(3);
  });

  it("updates Relative row height mode in the variant only", () => {
    const onChangeProfile = vi.fn();
    const p = profile();
    render(
      <RelativeSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    const filters = screen.getByTestId("relative-filters");
    fireEvent.change(within(filters).getByLabelText("Altura de filas"), { target: { value: "compact" } });

    const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.variants?.[0].filters?.rowHeightMode).toBe("compact");
    expect(next.widgets[0].position).toEqual(p.widgets[0].position);
  });
});
