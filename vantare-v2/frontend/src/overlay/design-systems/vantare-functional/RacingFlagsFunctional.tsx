import { useMemo, type CSSProperties } from "react";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { RacingFlagsViewModel } from "../../widget-types/racing-flags/racing-flags-view-model";
import { resolveRacingFlagsTextColor } from "./racing-flags-settings";
import { useI18n } from "../../../i18n/I18nProvider";
import { functionalLabels } from "./labels";

function colorLabel(flag: string | undefined, labels: typeof functionalLabels.es): string | undefined {
  switch (flag) {
    case "green": return labels.green;
    case "yellow": return labels.yellow;
    case "red": return labels.red;
    case "blue": return labels.blue;
    case "black": return labels.black;
    case "white": return labels.white;
    case "checkered": return labels.checkered;
    default: return undefined;
  }
}

export function RacingFlagsFunctional({ model, settings, motion, effects }: WidgetRendererProps<RacingFlagsViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const textColor = resolveRacingFlagsTextColor(model.globalFlag, settings.textColor);
  const style = { "--vf-racing-flags-text-color": textColor } as CSSProperties;
  const message = useMemo(() => model.message && model.message.toLowerCase() !== model.globalFlag
    ? model.message
    : colorLabel(model.globalFlag, labels) ?? "—", [model.message, model.globalFlag, labels]);

  if (model.hidden) {
    return (
      <section
        className="vf-racing-flags vf-racing-flags--hidden"
        data-widget-system="vantare-functional"
        data-widget-renderer="racing-flags"
        data-status={model.status}
        data-effects={effects}
        data-motion={motion}
        data-text-color={textColor}
        style={style}
      />
    );
  }

  return (
    <section
      className="vf-racing-flags"
      data-widget-system="vantare-functional"
      data-widget-renderer="racing-flags"
      data-status={model.status}
      data-flag={model.globalFlag ?? "unknown"}
      data-effects={effects}
      data-motion={motion}
      data-text-color={textColor}
      style={style}
    >
      <div className="vf-racing-flags-banner">
        <small>{model.globalFlag === "yellow" ? labels.caution : labels.flag}</small>
        <strong>{message}</strong>
      </div>
      {model.showSectorFlags && model.sectorFlags.length > 0 && (
        <div className="vf-racing-flags-sectors" aria-label={labels.sectors}>
          {model.sectorFlags.map((flag, index) => (
            <span key={index} className="vf-racing-flags-sector" data-flag={flag ?? "unknown"}>
              {flag ? flag[0]?.toUpperCase() : "—"}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
