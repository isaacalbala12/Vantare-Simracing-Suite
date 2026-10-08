//! Fixtures del modo de captura; solo se cargan con `--capture`.
use crate::Section;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use vantare_strategy::application::CorrectionSource;

const DATA: &str = include_str!("../reference/fixtures/demo-data.json");
const SCREENS: &str = include_str!("../reference/tools/demo-states.json");
const STRATEGY_REVIEW: &str = include_str!("../reference/fixtures/strategy-review-demo.json");
const EXTRA_STRATEGY_CAPTURES: &[&str] = &[
    "strategy-v5-datos-vacio",
    "strategy-v5-datos-fuentes",
    "strategy-v5-datos-vueltas",
    "strategy-v5-datos-avanzado",
    "strategy-v5-plan-reposo",
    "strategy-v5-plan-cargando",
    "strategy-v5-plan-parcial",
    "strategy-v5-plan-error",
    "strategy-v5-plan-calculado",
    "strategy-v5-editor-stint",
    "strategy-v5-editor-parada",
    "strategy-v5-asistente-inicio",
    "strategy-v5-asistente-combinacion",
    "strategy-v5-asistente-reglas",
    "strategy-v5-asistente-pilotos",
    "strategy-v5-asistente-sesiones",
    "strategy-v5-carrera",
    "strategy-v5-revisiones",
];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoData {
    pub captured_at: String,
    pub user: DemoUser,
    pub profile: DemoProfile,
    pub launcher: DemoLauncher,
    pub home_races: Vec<DemoRace>,
    pub calendar: DemoCalendar,
    pub strategy: DemoStrategy,
    pub engineer: DemoEngineer,
    pub telemetry: DemoTelemetry,
    pub notifications: Vec<DemoNotification>,
    pub versions: DemoVersions,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoUser {
    pub id: String,
    pub name: String,
    pub full_name: String,
    pub email: String,
    pub plan: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoProfile {
    pub present: bool,
    pub id: String,
    pub file: String,
    pub name: String,
    pub active: bool,
    pub widgets: usize,
    pub width: u32,
    pub height: u32,
    pub obs_browser_source_url: String,
}

impl DemoProfile {
    pub fn context_subtitle(&self) -> String {
        format!(
            "{} widgets · {}",
            self.widgets,
            if self.active { "activo" } else { "recomendado" }
        )
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoLauncher {
    pub apps: Vec<DemoLauncherApp>,
    pub profiles: Vec<DemoLauncherProfile>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoLauncherApp {
    #[serde(default)]
    pub executable_path: Option<std::path::PathBuf>,
    pub id: String,
    pub display_name: String,
    pub abbreviation: String,
    pub category: String,
    pub launch_method: String,
    pub found: bool,
    pub installed: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoLauncherProfile {
    pub id: String,
    pub name: String,
    pub description: String,
    pub favorite: bool,
    pub steps: Vec<DemoLauncherStep>,
    pub retry_limit: u8,
    #[serde(default)]
    pub launch_count: u64,
    #[serde(default)]
    pub last_launched_at: Option<String>,
    #[serde(default)]
    pub avg_chain_duration_ms: u64,
    #[serde(default)]
    pub last_ready_steps: Option<usize>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoLauncherStep {
    pub app_id: String,
    pub delay_seconds: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoRace {
    pub id: String,
    pub name: String,
    pub track: String,
    pub license_label: String,
    pub at_utc: String,
    pub interval_minutes: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoCalendar {
    pub version: u32,
    pub timezone: String,
    pub valid_from: String,
    pub valid_until: String,
    pub series: Vec<DemoSeries>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoSeries {
    pub id: String,
    pub name: String,
    pub track: String,
    pub vehicle_class: String,
    pub license_label: String,
    pub tier: String,
    pub event_kind: String,
    pub start_offset_minute: i64,
    pub recurrence: DemoRecurrence,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoRecurrence {
    pub kind: String,
    #[serde(default)]
    pub interval_minutes: i64,
    #[serde(default)]
    pub days: Vec<String>,
    #[serde(default, rename = "timesUTC")]
    pub times_utc: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoStrategy {
    pub event: DemoStrategyEvent,
    pub drivers: Vec<DemoDriver>,
    pub plans: Vec<DemoPlan>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoStrategyEvent {
    pub start_minute: u32,
    pub duration_minute: u32,
    pub tank_liters: u32,
    pub pit_seconds: u32,
    pub name: String,
    pub subtitle: String,
    pub vehicle_class: String,
    pub car: String,
    pub track: String,
    pub team: String,
    pub day_label: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoDriver {
    pub id: String,
    pub name: String,
    pub initials: String,
    pub class: String,
    pub dry: [f64; 2],
    pub wet: [f64; 2],
    pub eco: [f64; 2],
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoPlan {
    pub id: String,
    pub name: String,
    pub note: String,
    pub mode: String,
    pub order: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoEngineer {
    pub captured_at: String,
    pub messages: Vec<DemoEngineerMessage>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoEngineerMessage {
    pub text: String,
    pub role: String,
    pub intent: String,
    pub severity: String,
    pub seconds_ago: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoTelemetry {
    pub synthetic: bool,
    pub model: String,
    pub sessions: Vec<DemoTelemetrySession>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoTelemetrySession {
    pub id: String,
    pub track: String,
    pub car: String,
    pub when: String,
    pub laps: u32,
    pub best: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoNotification {
    pub source: String,
    pub severity: String,
    pub title_key: String,
    pub text_key: String,
    pub tag: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DemoVersions {
    pub hub: String,
    pub testing: String,
    pub current: String,
    pub pending: String,
    pub updater_channel: String,
    pub testing_channel: String,
}

impl DemoData {
    /// Las referencias solo tienen perfil en Inicio y no tienen historial local.
    pub fn apply_capture(&mut self, capture: &CaptureState) -> Result<(), String> {
        self.profile.present = capture.name == "inicio-base";
        if matches!(capture.name.as_str(), "inicio-vacio" | "inicio-cargando") {
            self.launcher.profiles.clear();
        }
        self.notifications.clear();
        if matches!(
            capture.name.as_str(),
            "notificaciones-panel" | "notificaciones-vacio"
        ) {
            self.captured_at = "2026-10-05T16:30:00Z".into();
        }
        if matches!(
            capture.name.as_str(),
            "inicio-base" | "launcher-reposo" | "launcher-lanzando"
        ) {
            self.launcher = serde_json::from_str(if capture.name == "inicio-base" {
                include_str!("../reference/fixtures/home-r7-launcher.json")
            } else {
                include_str!("../reference/fixtures/launcher-r7.json")
            })
            .map_err(|error| format!("fixture visual Inicio: {error}"))?;
            if self.launcher.profiles.iter().any(|profile| {
                profile
                    .last_ready_steps
                    .is_some_and(|ready| ready > profile.steps.len())
            }) {
                return Err("fixture Inicio: progreso fuera de los pasos".into());
            }
        }
        Ok(())
    }

    pub fn overlay_profile(&self) -> Option<&DemoProfile> {
        self.profile.present.then_some(&self.profile)
    }

    pub fn load() -> Result<Self, String> {
        let data: Self =
            serde_json::from_str(DATA).map_err(|error| format!("demo Hub: {error}"))?;
        data.validate()?;
        Ok(data)
    }

    pub fn fixed_now(&self) -> Result<DateTime<Utc>, String> {
        DateTime::parse_from_rfc3339(&self.captured_at)
            .map(|value| value.with_timezone(&Utc))
            .map_err(|error| format!("hora fija demo: {error}"))
    }

    pub fn calendar_json(&self) -> Result<Vec<u8>, String> {
        serde_json::to_vec(&self.calendar).map_err(|error| format!("calendario demo: {error}"))
    }

    fn validate(&self) -> Result<(), String> {
        self.fixed_now()?;
        DateTime::parse_from_rfc3339(&self.engineer.captured_at)
            .map_err(|error| format!("hora de Engineer demo: {error}"))?;
        for race in &self.home_races {
            DateTime::parse_from_rfc3339(&race.at_utc)
                .map_err(|error| format!("hora de carrera demo {}: {error}", race.id))?;
        }
        if self.user.name.is_empty()
            || self.user.plan != "paid"
            || self.profile.name != "Clean Overlay"
            || !self.profile.present
            || !self.profile.active
            || self.profile.widgets != 3
            || self.profile.width == 0
            || self.profile.height == 0
            || self.launcher.apps.len() != 7
            || self.launcher.profiles.len() != 2
            || self.home_races.len() != 4
            || self.calendar.series.len() != 10
            || self.strategy.plans.len() != 2
            || self.strategy.drivers.len() != 3
            || self.engineer.messages.len() != 20
            || !self.telemetry.synthetic
            || self.telemetry.sessions.len() != 3
            || self.telemetry.model != "13.6"
            || self.notifications.len() != 1
            || self.versions.updater_channel != "stable"
            || self.versions.testing_channel != "nightly"
        {
            return Err("fixture demo Wails incompleta".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CaptureState {
    pub name: String,
    pub section: Section,
    pub palette_query: Option<String>,
    pub column_open: bool,
    /// Barra izquierda forzada en la captura (`--collapsed`); `None` = automática.
    pub sidebar: Option<bool>,
    pub notifications_open: bool,
    pub launcher_new_profile: bool,
    pub settings_page: Option<CaptureSettingsPage>,
    pub strategy_page: Option<CaptureStrategyPage>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct StrategyReviewDemo {
    pub label: String,
    pub source: CorrectionSource,
}

pub fn strategy_review_demo() -> Result<StrategyReviewDemo, String> {
    let mut demo: StrategyReviewDemo = serde_json::from_str(STRATEGY_REVIEW)
        .map_err(|error| format!("fixture demo Strategy: {error}"))?;
    demo.source.revision.base_digest = demo.source.base.digest()?;
    Ok(demo)
}

// Escena de pass-27: mismos valores que recorded-strategy-harness y wails-runtime-mock.
// Solo new_demo carga este DTO; la aplicación normal conserva la salida del solver.
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct StrategyCaptureDemo {
    pub total_seconds: f64,
    pub reserve_laps: f64,
    pub required_laps: f64,
    pub capacity_liters: f64,
    pub fuel_per_lap: f64,
    pub ve_per_lap: f64,
    pub stints: Vec<CaptureStint>,
    pub stops: Vec<CaptureStop>,
    pub samples: Vec<CaptureSample>,
    pub files: Vec<CaptureSourceFile>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CaptureStint {
    pub driver: String,
    pub pace_seconds: f64,
    pub fuel_liters: f64,
    pub ve_percent: f64,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CaptureStop {
    pub lap: u32,
    pub fuel_in: f64,
    pub fuel_out: f64,
    pub ve_in: f64,
    pub ve_out: f64,
    pub fuel_added: f64,
    pub ve_added: f64,
    pub transit_seconds: f64,
    pub service_seconds: f64,
    pub overlap_seconds: f64,
    pub total_seconds: f64,
    pub compound: String,
    pub change_tyres: bool,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CaptureSourceFile {
    pub name: String,
    pub details: String,
    pub ready: bool,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CaptureSample {
    pub value: f64,
    pub quality: String,
}
impl StrategyCaptureDemo {
    pub fn load() -> Result<Self, String> {
        serde_json::from_str(include_str!(
            "../reference/fixtures/strategy-capture-demo.json"
        ))
        .map_err(|error| format!("escena pass-27 Strategy: {error}"))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CaptureSettingsPage {
    Application,
    Appearance,
    Performance,
    Updates,
    Hotkeys,
    Privacy,
    Diagnostics,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CaptureStrategyPage {
    DataEmpty,
    DataSources,
    DataLaps,
    DataAdvanced,
    PlanIdle,
    PlanLoading,
    PlanPartial,
    PlanError,
    PlanCalculated,
    Stints,
    Stops,
    AssistantInicio,
    AssistantCombinacion,
    AssistantReglas,
    AssistantPilotos,
    AssistantSesiones,
    Career,
    Revisions,
}

fn strategy_capture_page(name: &str) -> Option<CaptureStrategyPage> {
    match name {
        "strategy-asistente-origen" | "strategy-v5-asistente-inicio" => {
            Some(CaptureStrategyPage::AssistantInicio)
        }
        "strategy-asistente-equipo" | "strategy-v5-asistente-combinacion" => {
            Some(CaptureStrategyPage::AssistantCombinacion)
        }
        "strategy-v5-asistente-reglas" => Some(CaptureStrategyPage::AssistantReglas),
        "strategy-v5-asistente-pilotos" => Some(CaptureStrategyPage::AssistantPilotos),
        "strategy-v5-asistente-sesiones" => Some(CaptureStrategyPage::AssistantSesiones),
        "strategy-v5-carrera" => Some(CaptureStrategyPage::Career),
        "strategy-v5-revisiones" => Some(CaptureStrategyPage::Revisions),
        "strategy-datos-vacio" | "strategy-v5-datos-vacio" => Some(CaptureStrategyPage::DataEmpty),
        "strategy-datos-fuentes" | "strategy-v5-datos-fuentes" => {
            Some(CaptureStrategyPage::DataSources)
        }
        "strategy-datos-vueltas" | "strategy-v5-datos-vueltas" => {
            Some(CaptureStrategyPage::DataLaps)
        }
        "strategy-datos-avanzado" | "strategy-v5-datos-avanzado" => {
            Some(CaptureStrategyPage::DataAdvanced)
        }
        "strategy-plan-reposo" | "strategy-v5-plan-reposo" => Some(CaptureStrategyPage::PlanIdle),
        "strategy-plan-cargando" | "strategy-v5-plan-cargando" => {
            Some(CaptureStrategyPage::PlanLoading)
        }
        "strategy-plan-parcial" | "strategy-v5-plan-parcial" => {
            Some(CaptureStrategyPage::PlanPartial)
        }
        "strategy-plan-error" | "strategy-v5-plan-error" => Some(CaptureStrategyPage::PlanError),
        "strategy-plan-calculado" | "strategy-v5-plan-calculado" => {
            Some(CaptureStrategyPage::PlanCalculated)
        }
        "strategy-editor-stint" | "strategy-v5-editor-stint" => Some(CaptureStrategyPage::Stints),
        "strategy-editor-parada" | "strategy-v5-editor-parada" => Some(CaptureStrategyPage::Stops),
        _ => None,
    }
}

impl CaptureState {
    /// Acceso del usuario de la escena aprobada, independiente de licencias reales.
    #[cfg(any(test, feature = "parity-capture"))]
    pub fn locked_sections(&self) -> &'static [Section] {
        if self.section == Section::Strategy {
            &[Section::Engineer, Section::Analysis]
        } else {
            &[]
        }
    }

    pub fn parse(name: &str) -> Result<Self, String> {
        #[derive(Deserialize)]
        struct Screen {
            name: String,
        }
        let screens: Vec<Screen> =
            serde_json::from_str(SCREENS).map_err(|error| format!("referencias Hub: {error}"))?;
        if !screens.iter().any(|screen| screen.name == name)
            && !EXTRA_STRATEGY_CAPTURES.contains(&name)
            && !matches!(name, "launcher-reposo" | "launcher-lanzando")
            && name != "calendario-beta-archivo"
            && !matches!(name, "notificaciones-panel" | "notificaciones-vacio")
            && !matches!(name, "inicio-vacio" | "inicio-cargando" | "inicio-error")
        {
            return Err(format!("pantalla Wails desconocida: {name}"));
        }
        let section = match name {
            "shell-notificaciones-abiertas" | "notificaciones-panel" | "notificaciones-vacio" => {
                Section::Home
            }
            "launcher-base" | "launcher-nuevo-perfil" | "launcher-reposo" | "launcher-lanzando" => {
                Section::Launcher
            }
            "calendario-beta-archivo"
            | "calendario-base"
            | "calendario-dia"
            | "calendario-semana"
            | "calendario-mes"
            | "calendario-timeline" => Section::Calendar,

            name if strategy_capture_page(name).is_some() => Section::Strategy,
            "engineer-base" | "engineer-historial" => Section::Engineer,
            "telemetria-base" | "telemetria-demo" | "telemetria-trazas" => Section::Analysis,
            "testing-center-informe"
            | "testing-center-detalle"
            | "testing-center-validar"
            | "testing-center-mis-reportes" => Section::Testing,
            "roadmap-base" => Section::Roadmap,
            "cuenta-base" => Section::Account,
            "licencias-modulos-dispositivos" => Section::Licenses,
            "studio-base" => Section::Studio,
            "workshop-base" | "workshop-detalle" => Section::Workshop,
            name if name.starts_with("ajustes-") => Section::Settings,
            name if name.starts_with("shell-") || name == "inicio-base" => Section::Home,
            _ => return Err(format!("pantalla Wails sin sección nativa: {name}")),
        };
        let palette_query = match name {
            "shell-paleta-abierta" => Some(String::new()),
            "shell-paleta-busqueda" => Some("Studio".into()),
            "shell-paleta-vacia" => Some("zz-no-resultados".into()),
            _ => None,
        };
        let settings_page = match name {
            "ajustes-preparacion-oscuro" | "ajustes-apariencia" | "ajustes-apariencia-detalle" => {
                Some(CaptureSettingsPage::Appearance)
            }
            "ajustes-rendimiento" | "ajustes-rendimiento-detalle" => {
                Some(CaptureSettingsPage::Performance)
            }
            "ajustes-actualizaciones" => Some(CaptureSettingsPage::Updates),
            "ajustes-atajos" => Some(CaptureSettingsPage::Hotkeys),
            "ajustes-privacidad" => Some(CaptureSettingsPage::Privacy),
            "ajustes-diagnostico" | "ajustes-diagnostico-detalle" => {
                Some(CaptureSettingsPage::Diagnostics)
            }
            name if name.starts_with("ajustes-") => Some(CaptureSettingsPage::Application),
            _ => None,
        };
        let strategy_page = strategy_capture_page(name);
        Ok(Self {
            name: name.into(),
            section,
            palette_query,
            column_open: name != "shell-columna-colapsada",
            sidebar: None,
            notifications_open: matches!(
                name,
                "shell-notificaciones-abiertas" | "notificaciones-panel" | "notificaciones-vacio"
            ),
            launcher_new_profile: name == "launcher-nuevo-perfil",
            settings_page,
            strategy_page,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notification_capture_clock_is_scoped_to_its_two_explicit_scenes() {
        for name in ["notificaciones-panel", "notificaciones-vacio"] {
            let capture = CaptureState::parse(name).expect("escena Notificaciones");
            assert!(capture.notifications_open);
            assert_eq!(capture.section, Section::Home);
            let mut demo = DemoData::load().expect("datos QA");
            demo.apply_capture(&capture).expect("aplicar escena");
            assert_eq!(demo.captured_at, "2026-10-05T16:30:00Z");
            assert!(demo.notifications.is_empty());
        }
        let mut demo = DemoData::load().expect("datos QA");
        let original = demo.captured_at.clone();
        demo.apply_capture(&CaptureState::parse("inicio-base").expect("Inicio"))
            .expect("escena");
        assert_eq!(demo.captured_at, original);
    }

    #[test]
    fn rail_locks_only_belong_to_strategy_capture_scenes() {
        for name in EXTRA_STRATEGY_CAPTURES {
            let scene = CaptureState::parse(name).expect("escena Strategy");
            assert_eq!(
                scene.locked_sections(),
                &[Section::Engineer, Section::Analysis]
            );
        }
        for name in ["inicio-base", "engineer-base", "telemetria-base"] {
            assert!(
                CaptureState::parse(name)
                    .expect("escena Hub")
                    .locked_sections()
                    .is_empty()
            );
        }
    }

    #[test]
    fn telemetry_demo_and_traces_keep_the_same_frozen_scene() {
        let demo = CaptureState::parse("telemetria-demo").expect("demo");
        let traces = CaptureState::parse("telemetria-trazas").expect("trazas");
        let base = CaptureState::parse("telemetria-base").expect("base");
        assert_eq!(demo.section, traces.section);
        assert_eq!(demo.palette_query, traces.palette_query);
        let screens: serde_json::Value = serde_json::from_str(SCREENS).expect("escenas Wails");
        for name in ["telemetria-demo", "telemetria-trazas"] {
            let actions = screens
                .as_array()
                .and_then(|screens| screens.iter().find(|screen| screen["name"] == name))
                .and_then(|screen| screen.get("actions"))
                .and_then(serde_json::Value::as_array);
            assert!(
                actions.is_none_or(Vec::is_empty),
                "{name} no debe añadir scroll"
            );
        }
        assert!(!base.notifications_open && !demo.notifications_open);
    }

    #[test]
    fn loads_the_wails_demo_snapshot_and_fixed_clock_deterministically() {
        let first = DemoData::load().expect("fixture demo");
        let second = DemoData::load().expect("segunda carga");
        assert_eq!(
            serde_json::to_vec(&first).expect("serializar"),
            serde_json::to_vec(&second).expect("serializar")
        );
        assert_eq!(
            first.fixed_now().expect("reloj"),
            second.fixed_now().expect("reloj")
        );
        assert_eq!(first.user.name, "test");
        assert_eq!(first.user.full_name, "Isaac Albalá");
        assert_eq!(first.captured_at, "2026-09-30T17:00:00Z");
        assert_eq!(first.profile.name, "Clean Overlay");
        assert!(first.overlay_profile().is_some());
        assert_eq!(first.profile.context_subtitle(), "3 widgets · activo");
        let mut recommended = first.profile.clone();
        recommended.active = false;
        recommended.widgets = 5;
        assert_eq!(recommended.context_subtitle(), "5 widgets · recomendado");
        assert_eq!(
            first.profile.obs_browser_source_url,
            "http://127.0.0.1:39261/overlay?profile=custom-clean-overlay.json"
        );
        assert_eq!(first.launcher.profiles[0].name, "Creador de Contenido");
        assert_eq!(first.launcher.apps[1].display_name, "OBS Studio");
        assert_eq!(first.home_races[0].name, "LMGT3 Fixed");
        assert_eq!(first.calendar.series.len(), 10);
        assert_eq!(first.strategy.event.name, "4 Horas de Imola");
        assert_eq!(first.strategy.event.car, "Ford Mustang GT3");
        assert_eq!(first.strategy.event.track, "Imola");
        assert_eq!(first.strategy.plans[1].name, "Estrategia #2");
        assert_eq!(first.engineer.messages.len(), 20);
        assert_eq!(first.telemetry.sessions[0].best, "2:04.512");
        assert_eq!(first.notifications[0].tag, "v0.1.0.2");
        assert_eq!(first.versions.current, "v0.1.0.1");
        assert_eq!(first.versions.testing_channel, "nightly");
    }

    #[test]
    fn every_wails_reference_has_a_native_capture_target() {
        let screens: Vec<serde_json::Value> = serde_json::from_str(SCREENS).expect("referencias");
        assert!(screens.len() >= 41);
        let mut names = std::collections::BTreeSet::new();
        for screen in screens {
            let name = screen["name"].as_str().expect("nombre").to_owned();
            assert!(names.insert(name.clone()), "pantalla duplicada: {name}");
            assert!(CaptureState::parse(&name).is_ok(), "{name}");
        }
        assert_eq!(
            CaptureState::parse("shell-paleta-busqueda")
                .expect("paleta")
                .palette_query
                .as_deref(),
            Some("Studio")
        );
        assert!(
            !CaptureState::parse("shell-columna-colapsada")
                .expect("columna")
                .column_open
        );
        assert!(
            CaptureState::parse("launcher-nuevo-perfil")
                .expect("Launcher")
                .launcher_new_profile
        );
        assert_eq!(
            CaptureState::parse("strategy-v5-asistente-combinacion")
                .expect("Strategy")
                .strategy_page,
            Some(CaptureStrategyPage::AssistantCombinacion)
        );
        for name in EXTRA_STRATEGY_CAPTURES {
            assert!(CaptureState::parse(name).is_ok(), "{name}");
        }
        assert_eq!(
            CaptureState::parse("strategy-v5-asistente-inicio")
                .expect("inicio del asistente")
                .strategy_page,
            Some(CaptureStrategyPage::AssistantInicio)
        );
        for (name, page) in [
            ("strategy-datos-vacio", CaptureStrategyPage::DataEmpty),
            ("strategy-datos-fuentes", CaptureStrategyPage::DataSources),
            ("strategy-datos-vueltas", CaptureStrategyPage::DataLaps),
            ("strategy-datos-avanzado", CaptureStrategyPage::DataAdvanced),
            ("strategy-plan-reposo", CaptureStrategyPage::PlanIdle),
            ("strategy-plan-cargando", CaptureStrategyPage::PlanLoading),
            ("strategy-plan-parcial", CaptureStrategyPage::PlanPartial),
            ("strategy-plan-error", CaptureStrategyPage::PlanError),
            (
                "strategy-plan-calculado",
                CaptureStrategyPage::PlanCalculated,
            ),
            ("strategy-editor-stint", CaptureStrategyPage::Stints),
            ("strategy-editor-parada", CaptureStrategyPage::Stops),
        ] {
            assert_eq!(CaptureState::parse(name).unwrap().strategy_page, Some(page));
        }
        assert!(CaptureState::parse("ajustes-desconocidos").is_err());
    }

    #[test]
    fn retired_strategy_scenes_are_not_capture_targets() {
        for name in [
            "strategy-base",
            "strategy-lista",
            "strategy-continuar",
            "strategy-asistente-origen",
            "strategy-asistente-equipo",
            "strategy-asistente-inicio",
            "strategy-nuevo-evento",
            "strategy-asistente-combinacion",
            "strategy-asistente-reglas",
            "strategy-asistente-pilotos",
            "strategy-asistente-sesiones",
            "strategy-editor-carrera",
            "strategy-revisiones",
        ] {
            assert!(CaptureState::parse(name).is_err(), "{name}");
        }
    }

    #[test]
    fn strategy_capture_keeps_pass_27_values_separate_from_solver_inputs() {
        let demo = StrategyCaptureDemo::load().expect("mock pass-27");
        assert_eq!(demo.samples.len(), 12);
        assert_eq!(demo.samples[7].quality, "Desconocida");
        assert_eq!(demo.stints.len(), 3);
        assert_eq!(demo.stints[0].driver, "Isaac Albalá");
        assert_eq!(
            demo.stops.iter().map(|stop| stop.lap).collect::<Vec<_>>(),
            [23, 46]
        );
        assert!((demo.total_seconds - 7357.57).abs() < 0.001);
        assert!((demo.reserve_laps - 1.14).abs() < 0.001);
    }

    #[test]
    fn strategy_review_demo_uses_a_valid_exact_analysis_source() {
        let demo = strategy_review_demo().expect("fuente demo válida");
        assert_eq!(demo.label, "2026-09-15 · Imola Race");
        assert_eq!(
            demo.source.revision.base_digest,
            demo.source.base.digest().unwrap()
        );
        assert_eq!(
            demo.source.revision.session_id,
            demo.source.validity.session_id
        );
        assert_eq!(demo.source.validity.laps.len(), 25);
    }

    #[test]
    fn demo_calendar_uses_the_native_schedule_contract() {
        let demo = DemoData::load().expect("fixture demo");
        let schedule = crate::calendar::Schedule::parse(&demo.calendar_json().expect("json"))
            .expect("contrato de calendario");
        assert_eq!(schedule.series.len(), 10);
    }

    #[test]
    fn shell_captures_are_empty_without_changing_home_fixture() -> Result<(), String> {
        for name in [
            "shell-completa",
            "shell-columna-colapsada",
            "shell-notificaciones-abiertas",
        ] {
            let mut demo = DemoData::load()?;
            demo.apply_capture(&CaptureState::parse(name)?)?;
            assert!(demo.overlay_profile().is_none(), "{name}");
            assert!(demo.notifications.is_empty(), "{name}");
            assert_eq!(demo.user.name, "test");
            assert_eq!(demo.launcher.profiles.len(), 2);
        }
        let mut home = DemoData::load()?;
        home.apply_capture(&CaptureState::parse("inicio-base")?)?;
        assert!(home.overlay_profile().is_some());
        assert!(home.notifications.is_empty());
        assert_eq!(home.launcher.profiles.len(), 3);
        assert_eq!(home.launcher.profiles[0].name, "Carrera LMU");
        assert_eq!(home.launcher.profiles[0].last_ready_steps, Some(4));
        crate::launcher::Store::demo(std::path::PathBuf::from("C:/QA/launcher.json"), &home)?;
        Ok(())
    }

    #[test]
    fn launcher_showcase_scenes_use_isolated_valid_profiles() -> Result<(), String> {
        for name in ["launcher-reposo", "launcher-lanzando"] {
            let capture = CaptureState::parse(name)?;
            assert_eq!(capture.section, Section::Launcher);
            let mut demo = DemoData::load()?;
            demo.apply_capture(&capture)?;
            assert!(demo.overlay_profile().is_none());
            assert_eq!(demo.launcher.profiles[0].name, "Carrera LMU");
            assert_eq!(demo.launcher.profiles[0].steps.len(), 4);
            crate::launcher::Store::demo(std::path::PathBuf::from("C:/QA/showcase.json"), &demo)?;
        }
        Ok(())
    }
}
