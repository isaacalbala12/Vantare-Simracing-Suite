import {
  type DeltaSize,
  type OverlayInstance,
  studioWidgetOptions,
  type WidgetSettingsPatch,
} from "../../../contract/generated/studio";
import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Select, Switch } from "../Forms";
import "./appearance.css";

const deltaFormats: Record<DeltaSize, string> = {
  pill: t.deltaPill,
  bar: t.deltaBarFormat,
  expanded: t.deltaExpanded,
};

export function AppearanceInspector({ item }: { item: OverlayInstance }) {
  const state = useStudio();
  const view = state.view;
  // A protected document is not a source of editable user settings.
  if (view?.state !== "ready" || !item.settings)
    return <p className="v-muted">{t.appearanceUnavailable}</p>;
  const settings = item.settings;
  const disabled = item.locked || view.plan === "unverified";
  const blocked = state.pending || disabled;
  const patch = (value: WidgetSettingsPatch) => {
    if (blocked) return;
    void state.execute({
      method: "studio.instance",
      id: item.id,
      baseRevision: view.revision,
      patch: { field: "settings", value },
    });
  };
  return (
    <div className="v-studio-inspector-fields v-studio-appearance">
      <p className="v-muted">
        {disabled
          ? view.plan === "unverified"
            ? t.verifyWidget
            : t.lockedWidget
          : t.appearancePreviewNote}
      </p>
      {settings.kind === "delta" && settings.designSystem === "vantare" && (
        <Select
          label={t.deltaFormat}
          value={settings.size}
          disabled={disabled}
          pending={state.pending}
          options={studioWidgetOptions.delta.sizes.map((value) => ({
            value,
            label: deltaFormats[value],
          }))}
          onChange={(value) => {
            const size = studioWidgetOptions.delta.sizes.find(
              (option) => option === value,
            );
            if (size) patch({ kind: "delta", size });
          }}
        />
      )}
      {settings.kind === "standings" && (
        <dl className="v-field">
          <dt>{t.widgetBrand}</dt>
          <dd>
            {settings.brandVisible === undefined
              ? t.brandAuto
              : settings.brandVisible
                ? t.brandShown
                : t.brandHidden}
          </dd>
          <dd className="v-muted">{t.brandReadOnly}</dd>
        </dl>
      )}
      {(settings.kind === "pedals" ||
        (settings.kind === "delta" && settings.designSystem === "vantare")) && (
        <Switch
          label={t.transparentBackground}
          checked={settings.transparentBackground ?? false}
          disabled={disabled}
          pending={state.pending}
          onCheckedChange={(value) =>
            patch({ kind: settings.kind, transparentBackground: value })
          }
        />
      )}
      {settings.kind === "delta" &&
        settings.designSystem === "vantare" &&
        settings.size !== "pill" && (
          <Switch
            label={t.deltaDifferenceBar}
            checked={settings.showBar}
            disabled={disabled}
            pending={state.pending}
            onCheckedChange={(showBar) => patch({ kind: "delta", showBar })}
          />
        )}
      <Select
        label={t.widgetLook}
        value={settings.designSystem}
        disabled={disabled}
        pending={state.pending}
        options={[
          { value: "eficiencia", label: t.lookEficiencia },
          { value: "vantare", label: t.lookVantare },
        ]}
        onChange={(value) => {
          if (value === "eficiencia" || value === "vantare")
            patch({ kind: settings.kind, designSystem: value });
        }}
      />
      {settings.designSystem === "vantare" && (
        <>
          <Select
            label={t.widgetStyle}
            value={settings.style}
            disabled={disabled}
            pending={state.pending}
            options={[
              { value: "neo", label: t.styleNeo },
              { value: "neutro", label: t.styleNeutral },
            ]}
            onChange={(value) => {
              if (value === "neo" || value === "neutro")
                patch({ kind: settings.kind, style: value });
            }}
          />
          <Select
            label={t.widgetAccent}
            value={settings.accent}
            disabled={disabled}
            pending={state.pending}
            options={[
              { value: "red", label: t.accentRed },
              { value: "amber", label: t.accentAmber },
              { value: "green", label: t.accentGreen },
              { value: "white", label: t.accentWhite },
            ]}
            onChange={(value) => {
              if (
                value === "red" ||
                value === "amber" ||
                value === "green" ||
                value === "white"
              )
                patch({ kind: settings.kind, accent: value });
            }}
          />
        </>
      )}
    </div>
  );
}
