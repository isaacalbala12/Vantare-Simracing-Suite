// Una línea por widget; la macro solo genera módulos y despacho de enums.
// Cada módulo define `Widget::{new, size, ingest, frame, animating}`.
// Una unidad Rust se representa como objeto vacío en el enum con tag interno.
#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
pub(crate) struct EmptySettings {}

macro_rules! empty_settings {
    () => {
        #[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
        #[serde(
            rename_all = "camelCase",
            from = "crate::EmptySettings",
            into = "crate::EmptySettings"
        )]
        pub struct Settings;

        impl From<crate::EmptySettings> for Settings {
            fn from(_: crate::EmptySettings) -> Self {
                Self
            }
        }
        impl From<Settings> for crate::EmptySettings {
            fn from(_: Settings) -> Self {
                Self {}
            }
        }
        impl Settings {
            #[must_use]
            pub fn normalized(&self) -> Self {
                self.clone()
            }
        }
    };
}

macro_rules! widgets {
    ($($kind:ident => $module:ident: $name:literal),+ $(,)?) => {
        $(pub mod $module;)+

        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        pub enum Kind { $($kind),+ }

        impl Kind {
            pub const ALL: &'static [Self] = &[$(Self::$kind),+];

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
        pub enum Settings { $($kind($module::Settings)),+ }

        impl Settings {
            pub fn kind(&self) -> Kind {
                match self { $(Self::$kind(_) => Kind::$kind),+ }
            }

            pub fn default_for(kind: Kind) -> Self {
                match kind { $(Kind::$kind => Self::$kind($module::Settings::default())),+ }
            }

            #[must_use]
    pub fn normalized(&self) -> Self {
                match self { $(Self::$kind(settings) => Self::$kind(settings.normalized())),+ }
            }
        }

        pub(crate) enum Widget { $($kind(Box<$module::Widget>)),+ }

        impl Widget {
            pub(crate) fn new(settings: &Settings, prefs: vantare_domain::format::Preferences) -> Self {
                match settings { $(Settings::$kind(settings) => Self::$kind(Box::new($module::Widget::new(settings, prefs)))),+ }
            }

            #[cfg(feature = "paint-stats")]
            pub(crate) fn kind(&self) -> Kind {
                match self { $(Self::$kind(_) => Kind::$kind),+ }
            }

            pub(crate) fn size(&self) -> (f32, f32) {
                match self { $(Self::$kind(widget) => widget.size()),+ }
            }

            pub(crate) fn ingest(&mut self, snapshot: &vantare_domain::Snapshot, prefs: vantare_domain::format::Preferences) -> bool {
                match self { $(Self::$kind(widget) => widget.ingest(snapshot, prefs)),+ }
            }

            pub(crate) fn frame(&mut self, prefs: vantare_domain::format::Preferences) -> (crate::app::Paint, crate::app::Wake) {
                match self { $(Self::$kind(widget) => widget.frame(prefs)),+ }
            }

            #[cfg(feature = "parity-capture")]
            pub(crate) fn animating(&self) -> bool {
                match self { $(Self::$kind(widget) => widget.animating()),+ }
            }
        }
    }
}

widgets! {
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
}
