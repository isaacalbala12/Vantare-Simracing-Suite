//! Proyección pura de `TrackWeatherFunctional`. Las ausencias son guiones;
//! las unidades y los puntos cardinales pertenecen al formateador común.

use crate::format::{self, Language, Preferences};
use crate::{Capability, Quality, Snapshot};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Ready,
    Missing,
    Stale,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Metric {
    pub label: &'static str,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ViewModel {
    pub status: Status,
    pub status_text: &'static str,
    pub metrics: Vec<Metric>,
}

fn valid(value: f64, minimum: f64, maximum: f64) -> bool {
    value.is_finite() && (minimum..=maximum).contains(&value)
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let weather = snapshot.state.session.weather;
    let signals = [
        (weather.track_temperature_k, 0.0, f64::MAX),
        (weather.air_temperature_k, 0.0, f64::MAX),
        (weather.wind_speed_mps, 0.0, f64::MAX),
        (weather.wind_direction_rad, -f64::MAX, f64::MAX),
        (weather.rain, 0.0, 1.0),
        (weather.track_wetness, 0.0, 1.0),
        (weather.pressure_pa, 0.0, f64::MAX),
    ];
    let current =
        signals.map(|(signal, min, max)| signal.current().copied().filter(|v| valid(*v, min, max)));
    let has_current = current.iter().any(Option::is_some);
    let has_stale = signals.iter().any(
        |(signal, min, max)| matches!(signal, Quality::Stale(value) if valid(*value, *min, *max)),
    );
    let status = if !has_current && !has_stale {
        Status::Missing
    } else if !has_current || snapshot.state.capabilities.weather == Capability::WithData {
        Status::Stale
    } else {
        Status::Ready
    };
    let status_text = match (status, prefs.language) {
        (Status::Ready, _) => "",
        (Status::Missing, Language::Es) => "SIN DATOS",
        (Status::Missing, Language::En) => "NO DATA",
        (Status::Stale, Language::Es) => "DATOS ANTIGUOS",
        (Status::Stale, Language::En) => "DATA OUT OF DATE",
    };
    let mut metrics = Vec::new();
    if status == Status::Ready {
        let labels = match prefs.language {
            Language::Es => [
                "PISTA", "AIRE", "VIENTO", "LLUVIA", "HÚMEDO", "SECO", "PRES",
            ],
            Language::En => ["TRACK", "AIR", "WIND", "RAIN", "WET", "DRY", "PRESS"],
        };
        let [track, air, wind, direction, rain, wetness, pressure] = current;
        let mut wind_text = format::speed(wind, prefs);
        if wind.is_some() && direction.is_some() {
            wind_text.push(' ');
            wind_text.push_str(&format::wind_direction(direction, prefs));
        }
        // El productivo separa " %" en lluvia/humedad y omite SECO sin humedad.
        let percent = |value| format::percent(value).replace('%', " %");
        let values = [
            format::temperature(track, prefs),
            format::temperature(air, prefs),
            wind_text,
            percent(rain),
            percent(wetness),
            format::percent(wetness.map(|v| 1.0 - v)),
            format::pressure(pressure),
        ];
        metrics = labels
            .into_iter()
            .zip(values)
            .enumerate()
            .filter(|(index, _)| *index != 5 || wetness.is_some())
            .map(|(_, (label, value))| Metric { label, value })
            .collect();
    }
    ViewModel {
        status,
        status_text,
        metrics,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Weather,
        format::{PLACEHOLDER, Units},
    };

    #[test]
    fn quality_and_empty_states_never_invent_zero() {
        for (quality, capability, status, value) in [
            (
                Quality::Unavailable,
                Capability::Unsupported,
                Status::Missing,
                None,
            ),
            (
                Quality::Unavailable,
                Capability::Fresh,
                Status::Missing,
                None,
            ),
            (
                Quality::Reliable(273.15),
                Capability::Fresh,
                Status::Ready,
                Some("0 °C"),
            ),
            (
                Quality::Estimated(295.15),
                Capability::Fresh,
                Status::Ready,
                Some("22 °C"),
            ),
            (
                Quality::Stale(295.15),
                Capability::WithData,
                Status::Stale,
                None,
            ),
            (
                Quality::Reliable(295.15),
                Capability::WithData,
                Status::Stale,
                None,
            ),
            (
                Quality::Reliable(f64::NAN),
                Capability::Fresh,
                Status::Missing,
                None,
            ),
            (
                Quality::Reliable(f64::INFINITY),
                Capability::Fresh,
                Status::Missing,
                None,
            ),
            (
                Quality::Reliable(-1.0),
                Capability::Fresh,
                Status::Missing,
                None,
            ),
        ] {
            let mut snapshot = Snapshot::default();
            snapshot.state.capabilities.weather = capability;
            snapshot.state.session.weather.air_temperature_k = quality;
            let vm = project(&snapshot, Preferences::default());
            assert_eq!(vm.status, status);
            assert_eq!(vm.metrics.get(1).map(|m| m.value.as_str()), value);
            if status == Status::Ready {
                assert_eq!(vm.metrics[0].value, PLACEHOLDER);
                assert_eq!(vm.metrics.len(), 6); // SECO no existe sin humedad.
            } else {
                assert!(vm.metrics.is_empty());
            }
        }
    }

    #[test]
    fn reference_scene_and_preferences_use_shared_formats() {
        let mut snapshot = Snapshot::default();
        snapshot.state.capabilities.weather = Capability::Fresh;
        snapshot.state.session.weather = Weather {
            track_temperature_k: Quality::Reliable(301.15),
            air_temperature_k: Quality::Reliable(294.15),
            wind_speed_mps: Quality::Reliable(14.0 / 3.6),
            wind_direction_rad: Quality::Reliable(7.0 * std::f64::consts::FRAC_PI_4),
            rain: Quality::Reliable(0.0),
            track_wetness: Quality::Reliable(0.0),
            pressure_pa: Quality::Unavailable,
        };
        for (prefs, expected) in [
            (
                Preferences::default(),
                ["28 °C", "21 °C", "14 km/h NO", "0 %", "0 %", "100%", "—"],
            ),
            (
                Preferences {
                    units: Units::Imperial,
                    language: Language::En,
                },
                ["82 °F", "70 °F", "9 mph NW", "0 %", "0 %", "100%", "—"],
            ),
        ] {
            let vm = project(&snapshot, prefs);
            assert_eq!(vm.status, Status::Ready);
            assert_eq!(
                vm.metrics
                    .iter()
                    .map(|m| m.value.as_str())
                    .collect::<Vec<_>>(),
                expected
            );
        }
    }

    #[test]
    fn partial_weather_hides_stale_and_invalid_fields() {
        for (rain, wetness, expected_rain, expected_dry) in [
            (
                Quality::Reliable(0.25),
                Quality::Reliable(0.75),
                "25 %",
                Some("25%"),
            ),
            (Quality::Stale(0.25), Quality::Unavailable, "—", None),
            (Quality::Reliable(-0.1), Quality::Reliable(1.1), "—", None),
            (
                Quality::Reliable(f64::INFINITY),
                Quality::Reliable(f64::NAN),
                "—",
                None,
            ),
        ] {
            let mut snapshot = Snapshot::default();
            snapshot.state.session.weather = Weather {
                air_temperature_k: Quality::Reliable(295.15),
                wind_direction_rad: Quality::Reliable(0.0),
                rain,
                track_wetness: wetness,
                pressure_pa: Quality::Reliable(101_325.0),
                ..Weather::default()
            };
            let vm = project(&snapshot, Preferences::default());
            assert_eq!(vm.metrics[2].value, PLACEHOLDER); // Dirección sola no inventa velocidad.
            assert_eq!(vm.metrics[3].value, expected_rain);
            assert_eq!(
                vm.metrics
                    .iter()
                    .find(|m| m.label == "SECO")
                    .map(|m| m.value.as_str()),
                expected_dry
            );
            assert_eq!(
                vm.metrics.last().map(|m| m.value.as_str()),
                Some("1013 hPa")
            );
        }
    }
}
