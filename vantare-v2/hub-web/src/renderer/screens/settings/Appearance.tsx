import { useEffect, useState } from "react";
import {
  contrastRange,
  glassOpacityRange,
  interfaceFonts,
  monoFonts,
  palettes,
  schemes,
} from "../../../contract/generated/contract";
import { useSettings } from "../../app/SettingsState";
import { applyAppearance } from "../../design/appearance";
import { t } from "../../i18n/es";
import { Card, SettingRow } from "../../ui/Data";
import { RadioGroup, Select, Slider, Switch } from "../../ui/Forms";
import { PalettePicker } from "../../ui/PalettePicker";

function AppearanceSlider({
  field,
  label,
}: {
  field: "contrast" | "glassOpacity";
  label: string;
}) {
  const state = useSettings();
  const value = state.view?.appearance[field] ?? 100;
  const [preview, setPreview] = useState(value);
  useEffect(() => {
    if (!state.pending) setPreview(value);
  }, [value, state.pending]);
  return (
    <Slider
      label={label}
      hideLabel
      value={preview}
      min={field === "contrast" ? contrastRange[0] : glassOpacityRange[0]}
      max={field === "contrast" ? contrastRange[1] : glassOpacityRange[1]}
      disabled={state.view?.protected || Boolean(state.error)}
      pending={state.pending}
      onChange={(value) => {
        setPreview(value);
        if (state.view)
          applyAppearance(
            { ...state.view.appearance, [field]: value },
            state.view.general.density,
            state.view.zoom,
          );
      }}
      onValueCommitted={(value) => state.update({ field, value })}
    />
  );
}
export function Appearance() {
  const state = useSettings();
  const [system, setSystem] = useState<"dark" | "light">(() =>
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystem(media.matches ? "dark" : "light");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  if (!state.view) return null;
  const view = state.view;
  const appearance = view.appearance;
  const disabled = view.protected || Boolean(state.error);
  const scheme = appearance.scheme === "system" ? system : appearance.scheme;
  return (
    <>
      <Card title={t("appearance.scheme")}>
        <RadioGroup
          pending={state.pending}
          label={t("appearance.scheme")}
          value={appearance.scheme}
          options={schemes.map((value) => ({
            value,
            label: t(`appearance.${value}`),
            disabled,
          }))}
          onChange={(next) => {
            const value = schemes.find((value) => value === next);
            if (value) state.update({ field: "scheme", value });
          }}
        />
      </Card>
      <Card title={t("appearance.themes")}>
        <PalettePicker
          label={t("appearance.themes")}
          value={appearance.palette}
          scheme={scheme}
          options={palettes.map((value) => ({
            value,
            label: t(`appearance.${value}`),
          }))}
          disabled={disabled}
          pending={state.pending}
          onChange={(value) => state.update({ field: "palette", value })}
        />
      </Card>
      <Card title={t("general.interface")}>
        <SettingRow
          label={t("appearance.contrast")}
          description={t("appearance.contrastHelp")}
        >
          <AppearanceSlider field="contrast" label={t("appearance.contrast")} />
        </SettingRow>
        <SettingRow
          label={t("appearance.opacity")}
          description={t("appearance.opacityHelp")}
        >
          <AppearanceSlider
            field="glassOpacity"
            label={t("appearance.opacity")}
          />
        </SettingRow>
        <SettingRow
          label={t("appearance.font")}
          description={t("appearance.fontHelp")}
        >
          <Select
            label={t("appearance.font")}
            hideLabel
            options={interfaceFonts.map((value) => ({
              value,
              label: t(`appearance.${value}`),
            }))}
            value={appearance.interfaceFont}
            disabled={disabled}
            pending={state.pending}
            onChange={(next) => {
              const value = interfaceFonts.find((value) => value === next);
              if (value) state.update({ field: "interfaceFont", value });
            }}
          />
        </SettingRow>
        <SettingRow
          label={t("appearance.monoFont")}
          description={t("appearance.monoFontHelp")}
        >
          <Select
            label={t("appearance.monoFont")}
            hideLabel
            options={monoFonts.map((value) => ({
              value,
              label: t(`appearance.${value}`),
            }))}
            value={appearance.monoFont}
            disabled={disabled}
            pending={state.pending}
            onChange={(next) => {
              const value = monoFonts.find((value) => value === next);
              if (value) state.update({ field: "monoFont", value });
            }}
          />
        </SettingRow>
      </Card>
      <Card title={t("appearance.motion")}>
        <SettingRow
          label={t("appearance.reduce")}
          description={t("appearance.reduceHelp")}
        >
          <Switch
            label={t("appearance.reduce")}
            hideLabel
            checked={appearance.reducedMotion}
            disabled={disabled}
            pending={state.pending && state.field === "reducedMotion"}
            onCheckedChange={(value) =>
              state.update({ field: "reducedMotion", value })
            }
          />
        </SettingRow>
      </Card>
    </>
  );
}
