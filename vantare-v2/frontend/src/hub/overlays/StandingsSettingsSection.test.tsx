import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileConfig } from "../../lib/profile";
import { createDefaultStandingsColumns } from "../../overlay/widgets/standings-catalog";
import { StandingsSettingsSection } from "./StandingsSettingsSection";

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
        id: "standings",
        type: "standings",
        variantId: "variant-standings-default",
        enabled: true,
        updateHz: 15,
        position: { x: 40, y: 80, w: 360, h: 300 },
        props: { style: "vantare-racing" },
      },
    ],
    variants: [
      {
        id: "variant-standings-default",
        widgetType: "standings",
        templateId: "standings-vantare-default",
        columns: createDefaultStandingsColumns(),
      },
    ],
  };
}

describe("StandingsSettingsSection", () => {
  it("toggles Standings optional columns in the variant only", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(
      <StandingsSettingsSection
        profile={p}
        widget={p.widgets[0]}
        onChangeProfile={onChangeProfile}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Mostrar mejor vuelta standings" }));

    const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.widgets[0].position).toEqual(p.widgets[0].position);
    expect(next.widgets[0].props).toEqual(p.widgets[0].props);
    expect(next.variants?.[0].columns?.find((column) => column.id === "bestLap")?.enabled).toBe(true);
  });

  it("toggles Standings interval column", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(<StandingsSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);
    fireEvent.click(screen.getByRole("switch", { name: "Mostrar intervalo standings" }));

    const next = onChangeProfile.mock.calls[0][0] as ProfileConfig;
    expect(next.variants?.[0].columns?.find((column) => column.id === "interval")?.enabled).toBe(true);
    expect(next.widgets[0].position).toEqual(p.widgets[0].position);
  });

  it("updates Standings driver name formatting in the variant", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(<StandingsSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);

    fireEvent.change(screen.getByLabelText("Formato de nombre standings"), { target: { value: "truncate" } });
    const truncateProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(truncateProfile.variants?.[0].columns?.find((column) => column.id === "driverName")?.format?.mode).toBe("truncate");
    expect(truncateProfile.widgets[0].position).toEqual(p.widgets[0].position);

    cleanup();
    render(<StandingsSettingsSection profile={truncateProfile} widget={truncateProfile.widgets[0]} onChangeProfile={onChangeProfile} />);

    fireEvent.change(screen.getByLabelText("Máximo caracteres nombre standings"), { target: { value: "12" } });
    const maxProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(maxProfile.variants?.[0].columns?.find((column) => column.id === "driverName")?.format?.maxChars).toBe(12);
  });

  it("updates Standings lap format settings in the variant", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(<StandingsSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);

    fireEvent.change(screen.getByLabelText("Formato mejor vuelta standings"), { target: { value: "compact" } });
    const displayProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(displayProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.format?.display).toBe("compact");

    cleanup();
    render(<StandingsSettingsSection profile={displayProfile} widget={displayProfile.widgets[0]} onChangeProfile={onChangeProfile} />);

    fireEvent.change(screen.getByLabelText("Decimales mejor vuelta standings"), { target: { value: "1" } });
    const decimalsProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(decimalsProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.format?.decimals).toBe(1);
  });

  it("updates Standings lap width, color and alignment in the variant", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(<StandingsSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);

    fireEvent.change(screen.getByLabelText("Ancho mejor vuelta standings"), { target: { value: "92" } });
    const widthProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(widthProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.width).toBe(92);

    cleanup();
    render(<StandingsSettingsSection profile={widthProfile} widget={widthProfile.widgets[0]} onChangeProfile={onChangeProfile} />);

    fireEvent.change(screen.getByLabelText("Color mejor vuelta standings"), { target: { value: "#ffcc00" } });
    const colorProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(colorProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.style?.color).toBe("#ffcc00");

    cleanup();
    render(<StandingsSettingsSection profile={colorProfile} widget={colorProfile.widgets[0]} onChangeProfile={onChangeProfile} />);

    fireEvent.change(screen.getByLabelText("Alineación mejor vuelta standings"), { target: { value: "center" } });
    const alignProfile = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(alignProfile.variants?.[0].columns?.find((column) => column.id === "bestLap")?.style?.align).toBe("center");
  });

  it("does not render for non-standings widgets", () => {
    const p = profile();
    const widget = { ...p.widgets[0], id: "relative", type: "relative" };

    const { container } = render(
      <StandingsSettingsSection profile={p} widget={widget} onChangeProfile={vi.fn()} />,
    );

    expect(container.textContent).toBe("");
  });

  it("clamps out-of-range maxChars to the valid range", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(<StandingsSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);

    fireEvent.change(screen.getByLabelText("Máximo caracteres nombre standings"), { target: { value: "999" } });
    const clamped = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(clamped.variants?.[0].columns?.find((column) => column.id === "driverName")?.format?.maxChars).toBe(64);
  });

  it("clamps out-of-range best lap width to the valid range", () => {
    const onChangeProfile = vi.fn();
    const p = profile();

    render(<StandingsSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={onChangeProfile} />);

    fireEvent.change(screen.getByLabelText("Ancho mejor vuelta standings"), { target: { value: "1" } });
    const clamped = onChangeProfile.mock.lastCall?.[0] as ProfileConfig;
    expect(clamped.variants?.[0].columns?.find((column) => column.id === "bestLap")?.width).toBe(36);
  });

  it("uses catalog defaults when the variant column has no configured width", () => {
    const p = profile();
    const variant = p.variants?.[0];
    if (!variant) throw new Error("fixture missing variant");
    variant.columns = (variant.columns ?? []).map((column) =>
      column.id === "bestLap" ? { ...column, width: undefined } : column,
    );

    render(<StandingsSettingsSection profile={p} widget={p.widgets[0]} onChangeProfile={vi.fn()} />);

    const input = screen.getByLabelText("Ancho mejor vuelta standings") as HTMLInputElement;
    expect(input.value).toBe("76");
  });
});
