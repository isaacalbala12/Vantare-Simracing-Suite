import { useI18n } from "../../../i18n/I18nProvider";
import type { WidgetRendererProps } from "../../core/design-system-definition";
import type { TrackWeatherViewModel } from "../../widget-types/track-weather/track-weather-view-model";
import { functionalLabels } from "./labels";

const n = (value: number | undefined, suffix = ""): string => value === undefined ? "—" : `${value}${suffix ? ` ${suffix}` : ""}`;

export function TrackWeatherFunctional({ model, effects }: WidgetRendererProps<TrackWeatherViewModel>) {
  const { locale } = useI18n();
  const labels = functionalLabels[locale];
  const statusText = model.status !== "ready" ? labels[model.status] : undefined;
  const dry = model.wetnessPercent === undefined ? undefined : 100 - model.wetnessPercent;

  return (
    <section className="vf-track-weather" data-widget-system="vantare-functional" data-widget-renderer="track-weather" data-status={model.status} data-effects={effects}>
      {statusText && <p className="vf-status" role="status">{statusText}</p>}
      {model.statusMessage && model.status !== "stale" && <p className="vf-detail">{model.statusMessage}</p>}
      {model.status === "ready" && (
        <div className="vf-track-weather-grid">
          <span className="vf-track-weather-slot" data-metric="trackC">
            <span className="vf-track-weather-label">{labels.trackTemp}</span>
            <b className="vf-track-weather-value">{n(model.trackC, "°C")}</b>
          </span>
          <span className="vf-track-weather-slot" data-metric="ambientC">
            <span className="vf-track-weather-label">{labels.ambientTemp}</span>
            <b className="vf-track-weather-value">{n(model.ambientC, "°C")}</b>
          </span>
          <span className="vf-track-weather-slot" data-metric="wind">
            <span className="vf-track-weather-label">{labels.wind}</span>
            <b className="vf-track-weather-value">{model.windKph === undefined ? "—" : `${n(model.windKph, "km/h")}${model.windDirection ? ` ${model.windDirection}` : ""}`}</b>
          </span>
          <span className="vf-track-weather-slot" data-metric="rainPercent">
            <span className="vf-track-weather-label">{labels.rain}</span>
            <b className="vf-track-weather-value">{n(model.rainPercent, "%")}</b>
          </span>
          <span className="vf-track-weather-slot" data-metric="wetnessPercent">
            <span className="vf-track-weather-label">{labels.wetness}</span>
            <b className="vf-track-weather-value">{n(model.wetnessPercent, "%")}</b>
          </span>
          {dry !== undefined && (
            <span className="vf-track-weather-slot" data-metric="dryPercent">
              <span className="vf-track-weather-label">{labels.dry}</span>
              <b className="vf-track-weather-value">{dry}%</b>
            </span>
          )}
          <span className="vf-track-weather-slot" data-metric="pressureHpa">
            <span className="vf-track-weather-label">{labels.pressure}</span>
            <b className="vf-track-weather-value">{n(model.pressureHpa, "hPa")}</b>
          </span>
        </div>
      )}
    </section>
  );
}
