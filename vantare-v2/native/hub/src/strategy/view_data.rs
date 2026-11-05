//! Presentación compartida. Las fuentes preparan datos y fragmentos de solo lectura;
//! las vistas no conocen escenas, fixtures ni el modo de captura.
type TextControl = fn(&str, &gpui::App) -> gpui::Div;
type RuleRow = fn(&str, &str, &gpui::App) -> gpui::Div;
type Partial = fn(&super::Strategy, &mut gpui::Context<super::Strategy>) -> gpui::Div;
type Action = fn(&mut super::Strategy, &mut gpui::Context<super::Strategy>);
type Content = fn(&super::Strategy, &gpui::App) -> gpui::Div;

pub(super) struct ViewData {
    pub(super) custom_description: &'static str,
    pub(super) calendar_description: &'static str,
    pub(super) draft_label: &'static str,
    pub(super) revisions_heading: &'static str,
    pub(super) simulator: Option<&'static str>,
    pub(super) disabled_calculate_opacity: f32,
    pub(super) resource_opacity: f32,
    pub(super) service_label: Option<&'static str>,
    pub(super) read_only: bool,
    pub(super) accept: Option<Action>,
    pub(super) partial: Option<Partial>,
    pub(super) laps: Option<String>,
    pub(super) car: Option<String>,
    pub(super) layout: Option<&'static str>,
    pub(super) plan: Option<PlanData>,
    pub(super) text_control: Option<TextControl>,
    pub(super) rule_row: Option<RuleRow>,
    pub(super) resources: Option<Content>,
    pub(super) drivers: Option<Content>,
}

impl Default for ViewData {
    fn default() -> Self {
        Self {
            custom_description: "Elige coche, circuito y reglamento",
            calendar_description: "Selección de eventos no disponible",
            draft_label: "Borrador local",
            revisions_heading: "REVISIONES EXACTAS SELECCIONADAS",
            simulator: None,
            disabled_calculate_opacity: super::orbit::DISABLED,
            resource_opacity: super::orbit::DISABLED,
            service_label: None,
            read_only: false,
            accept: None,
            partial: None,
            laps: None,
            car: None,
            layout: None,
            plan: None,
            text_control: None,
            rule_row: None,
            resources: None,
            drivers: None,
        }
    }
}

use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PlanData {
    pub total_seconds: f64,
    pub reserve_laps: f64,
    pub required_laps: f64,
    pub capacity_liters: f64,
    pub fuel_per_lap: f64,
    pub ve_per_lap: f64,
    pub stints: Vec<StintData>,
    pub stops: Vec<StopData>,
    pub samples: Vec<Sample>,
    pub files: Vec<SourceFile>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct StintData {
    pub driver: String,
    pub pace_seconds: f64,
    pub fuel_liters: f64,
    pub ve_percent: f64,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct StopData {
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
pub struct SourceFile {
    pub name: String,
    pub details: String,
    pub ready: bool,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Sample {
    pub value: f64,
    pub quality: String,
}
