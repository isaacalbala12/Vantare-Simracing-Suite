//! Frozen writer schema from #2341 ca31f3b9e; compare bytes through the real shared writer.
#[allow(dead_code)] // Frozen pre-extraction schema, including its unchanged helpers.
mod legacy {
    use serde::{Deserialize, Serialize};
    use std::collections::HashSet;
    use vantare_domain::format::Preferences;
    // Frozen aggregate tags and dispatch from the pre-extraction UI registry.
    #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
    #[serde(tag = "kind", rename_all = "kebab-case")]
    pub enum Settings {
        Standings(vantare_domain::widget_settings::standings::Settings),
        Radar(vantare_domain::widget_settings::radar::Settings),
        Pedals(vantare_domain::widget_settings::pedals::Settings),
        Delta(vantare_domain::widget_settings::delta::Settings),
        CarDamageVisual(vantare_domain::widget_settings::car_damage_visual::Settings),
        InputTelemetry(vantare_domain::widget_settings::input_telemetry::Settings),
        MulticlassRelative(vantare_domain::widget_settings::multiclass_relative::Settings),
        BroadcastTower(vantare_domain::widget_settings::broadcast_tower::Settings),
        DeltaTrace(vantare_domain::widget_settings::delta_trace::Settings),
        TrackMap(vantare_domain::widget_settings::track_map::Settings),
        TrackWeather(vantare_domain::widget_settings::track_weather::Settings),
        CarDamageNumbers(vantare_domain::widget_settings::car_damage_numbers::Settings),
        HeadToHead(vantare_domain::widget_settings::head_to_head::Settings),
        FuelStrategy(vantare_domain::widget_settings::fuel_strategy::Settings),
        PedalsTelemetry(vantare_domain::widget_settings::pedals_telemetry::Settings),
        Relative(vantare_domain::widget_settings::relative::Settings),
        RacingFlags(vantare_domain::widget_settings::racing_flags::Settings),
        FastestLap(vantare_domain::widget_settings::fastest_lap::Settings),
        SessionAlerts(vantare_domain::widget_settings::session_alerts::Settings),
    }
    impl Settings {
        pub fn normalized(&self) -> Self {
            match self {
                Self::Standings(settings) => Self::Standings(settings.normalized()),
                Self::Radar(settings) => Self::Radar(settings.normalized()),
                Self::Pedals(settings) => Self::Pedals(settings.normalized()),
                Self::Delta(settings) => Self::Delta(settings.normalized()),
                Self::CarDamageVisual(settings) => Self::CarDamageVisual(settings.normalized()),
                Self::InputTelemetry(settings) => Self::InputTelemetry(settings.normalized()),
                Self::MulticlassRelative(settings) => {
                    Self::MulticlassRelative(settings.normalized())
                }
                Self::BroadcastTower(settings) => Self::BroadcastTower(settings.normalized()),
                Self::DeltaTrace(settings) => Self::DeltaTrace(settings.normalized()),
                Self::TrackMap(settings) => Self::TrackMap(settings.normalized()),
                Self::TrackWeather(settings) => Self::TrackWeather(settings.normalized()),
                Self::CarDamageNumbers(settings) => Self::CarDamageNumbers(settings.normalized()),
                Self::HeadToHead(settings) => Self::HeadToHead(settings.normalized()),
                Self::FuelStrategy(settings) => Self::FuelStrategy(settings.normalized()),
                Self::PedalsTelemetry(settings) => Self::PedalsTelemetry(settings.normalized()),
                Self::Relative(settings) => Self::Relative(settings.normalized()),
                Self::RacingFlags(settings) => Self::RacingFlags(settings.normalized()),
                Self::FastestLap(settings) => Self::FastestLap(settings.normalized()),
                Self::SessionAlerts(settings) => Self::SessionAlerts(settings.normalized()),
            }
        }
        pub fn demand(&self) -> vantare_ipc::Demand {
            match self {
                Self::Standings(settings) => settings.demand(),
                Self::Radar(settings) => settings.demand(),
                Self::Pedals(settings) => settings.demand(),
                Self::Delta(settings) => settings.demand(),
                Self::CarDamageVisual(settings) => settings.demand(),
                Self::InputTelemetry(settings) => settings.demand(),
                Self::MulticlassRelative(settings) => settings.demand(),
                Self::BroadcastTower(settings) => settings.demand(),
                Self::DeltaTrace(settings) => settings.demand(),
                Self::TrackMap(settings) => settings.demand(),
                Self::TrackWeather(settings) => settings.demand(),
                Self::CarDamageNumbers(settings) => settings.demand(),
                Self::HeadToHead(settings) => settings.demand(),
                Self::FuelStrategy(settings) => settings.demand(),
                Self::PedalsTelemetry(settings) => settings.demand(),
                Self::Relative(settings) => settings.demand(),
                Self::RacingFlags(settings) => settings.demand(),
                Self::FastestLap(settings) => settings.demand(),
                Self::SessionAlerts(settings) => settings.demand(),
            }
        }
    }
    use vantare_ipc::{layout::Error, widget_demand::SettingsDemand as _};
    pub const VERSION: u32 = 1;
    /// Lectura preparada; escribir v2 se activa en 8B tras publicar el puente.
    pub const READ_VERSION: u32 = 2;
    pub const MAX_BYTES: u64 = 1024 * 1024;

    /// Resolución lógica del cliente: usa las mismas coordenadas que los overlays.
    #[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
    #[serde(deny_unknown_fields)]
    pub struct CanvasResolution {
        pub width: f32,
        pub height: f32,
    }
    impl CanvasResolution {
        pub fn valid(self) -> bool {
            [self.width, self.height]
                .into_iter()
                .all(|value| value.is_finite() && (64.0..=32_768.0).contains(&value))
        }
    }

    #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    pub struct Layout {
        pub version: u32,
        pub instances: Vec<Instance>,
        /// Solo lectura en 8A: ningún control lo añade al layout v1.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub reduced_motion: Option<bool>,
        /// Extensiones aditivas: conservar datos desconocidos durante un roundtrip.
        #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
        pub extensions: std::collections::BTreeMap<String, serde_json::Value>,
        /// Ausente en layouts anteriores: seguir el monitor donde están los overlays.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pub canvas_resolution: Option<CanvasResolution>,
        /// Un solo documento permite aplicar formato y layout con la misma recarga.
        /// Los documentos v1 anteriores conservan ES/métrico por defecto.
        #[serde(default, with = "preferences")]
        pub preferences: Preferences,
        #[serde(
            default,
            skip_serializing_if = "vantare_domain::performance::Preferences::is_default"
        )]
        pub performance: vantare_domain::performance::Preferences,
        /// Opt-in global; los layouts anteriores conservan overlays visibles.
        #[serde(default, skip_serializing_if = "disabled")]
        pub hide_off_track: bool,
    }

    impl Default for Layout {
        fn default() -> Self {
            Self {
                version: VERSION,
                instances: Vec::new(),
                reduced_motion: None,
                extensions: std::collections::BTreeMap::new(),
                canvas_resolution: None,
                preferences: Preferences::default(),
                performance: vantare_domain::performance::Preferences::default(),
                hide_off_track: false,
            }
        }
    }

    // El dominio sigue siendo puro y no depende de serde: el formato persistido
    // pertenece a UI, igual que las posiciones y Settings.
    mod preferences {
        use serde::{Deserialize, Deserializer, Serialize, Serializer};
        use vantare_domain::format::{Language, Preferences, Units};

        #[derive(Serialize, Deserialize)]
        #[serde(rename_all = "lowercase")]
        enum Unit {
            Metric,
            Imperial,
        }
        #[derive(Serialize, Deserialize)]
        #[serde(rename_all = "lowercase")]
        enum Locale {
            Es,
            En,
        }
        #[derive(Serialize, Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Stored {
            units: Unit,
            language: Locale,
        }

        #[allow(clippy::trivially_copy_pass_by_ref)] // Firma requerida por serde(with).
        pub fn serialize<S: Serializer>(
            prefs: &Preferences,
            serializer: S,
        ) -> Result<S::Ok, S::Error> {
            Stored {
                units: match prefs.units {
                    Units::Metric => Unit::Metric,
                    Units::Imperial => Unit::Imperial,
                },
                language: match prefs.language {
                    Language::Es => Locale::Es,
                    Language::En => Locale::En,
                },
            }
            .serialize(serializer)
        }
        pub fn deserialize<'de, D: Deserializer<'de>>(
            deserializer: D,
        ) -> Result<Preferences, D::Error> {
            let stored = Stored::deserialize(deserializer)?;
            Ok(Preferences {
                units: match stored.units {
                    Unit::Metric => Units::Metric,
                    Unit::Imperial => Units::Imperial,
                },
                language: match stored.language {
                    Locale::Es => Language::Es,
                    Locale::En => Language::En,
                },
            })
        }
    }

    #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    pub struct Instance {
        pub id: String,
        pub x: f32,
        pub y: f32,
        #[serde(default = "visible")]
        pub visible: bool,
        /// Sesiones en las que se dibuja (#1564); todas si falta.
        #[serde(
            default,
            skip_serializing_if = "vantare_domain::widget_session::ShowIn::is_all"
        )]
        pub show_in: vantare_domain::widget_session::ShowIn,
        #[serde(default = "opaque")]
        pub opacity: f32,
        #[serde(
            default,
            skip_serializing_if = "vantare_domain::geometry::Geometry::is_default"
        )]
        pub geometry: vantare_domain::geometry::Geometry,
        pub settings: Settings,
        #[serde(default, skip_serializing_if = "OffTrack::is_default")]
        pub off_track: OffTrack,
    }

    #[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
    #[serde(rename_all = "snake_case")]
    pub enum OffTrack {
        #[default]
        Inherit,
        AlwaysVisible,
        Hide,
    }

    impl OffTrack {
        #[allow(clippy::trivially_copy_pass_by_ref)] // Firma requerida por serde.
        fn is_default(&self) -> bool {
            *self == Self::Inherit
        }
    }

    #[allow(clippy::trivially_copy_pass_by_ref)] // Firma requerida por serde.
    fn disabled(value: &bool) -> bool {
        !*value
    }

    impl Instance {
        pub fn hidden_off_track(
            &self,
            global: bool,
            situation: vantare_domain::DrivingSituation,
        ) -> bool {
            situation.off_track()
                && match self.off_track {
                    OffTrack::Inherit => global,
                    OffTrack::AlwaysVisible => false,
                    OffTrack::Hide => true,
                }
        }
    }

    const fn visible() -> bool {
        true
    }
    const fn opaque() -> f32 {
        1.0
    }

    impl Layout {
        pub fn demand(&self) -> vantare_ipc::Demand {
            let mut demand = vantare_ipc::Demand::default();
            for instance in self.instances.iter().filter(|instance| instance.visible) {
                demand.union(&instance.settings.demand());
                if !instance.show_in.is_all() {
                    demand.request(vantare_ipc::Signal::SessionInfo, 250);
                }
            }
            demand
        }

        /// Acota entradas del editor sin guardar tamaños calculados por los widgets.
        pub fn normalized(mut self) -> Result<Self, Error> {
            if !(VERSION..=READ_VERSION).contains(&self.version) {
                return Err(Error::Unsupported(self.version));
            }
            if self.version == VERSION
                && (self.reduced_motion.is_some() || !self.extensions.is_empty())
            {
                return Err(Error::Unsupported(self.version));
            }
            if !self.performance.valid() {
                return Err(Error::Invalid("frecuencia de widget no válida"));
            }
            if self
                .canvas_resolution
                .is_some_and(|resolution| !resolution.valid())
            {
                return Err(Error::Invalid("resolución de lienzo no válida"));
            }
            let mut ids = HashSet::new();
            for instance in &mut self.instances {
                if instance.id.trim().is_empty() || !ids.insert(instance.id.clone()) {
                    return Err(Error::Invalid("ID de instancia vacío o duplicado"));
                }
                for position in [&mut instance.x, &mut instance.y] {
                    *position = if position.is_finite() {
                        position.clamp(-100_000.0, 100_000.0)
                    } else {
                        0.0
                    };
                }
                instance.opacity = if instance.opacity.is_finite() {
                    instance.opacity.clamp(0.0, 1.0)
                } else {
                    1.0
                };
                if let Some(size) = instance.geometry.size {
                    if !size.valid() {
                        return Err(Error::Invalid("tamaño del frame no finito o no positivo"));
                    }
                    instance.geometry.size = Some(size.bounded());
                }
                instance.settings = instance.settings.normalized();
            }
            normalize_companions(&mut self);
            Ok(self)
        }

        pub fn from_json(bytes: &[u8]) -> Result<Self, Error> {
            if bytes.len() as u64 > MAX_BYTES {
                return Err(Error::Invalid("layout supera 1 MiB"));
            }
            serde_json::from_slice::<Self>(bytes)
                .map_err(Error::Json)?
                .normalized()
        }
    }

    fn normalize_companions(layout: &mut Layout) {
        let parents: Vec<_> = layout
            .instances
            .iter()
            .filter_map(|i| match &i.settings {
                Settings::SessionAlerts(s) if s.companion_for.is_none() => {
                    Some((i.clone(), s.clone()))
                }
                _ => None,
            })
            .collect();
        layout.instances.retain(|i| {
            !matches!(&i.settings, Settings::SessionAlerts(s)
        if s.companion_for.as_ref().is_some_and(|id| !parents.iter().any(|(p,_)| &p.id == id)))
        });
        for (parent, mut settings) in parents {
            settings.companion_for = Some(parent.id.clone());
            if let Some(mini) = layout.instances.iter_mut().find(|i| {
                matches!(&i.settings,
            Settings::SessionAlerts(s) if s.companion_for.as_ref()==Some(&parent.id))
            }) {
                mini.settings = Settings::SessionAlerts(settings);
                mini.visible = parent.visible;
                mini.show_in = parent.show_in;
                mini.off_track = parent.off_track;
                mini.opacity = parent.opacity;
            } else {
                let mut mini = parent.clone();
                mini.id = format!("{}-mini", parent.id);
                if layout.instances.iter().any(|i| i.id == mini.id) {
                    continue;
                }
                let width = layout.canvas_resolution.map_or(1920.0, |c| c.width);
                mini.x = width - 226.0;
                mini.y = 92.0;
                mini.geometry = vantare_domain::geometry::Geometry::default();
                mini.settings = Settings::SessionAlerts(settings);
                layout.instances.push(mini);
            }
        }
    }
}
use std::{
    fs,
    sync::atomic::{AtomicU64, Ordering},
};
use vantare_domain::widget_settings::{Kind, Settings};
use vantare_ipc::layout::{Document, Layout};
fn compare(bytes: &[u8]) {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let old = legacy::Layout::from_json(bytes).expect("old reader");
    let new = Layout::from_json(bytes).expect("shared reader");
    assert_eq!(old.demand(), new.demand());
    let expected = serde_json::to_vec_pretty(&old).expect("old writer");
    assert_eq!(
        expected,
        serde_json::to_vec_pretty(&new).expect("new writer")
    );
    let directory = std::env::temp_dir().join(format!(
        "vantare-layout-compat-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir(&directory).expect("unique directory");
    let path = directory.join("layout.json");
    let mut document = Document::open(path.clone()).expect("new document");
    document.save(&new).expect("shared save");
    assert_eq!(fs::read(&path).expect("saved bytes"), expected);
    let reopened = Document::open(path).expect("reopened");
    assert_eq!(reopened.layout(), &new);
    fs::remove_dir_all(directory).expect("remove own fixture");
}
#[test]
fn existing_saved_documents_keep_the_exact_writer_bytes() {
    for bytes in [
        include_bytes!("../../ui/fixtures/layout.json").as_slice(),
        include_bytes!("../../ui/fixtures/layouts/native-beta-v0.0.975.json").as_slice(),
        include_bytes!("../../ui/fixtures/layouts/v2-bridge.json").as_slice(),
    ] {
        compare(bytes);
    }
}
#[test]
fn every_widget_and_additive_layout_field_keeps_the_exact_writer_bytes() {
    for &kind in Kind::ALL {
        for version in [1, 2] {
            let mut value = serde_json::json!({"version":version,"instances":[{"id":"widget","x":-20.5,"y":30.25,"opacity":0.7,"visible":true,"settings":Settings::default_for(kind),"showIn":{"practice":false,"qualifying":true,"race":true},"geometry":{"size":{"width":338.0,"height":364.0},"aspectLocked":false},"offTrack":"always_visible"}],"canvasResolution":{"width":1920.0,"height":1080.0},"performance":{"level":"high","widgets":{"widget":15}},"preferences":{"units":"imperial","language":"en"},"hideOffTrack":true});
            if version == 2 {
                value["reducedMotion"] = false.into();
                value["extensions"] = serde_json::json!({"z":{"last":1,"first":2},"a":[3,4]});
            }
            for look in vantare_domain::widget_settings::look::Look::ALL {
                let mut settings = Settings::default_for(kind);
                settings.set_look(*look);
                value["instances"][0]["settings"] =
                    serde_json::to_value(settings).expect("settings");
                compare(&serde_json::to_vec(&value).expect("case"));
            }
        }
    }
}
