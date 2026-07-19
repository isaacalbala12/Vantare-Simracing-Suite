import type { WidgetRendererProps } from "../../../core/design-system-definition";
import type { TrackWeatherViewModel } from "../../../widget-types/track-weather/track-weather-view-model";

const n = (value: number | undefined, suffix = "") => value === undefined ? "—" : `${value} ${suffix}`.trim();

export function TrackWeatherCrystal({ model }: WidgetRendererProps<TrackWeatherViewModel>) {
  return (
    <section data-widget-system="vantare-crystal" data-widget-renderer="track-weather" data-status={model.status} className="vc-track-weather">
      <div className="vc-weather-box">
        <small>Track Temp</small>
        <div><i data-tone="temperature">TEMP</i><strong>{n(model.trackC, "°C")}</strong></div>
        <p>{model.trackC === undefined ? "Track data unavailable" : "Live track surface"}</p>
      </div>
      <div className="vc-weather-box">
        <small>Track Wetness</small>
        <div className="vc-weather-wet"><b>DRY</b><span><i style={{ width: `${model.wetnessPercent ?? 0}%` }} /></span><b>WET</b></div>
        <p>{model.wetnessPercent === undefined ? "Wetness unavailable" : `${model.wetnessPercent}% wet`}</p>
      </div>
      <div className="vc-weather-box">
        <small>Precipitation</small>
        <div><i data-tone="rain">RAIN</i><strong>{n(model.rainPercent, "%")}</strong></div>
        <p>{model.rainPercent === undefined ? "Precipitation unavailable" : model.rainPercent === 0 ? "No rain detected" : "Precipitation detected"}</p>
      </div>
      <div className="vc-weather-box">
        <small>Wind</small>
        <div>
          <i data-tone="wind">WIND</i>
          <div className="vc-weather-wind-copy">
            <strong>{model.windKph ?? "—"} <span>KPH</span></strong>
            <em>{model.windDirection ?? "Direction unavailable"}</em>
          </div>
        </div>
        <p>{model.pressureHpa === undefined ? "Pressure unavailable" : `${model.pressureHpa} hPa`}</p>
      </div>
    </section>
  );
}
