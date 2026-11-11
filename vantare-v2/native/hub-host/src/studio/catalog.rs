//! Closed catalog copied from the frozen product; no GPUI linkage.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum WidgetKind {
    Standings,
    Radar,
    Pedals,
    Delta,
    CarDamageVisual,
    InputTelemetry,
    MulticlassRelative,
    BroadcastTower,
    DeltaTrace,
    TrackMap,
    TrackWeather,
    CarDamageNumbers,
    HeadToHead,
    FuelStrategy,
    PedalsTelemetry,
    Relative,
    RacingFlags,
    FastestLap,
    SessionAlerts,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WidgetInfo {
    pub kind: WidgetKind,
    pub name: String,
    pub category: String,
    pub about: String,
    pub allowed: bool,
    pub suggested: bool,
}
impl WidgetKind {
    pub fn id(self) -> &'static str {
        match self {
            Self::Standings => "standings",
            Self::Radar => "radar",
            Self::Pedals => "pedals",
            Self::Delta => "delta",
            Self::CarDamageVisual => "car-damage-visual",
            Self::InputTelemetry => "input-telemetry",
            Self::MulticlassRelative => "multiclass-relative",
            Self::BroadcastTower => "broadcast-tower",
            Self::DeltaTrace => "delta-trace",
            Self::TrackMap => "track-map",
            Self::TrackWeather => "track-weather",
            Self::CarDamageNumbers => "car-damage-numbers",
            Self::HeadToHead => "head-to-head",
            Self::FuelStrategy => "fuel-strategy",
            Self::PedalsTelemetry => "pedals-telemetry",
            Self::Relative => "relative",
            Self::RacingFlags => "racing-flags",
            Self::FastestLap => "fastest-lap",
            Self::SessionAlerts => "session-alerts",
        }
    }

    pub const ALL: &'static [Self] = &[
        Self::Standings,
        Self::Radar,
        Self::Pedals,
        Self::Delta,
        Self::CarDamageVisual,
        Self::InputTelemetry,
        Self::MulticlassRelative,
        Self::BroadcastTower,
        Self::DeltaTrace,
        Self::TrackMap,
        Self::TrackWeather,
        Self::CarDamageNumbers,
        Self::HeadToHead,
        Self::FuelStrategy,
        Self::PedalsTelemetry,
        Self::Relative,
        Self::RacingFlags,
        Self::FastestLap,
        Self::SessionAlerts,
    ];
    pub const CATALOG: &'static [Self] = &[
        Self::Standings,
        Self::Relative,
        Self::MulticlassRelative,
        Self::BroadcastTower,
        Self::HeadToHead,
        Self::FastestLap,
        Self::SessionAlerts,
        Self::RacingFlags,
        Self::Delta,
        Self::DeltaTrace,
        Self::Pedals,
        Self::PedalsTelemetry,
        Self::InputTelemetry,
        Self::Radar,
        Self::CarDamageVisual,
        Self::FuelStrategy,
        Self::TrackMap,
        Self::TrackWeather,
    ];
    pub fn info(self, access: Option<vantare_ipc::control::CatalogAccess>) -> WidgetInfo {
        let (id, name, category, about) = match self {
            Self::Standings => (
                "standings",
                "Standings",
                "Carrera",
                "Clasificación completa con huecos por clase",
            ),
            Self::Radar => (
                "radar",
                "Radar",
                "Pilotaje",
                "Coches a tu alrededor, vistos desde arriba",
            ),
            Self::Pedals => (
                "pedals",
                "Pedales",
                "Pilotaje",
                "Acelerador, freno y embrague al instante",
            ),
            Self::Delta => (
                "delta",
                "Delta",
                "Pilotaje",
                "Ganas o pierdes contra tu mejor vuelta",
            ),
            Self::CarDamageVisual => (
                "car-damage-visual",
                "Daños del coche",
                "Coche",
                "Silueta con las zonas dañadas",
            ),
            Self::InputTelemetry => (
                "input-telemetry",
                "Telemetría de entrada",
                "Pilotaje",
                "Volante y pedales superpuestos",
            ),
            Self::MulticlassRelative => (
                "multiclass-relative",
                "Relative multiclase",
                "Carrera",
                "Relative con el color de cada clase",
            ),
            Self::BroadcastTower => (
                "broadcast-tower",
                "Torre de posiciones",
                "Carrera",
                "Torre compacta estilo retransmisión",
            ),
            Self::DeltaTrace => (
                "delta-trace",
                "Historial de delta",
                "Pilotaje",
                "Dónde ganas y pierdes a lo largo de la vuelta",
            ),
            Self::TrackMap => (
                "track-map",
                "Mapa del circuito",
                "Pista",
                "Trazado con todos los coches en vivo",
            ),
            Self::TrackWeather => (
                "track-weather",
                "Tiempo en pista",
                "Pista",
                "Temperatura, lluvia y agarre",
            ),
            Self::CarDamageNumbers => (
                "car-damage-numbers",
                "Daños detallados",
                "Coche",
                "Daño por zona, en porcentaje",
            ),
            Self::HeadToHead => (
                "head-to-head",
                "Cara a cara",
                "Carrera",
                "Tú contra un rival, vuelta a vuelta",
            ),
            Self::FuelStrategy => (
                "fuel-strategy",
                "Fuel y stint",
                "Coche",
                "Combustible, consumo y vuelta de parada",
            ),
            Self::PedalsTelemetry => (
                "pedals-telemetry",
                "Telemetría de pedales",
                "Pilotaje",
                "Trazas de acelerador y freno en el tiempo",
            ),
            Self::Relative => (
                "relative",
                "Relative",
                "Carrera",
                "Quién va justo delante y detrás en pista",
            ),
            Self::RacingFlags => (
                "racing-flags",
                "Banderas",
                "Carrera",
                "Bandera activa, sector y motivo",
            ),
            Self::FastestLap => (
                "fastest-lap",
                "Vuelta rápida",
                "Carrera",
                "Mejor vuelta de la sesión y la tuya",
            ),
            Self::SessionAlerts => (
                "session-alerts",
                "Avisos de sesión",
                "Carrera",
                "Cuenta atrás y cambios de sesión LMU; carreras marcadas del calendario",
            ),
        };
        WidgetInfo {
            kind: self,
            name: name.into(),
            category: category.into(),
            about: about.into(),
            allowed: access.is_some_and(|a| a.allows_widget(id)),
            suggested: matches!(self,Self::Standings|Self::Relative|Self::FuelStrategy|Self::RacingFlags|Self::Delta|Self::Pedals|Self::TrackMap|Self::HeadToHead),
        }
    }
}
