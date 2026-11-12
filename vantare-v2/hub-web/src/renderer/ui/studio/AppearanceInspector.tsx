import type {
  OverlayInstance,
  WidgetSettingsPatch,
} from "../../../contract/generated/studio";
import { studioText as t } from "../../i18n/studio";
import { useStudio } from "../../screens/studio/state";
import { Select } from "../Forms";
import "./appearance.css";

export function AppearanceInspector({ item }: { item: OverlayInstance }) {
  const state = useStudio();
  const view = state.view;
  // A protected document is not a source of editable user settings.
  if (view?.state !== "ready" || !item.settings)
    return <p className="v-muted">{t.appearanceUnavailable}</p>;
  const settings = item.settings;
  const blocked = state.pending || item.locked || view.plan === "unverified";
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
      <p className="v-muted">{t.appearancePreviewNote}</p>
      <Select
        label={t.widgetLook}
        value={settings.designSystem}
        pending={blocked}
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
            pending={blocked}
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
            pending={blocked}
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
      <div className="v-field">
        <span>{t.widgetBrand}</span>
        <output>
          {settings.brandVisible === undefined
            ? t.brandAuto
            : settings.brandVisible
              ? t.brandShown
              : t.brandHidden}
        </output>
        <p className="v-muted">{t.brandReadOnly}</p>
      </div>
    </div>
  );
}
