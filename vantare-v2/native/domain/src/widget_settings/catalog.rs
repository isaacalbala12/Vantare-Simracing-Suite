//! Widget catalog and persisted aggregate, independent of the renderer.
macro_rules! widgets {
    ($($kind:ident => $module:ident: $name:literal),+ $(,)?) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        pub enum Kind { $($kind),+ }

        impl Kind {
            pub const ALL: &'static [Self] = &[$(Self::$kind),+];
            pub const CATALOG:&'static[Self]=&[Self::Standings,Self::Relative,Self::Delta,Self::Pedals,Self::MulticlassRelative,Self::Radar,Self::InputTelemetry,Self::DeltaTrace,Self::PedalsTelemetry,Self::TrackMap,Self::TrackWeather,Self::RacingFlags,Self::FastestLap,Self::HeadToHead,Self::BroadcastTower,Self::CarDamageVisual,Self::FuelStrategy,Self::SessionAlerts];


            /// Nombre de producto; los identificadores de persistencia no cambian.
            pub fn label(self) -> &'static str {
                match self {
                    Self::Standings => "Standings",
                    Self::Radar => "Radar",
                    Self::Pedals => "Pedales",
                    Self::Delta => "Delta",
                    Self::CarDamageVisual => "Daños del coche",
                    Self::InputTelemetry => "Telemetría de entrada",
                    Self::MulticlassRelative => "Relative multiclase",
                    Self::BroadcastTower => "Torre de posiciones",
                    Self::DeltaTrace => "Historial de delta",
                    Self::TrackMap => "Mapa del circuito",
                    Self::TrackWeather => "Tiempo en pista",
                    Self::CarDamageNumbers => "Daños detallados",
                    Self::HeadToHead => "Cara a cara",
                    Self::FuelStrategy => "Fuel y stint",
                    Self::PedalsTelemetry => "Telemetría de pedales",
                    Self::Relative => "Relative",
                    Self::RacingFlags => "Banderas",
                    Self::FastestLap => "Vuelta rápida",
                    Self::SessionAlerts => "Avisos de sesión",
                }
            }

            pub fn name(self) -> &'static str {
                match self { $(Self::$kind => $name),+ }
            }
        }

        impl std::str::FromStr for Kind {
            type Err = ();

            fn from_str(name: &str) -> Result<Self, Self::Err> {
                match name { $($name => Ok(Self::$kind)),+, _ => Err(()) }
            }
        }

        #[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
        #[serde(tag = "kind", rename_all = "kebab-case")]
        pub enum Settings { $($kind(super::$module::Settings)),+ }

        impl Settings {


            pub fn kind(&self) -> Kind {
                match self { $(Self::$kind(_) => Kind::$kind),+ }
            }

            pub fn default_for(kind: Kind) -> Self {
                match kind { $(Kind::$kind => Self::$kind(super::$module::Settings::default())),+ }
            }

            #[must_use]
            pub fn normalized(&self) -> Self {
                match self { $(Self::$kind(settings) => Self::$kind(settings.normalized())),+ }
            }
        }

    };
}
/// Invoke a consumer macro with the single product widget list.
#[macro_export]
macro_rules! widget_catalog {
    ($callback:ident) => {
        $callback! {
            Standings => standings: "standings",
            Radar => radar: "radar",
            Pedals => pedals: "pedals",
            Delta => delta: "delta",
            CarDamageVisual => car_damage_visual: "car-damage-visual",
            InputTelemetry => input_telemetry: "input-telemetry",
            MulticlassRelative => multiclass_relative: "multiclass-relative",
            BroadcastTower => broadcast_tower: "broadcast-tower",
            DeltaTrace => delta_trace: "delta-trace",
            TrackMap => track_map: "track-map",
            TrackWeather => track_weather: "track-weather",
            CarDamageNumbers => car_damage_numbers: "car-damage-numbers",
            HeadToHead => head_to_head: "head-to-head",
            FuelStrategy => fuel_strategy: "fuel-strategy",
            PedalsTelemetry => pedals_telemetry: "pedals-telemetry",
            Relative => relative: "relative",
            RacingFlags => racing_flags: "racing-flags",
            FastestLap => fastest_lap: "fastest-lap",
            SessionAlerts => session_alerts: "session-alerts",
        }
    };
}
widget_catalog!(widgets);

use super::look::{Accent, Look, Tone};
impl Settings {
    /// Controles de apariencia disponibles; los consumidores no clasifican Looks.
    pub fn appearance(&self) -> Option<(Look, Tone, Accent)> {
        let a = match self {
            Self::Standings(s) => (s.design_system, s.style, s.accent),
            Self::Relative(s) => (s.design_system, s.style, s.accent),
            Self::Delta(s) => (s.design_system, s.style, s.accent),
            Self::FuelStrategy(s) => (s.design_system, s.style, s.accent),
            Self::Pedals(s) => (s.design_system, s.style, s.accent),
            _ => return None,
        };
        matches!(a.0, Look::Vantare).then_some(a)
    }
    pub fn editable_columns(&mut self) -> Option<&mut Vec<super::columns::ColumnSetting>> {
        match self {
            Self::Standings(s) => match s.design_system {
                Look::Vantare => Some(
                    s.columns
                        .get_or_insert_with(|| super::standings::vantare_template("standard")),
                ),
                Look::Eficiencia => s.columns.as_mut(),
            },
            Self::Relative(s) => match s.design_system {
                Look::Vantare => Some(
                    s.columns
                        .get_or_insert_with(|| super::relative::vantare_template("standard")),
                ),
                Look::Eficiencia => s.columns.as_mut(),
            },
            _ => None,
        }
    }
    pub fn style_columns_mut(&mut self) -> Option<&mut Vec<super::columns::ColumnSetting>> {
        self.appearance()?;
        self.editable_columns()
    }
    pub fn fixed_relative_preview(&self) -> bool {
        matches!(self, Self::Relative(s) if s.design_system == Look::Eficiencia)
    }
    pub fn preview_row_limit(&self) -> Option<usize> {
        match self {
            Self::Standings(s) if s.design_system == Look::Eficiencia => Some(s.row_count),
            _ => None,
        }
    }
    pub fn look(&self) -> Option<Look> {
        match self {
            Self::Standings(s) => Some(s.design_system),
            Self::Relative(s) => Some(s.design_system),
            Self::Delta(s) => Some(s.design_system),
            Self::FuelStrategy(s) => Some(s.design_system),
            Self::Pedals(s) => Some(s.design_system),
            _ => None,
        }
    }
    pub fn set_look(&mut self, look: Look) {
        match self {
            Self::Standings(s) => {
                *s = s.normalized();
                s.design_system = look;
            }
            Self::Relative(s) => {
                *s = s.normalized();
                s.design_system = look;
            }
            Self::Delta(s) => {
                *s = s.normalized();
                s.design_system = look;
            }
            Self::FuelStrategy(s) => {
                *s = s.normalized();
                s.design_system = look;
            }
            Self::Pedals(s) => {
                *s = s.normalized();
                s.design_system = look;
            }
            _ => {}
        }
    }
    pub fn look_change(&self, next: &Self) -> Option<Look> {
        if !matches!(
            self,
            Self::Standings(_)
                | Self::Relative(_)
                | Self::Delta(_)
                | Self::FuelStrategy(_)
                | Self::Pedals(_)
        ) {
            return None;
        }
        let look = next.look()?;
        if self.look() == Some(look) {
            return None;
        }
        let mut expected = self.clone();
        expected.set_look(look);
        (expected == *next).then_some(look)
    }
}
