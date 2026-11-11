import { useEffect, useState } from "react";
import {
  type AppearanceSettings,
  type Palette,
  palettes,
  type SettingsPatch,
  schemes,
} from "../../../contract/generated/contract";
import { Icon } from "../../assets/icons/Icon";
import { t } from "../../i18n/es";
import { onboardingStepsText as text } from "../../i18n/onboarding-pasos";
import { AppearancePreview } from "../AppearancePreview";
import { Segmented } from "../Forms";
import { PalettePicker } from "../PalettePicker";
import { TrackedCaps } from "../TrackedCaps";
import "./appearance-step.css";
export function useResolvedScheme(appearance: AppearanceSettings) {
  const [system, setSystem] = useState<"dark" | "light">(() =>
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const changed = () => setSystem(media.matches ? "dark" : "light");
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  return appearance.scheme === "system" ? system : appearance.scheme;
}
function Swatch({
  palette,
  scheme,
}: {
  palette: Palette;
  scheme: "dark" | "light";
}) {
  return (
    <span
      className="v-ob-look-swatch"
      data-palette={palette}
      data-scheme={scheme}
      aria-hidden="true"
    >
      <i />
      <span>
        <i />
        <span>
          <i />
          <b />
        </span>
      </span>
    </span>
  );
}
export function AppearanceStep({
  appearance,
  disabled,
  pending,
  update,
}: {
  appearance: AppearanceSettings;
  disabled: boolean;
  pending: boolean;
  update: (patch: SettingsPatch) => void;
}) {
  const scheme = useResolvedScheme(appearance);
  return (
    <div className="v-ob-look">
      <PalettePicker
        label={text.palette}
        value={appearance.palette}
        scheme={scheme}
        disabled={disabled}
        pending={pending}
        options={palettes.map((value) => ({
          value,
          label: t(`appearance.${value}`),
        }))}
        onChange={(value) => update({ field: "palette", value })}
        preview={(palette) => <Swatch palette={palette} scheme={scheme} />}
      />
      <Segmented
        label={text.scheme}
        value={appearance.scheme}
        disabled={disabled}
        pending={pending}
        options={schemes.map((value) => ({ value, label: text[value] }))}
        onChange={(next) => {
          const value = schemes.find((value) => value === next);
          if (value) update({ field: "scheme", value });
        }}
      />
    </div>
  );
}
export function AppearanceArt({
  appearance,
}: {
  appearance: AppearanceSettings;
}) {
  const scheme = useResolvedScheme(appearance);
  const palette = t(`appearance.${appearance.palette}`);
  return (
    <div className="v-ob-look-art">
      <AppearancePreview
        palette={palette}
        live={false}
        brand={<Icon name="mark" />}
        navigation={[
          text.home,
          text.overlays,
          text.calendar,
          text.strategy,
          text.settings,
        ].map((label) => ({ label }))}
      >
        <strong>{text.home}</strong>
        <div className="v-ob-look-race">
          <small>
            <TrackedCaps>{text.race}</TrackedCaps>
          </small>
          <div>
            <strong>{text.raceName}</strong>
            <b>{text.openOverlay}</b>
          </div>
        </div>
        <div className="v-ob-look-stats">
          <div>
            <span>{text.position}</span>
            <strong>
              {text.positionValue}
              <small>{text.positionDelta}</small>
            </strong>
          </div>
          <div>
            <span>{text.delta}</span>
            <strong>
              {text.deltaValue}
              <small>{text.best}</small>
            </strong>
          </div>
        </div>
      </AppearancePreview>
      <span className="v-ob-art-caption">
        <TrackedCaps>{text.previewCaption(palette, text[scheme])}</TrackedCaps>
      </span>
    </div>
  );
}
