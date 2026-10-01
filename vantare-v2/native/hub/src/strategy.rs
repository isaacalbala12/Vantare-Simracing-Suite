//! Local Strategy editor. Analysis and weather acquisition remain separate.
use std::path::PathBuf;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use gpui::{
    Context, Entity, Image, ImageFormat, IntoElement, PathPromptOptions, Render, RenderImage,
    SvgRenderer, Window, div, prelude::*,
};
use serde_json::{Value, json};

use crate::{
    files,
    orbit::{self, button},
};
use vantare_strategy::{
    application::{
        self, AnalysisRevisionRef, CorrectionSource, EditedPlan, PreparedFamilyCorrection,
        SourceStatus,
    },
    document::{Document, new_event},
    solver::{
        self, Budget, Discretization, Formation, Input, PitCost, Rules, Scalar, SolverOutcome,
    },
};

#[path = "strategy/asistente.rs"]
mod assistant;
mod datos;
#[path = "strategy/editor.rs"]
mod editor_view;
mod parada;
mod plan;
#[path = "strategy/revisiones.rs"]
mod revisions_view;
mod stint;
#[path = "strategy/view.rs"]
mod view;
use assistant::AssistantStep;
use editor_view::EditorTab;
use view::Page;

const LIMIT: u64 = 12 * 1024 * 1024;
const DURATIONS: [u32; 4] = [60, 120, 240, 360];

fn load_strategy_image(
    bytes: &'static [u8],
    description: &str,
) -> (Option<Arc<RenderImage>>, Option<String>) {
    let image = Image::from_bytes(ImageFormat::Png, bytes.to_vec())
        .to_image_data(SvgRenderer::new(Arc::new(())))
        .map_err(|error| format!("decodificar {description}: {error}"));
    match image {
        Ok(image) => (Some(image), None),
        Err(error) => (None, Some(error)),
    }
}

#[derive(Default)]
pub struct Editor {
    pub document: Option<Document>,
    path: Option<PathBuf>,
    saved: Option<Vec<u8>>,
}
impl Editor {
    pub fn dirty(&self) -> bool {
        self.document
            .as_ref()
            .is_some_and(|doc| self.saved.as_deref() != Some(doc.bytes()))
    }
    pub fn open(&mut self, path: PathBuf) -> Result<(), String> {
        if self.dirty() {
            return Err("Guarda o descarta los cambios antes de abrir otro documento".into());
        }
        let bytes = files::read(&path, LIMIT)?;
        let doc = Document::parse(&bytes)?;
        self.document = Some(doc);
        self.path = Some(path);
        self.saved = Some(bytes);
        Ok(())
    }
    pub fn create(&mut self) -> Result<(), String> {
        if self.dirty() {
            return Err("Guarda o descarta los cambios antes de crear otro documento".into());
        }
        let timestamp = chrono::Utc::now().to_rfc3339();
        self.document = Some(Document::empty(&timestamp)?);
        self.saved = None;
        self.path = None;
        Ok(())
    }
    pub fn save(&mut self) -> Result<(), String> {
        let Some(doc) = &self.document else {
            return Ok(());
        };
        if !self.dirty() {
            return Ok(());
        }
        let path = self
            .path
            .as_ref()
            .ok_or("Elige Guardar como para este documento nuevo")?;
        files::save_with_limit(path, doc.bytes(), self.saved.as_deref(), LIMIT)?;
        self.saved = Some(doc.bytes().to_vec());
        Ok(())
    }
    pub fn save_as(&mut self, path: PathBuf) -> Result<(), String> {
        let doc = self.document.as_ref().ok_or("Crea o abre un documento")?;
        if self.path.as_ref() == Some(&path) {
            return self.save();
        }
        // Never overwrite an unobserved target, even if the OS dialog accepts it.
        files::save_with_limit(&path, doc.bytes(), None, LIMIT)?;
        self.path = Some(path);
        self.saved = Some(doc.bytes().to_vec());
        Ok(())
    }
    pub fn discard(&mut self) -> Result<(), String> {
        if let Some(saved) = &self.saved {
            self.document = Some(Document::parse(saved)?);
        } else {
            self.document = None;
            self.path = None;
        }
        Ok(())
    }
}

#[derive(Default)]
struct FormState {
    dirty: bool,
    scalar_dirty: bool,
}

const FIELDS: &[(&str, &str)] = &[
    ("Nombre de la carrera", "name"),
    ("Duración (min)", "durationMin"),
    ("Depósito (L)", "tankLiters"),
    ("Tránsito boxes (s)", "pitLossSeconds"),
    ("Circuito", "track"),
    ("Clase", "cls"),
    ("Nombre variante", "variantName"),
    ("Nota variante", "variantNote"),
    ("Modo variante (dry / humid / wet / eco)", "variantMode"),
    ("Distancia · vueltas", "raceLaps"),
    ("Ritmo (s/v)", "pace"),
    ("Consumo Fuel (L/v)", "fuelPerLap"),
    ("Capacidad VE (%)", "veCapacity"),
    ("Consumo VE (%/v)", "vePerLap"),
    ("Vida neumático (v; 0 sin límite)", "tyreLife"),
    ("Degradación (s/v)", "degradation"),
    ("Repostaje (L/s)", "refuelRate"),
    ("Recarga VE (%/s)", "veRate"),
    ("Neumáticos en boxes (s)", "tyreService"),
    ("Formación (s)", "formation"),
    ("Paso Fuel (L)", "fuelStep"),
    ("Paso VE (%)", "veStep"),
    ("Reserva final (v)", "reserve"),
    ("Servicio (parallel / sequential)", "serviceMode"),
    ("Salida (RFC 3339 con zona; opcional)", "startAt"),
    ("Equipo", "team"),
    ("Piloto", "driverName"),
    ("Iniciales", "driverInitials"),
];

#[allow(clippy::struct_excessive_bools)] // Modo, edición, formulario y solver son estados independientes.
pub struct Strategy {
    editor: Editor,
    directory: PathBuf,
    fields: Vec<String>,
    inputs: Vec<Entity<orbit::Input>>,
    page: Page,
    automatic: bool,
    edit_mode: bool,
    rules_details_open: bool,
    garage: Option<Arc<RenderImage>>,
    garage_detail: Option<Arc<RenderImage>>,
    demo_car: Option<String>,
    capture_demo: Option<crate::demo::StrategyCaptureDemo>,
    automatic_preparation: Option<application::AutomaticPreparation>,
    duration: Option<Entity<orbit::Choice>>,
    event: usize,
    variant: usize,
    form: FormState,
    pub status: String,
    pub error: Option<String>,
    result: Option<SolverOutcome>,
    last_input: Option<Input>,
    manual_source_status: SourceStatus,
    source_revisions: Vec<AnalysisRevisionRef>,
    data: datos::State,
    correction_reason: Entity<orbit::Input>,
    edited_plan: Option<EditedPlan>,
    baseline_edited_plan: Option<EditedPlan>,
    baseline_result: Option<SolverOutcome>,
    edit_dirty: bool,
    plan_editor: stint::EditorState,
    edit_cost_seconds: Option<f64>,
    edit_error: Option<String>,
    running: bool,
    cancellation: Arc<AtomicBool>,
    generation: u64,
}
fn open_editor(directory: &std::path::Path) -> (Editor, Option<String>) {
    let mut editor = Editor::default();
    let path = directory.join("strategy-v2.json");
    let error =
        if path.exists() {
            editor.open(path).err()
        } else {
            match application::repository::LocalRepository::open(directory)
                .and_then(|repository| repository.load())
            {
                Ok(snapshot) => snapshot.drafts.last().and_then(|draft| {
                    match Document::parse(draft.as_bytes()) {
                        Ok(document) => {
                            editor.document = Some(document);
                            editor.saved = Some(draft.as_bytes().to_vec());
                            None
                        }
                        Err(error) => Some(error),
                    }
                }),
                Err(error) => Some(error),
            }
        };
    (editor, error)
}

impl Strategy {
    pub fn new_demo(
        directory: PathBuf,
        page: Option<crate::demo::CaptureStrategyPage>,
        cx: &mut Context<Self>,
    ) -> Self {
        let mut strategy = Self::new(directory, cx);
        let Some(page) = page else {
            return strategy;
        };
        strategy.page = match page {
            crate::demo::CaptureStrategyPage::DataEmpty
            | crate::demo::CaptureStrategyPage::DataSources
            | crate::demo::CaptureStrategyPage::DataLaps
            | crate::demo::CaptureStrategyPage::DataAdvanced => Page::Editor(EditorTab::Datos),
            crate::demo::CaptureStrategyPage::PlanIdle
            | crate::demo::CaptureStrategyPage::PlanLoading
            | crate::demo::CaptureStrategyPage::PlanPartial
            | crate::demo::CaptureStrategyPage::PlanError
            | crate::demo::CaptureStrategyPage::PlanCalculated => Page::Editor(EditorTab::Plan),
            crate::demo::CaptureStrategyPage::Stints => Page::Stints,
            crate::demo::CaptureStrategyPage::Stops => Page::Stops,
            crate::demo::CaptureStrategyPage::AssistantInicio => {
                Page::Assistant(AssistantStep::Inicio)
            }
            crate::demo::CaptureStrategyPage::AssistantCombinacion => {
                Page::Assistant(AssistantStep::Combinacion)
            }
            crate::demo::CaptureStrategyPage::AssistantReglas => {
                Page::Assistant(AssistantStep::Reglas)
            }
            crate::demo::CaptureStrategyPage::AssistantPilotos => {
                Page::Assistant(AssistantStep::Pilotos)
            }
            crate::demo::CaptureStrategyPage::AssistantSesiones => {
                Page::Assistant(AssistantStep::Sesiones)
            }
            crate::demo::CaptureStrategyPage::Career => Page::Editor(EditorTab::Carrera),
            crate::demo::CaptureStrategyPage::Revisions => Page::Editor(EditorTab::Revisiones),
        };
        match crate::demo::StrategyCaptureDemo::load() {
            Ok(demo) => strategy.capture_demo = Some(demo),
            Err(error) => strategy.error = Some(error),
        }
        strategy.manual_source_status = SourceStatus::Open;
        strategy.automatic = false;
        if let Err(error) = strategy.seed_capture_demo(cx) {
            strategy.error = Some(error);
        }
        if page == crate::demo::CaptureStrategyPage::AssistantSesiones {
            strategy.automatic = true;
        }
        if matches!(
            page,
            crate::demo::CaptureStrategyPage::DataSources
                | crate::demo::CaptureStrategyPage::DataLaps
                | crate::demo::CaptureStrategyPage::DataAdvanced
                | crate::demo::CaptureStrategyPage::PlanIdle
                | crate::demo::CaptureStrategyPage::PlanLoading
                | crate::demo::CaptureStrategyPage::PlanPartial
                | crate::demo::CaptureStrategyPage::PlanError
                | crate::demo::CaptureStrategyPage::PlanCalculated
                | crate::demo::CaptureStrategyPage::Stints
                | crate::demo::CaptureStrategyPage::Stops
        ) && let Err(error) = strategy.load_capture_review(page)
        {
            strategy.error = Some(error);
        }
        if matches!(
            page,
            crate::demo::CaptureStrategyPage::PlanLoading
                | crate::demo::CaptureStrategyPage::PlanPartial
                | crate::demo::CaptureStrategyPage::PlanError
                | crate::demo::CaptureStrategyPage::PlanCalculated
                | crate::demo::CaptureStrategyPage::Stints
                | crate::demo::CaptureStrategyPage::Stops
        ) && let Err(error) = strategy.load_capture_plan(page)
        {
            strategy.error = Some(error);
        }
        strategy
    }

    fn load_capture_review(
        &mut self,
        page: crate::demo::CaptureStrategyPage,
    ) -> Result<(), String> {
        let mut demo = crate::demo::strategy_review_demo()?;
        demo.source.validity.laps.truncate(5);
        let revisions = vec![demo.source.revision.clone()];
        self.set_review_source(demo.label, demo.source, revisions, &[])?;
        let (selected_lap, advanced, sources_open) = match page {
            crate::demo::CaptureStrategyPage::DataSources => (None, false, true),
            crate::demo::CaptureStrategyPage::DataAdvanced => (None, true, false),
            _ => (None, false, false),
        };
        self.data
            .set_capture_view(0, selected_lap, advanced, sources_open);
        Ok(())
    }

    fn load_capture_plan(&mut self, page: crate::demo::CaptureStrategyPage) -> Result<(), String> {
        let input = capture_solver_input(page)?;
        self.manual_source_status = SourceStatus::Open;

        if page == crate::demo::CaptureStrategyPage::PlanLoading {
            self.running = true;
            self.status = "Calculando la estrategia demo…".into();
            return Ok(());
        }

        let prepared = application::prepare_manual(input.clone())?;
        let outcome = application::calculate(
            &prepared,
            self.manual_source_status,
            &AtomicBool::new(false),
        )?;
        self.last_input = Some(input);
        self.result = Some(outcome.clone());
        self.status = match outcome.certificate.status {
            solver::OptimalityStatus::Proven => "Cálculo demo completado.".into(),
            solver::OptimalityStatus::NotProven => "Búsqueda demo parcial.".into(),
            solver::OptimalityStatus::NoSolution => "La demo no tiene plan factible.".into(),
        };

        if matches!(
            page,
            crate::demo::CaptureStrategyPage::Stints | crate::demo::CaptureStrategyPage::Stops
        ) {
            let edited = stint::schedule_from_outcome(&outcome)?;
            self.baseline_result = Some(outcome);
            self.baseline_edited_plan = Some(edited.clone());
            self.edited_plan = Some(edited);
        }
        Ok(())
    }

    pub fn new(directory: PathBuf, cx: &mut Context<Self>) -> Self {
        let (editor, error) = open_editor(&directory);
        let (garage, garage_error) = load_strategy_image(
            include_bytes!("../assets/strategy-garage.png"),
            "fondo de Strategy",
        );
        let (garage_detail, garage_detail_error) = load_strategy_image(
            include_bytes!("../assets/strategy-garage-detail.png"),
            "fondo detallado de Strategy",
        );

        let manual_source_status = if editor.document.is_some() {
            SourceStatus::Open
        } else {
            SourceStatus::Closed
        };
        let inputs = FIELDS
            .iter()
            .enumerate()
            .map(|(index, (label, _))| {
                let input = cx.new(|cx| orbit::Input::new(String::new(), label, cx));
                cx.observe(&input, move |this, input, cx| {
                    let value = input.read(cx).value.clone();
                    if this.fields[index] != value {
                        this.fields[index] = value;
                        this.form.dirty = true;
                        this.form.scalar_dirty |= (9..24).contains(&index);
                        if index == 1
                            && this.page == Page::Create
                            && let Some(duration) = &this.duration
                        {
                            let selected = duration_selection(&this.fields[1]);
                            duration.update(cx, |duration, cx| {
                                duration.state.selected = selected;
                                duration.state.active = selected;
                                cx.notify();
                            });
                        }
                        this.invalidate();
                        this.status = "Entradas pendientes de confirmar".into();
                        cx.notify();
                    }
                })
                .detach();
                input
            })
            .collect();
        let correction_reason =
            cx.new(|cx| orbit::Input::multiline(String::new(), "Motivo de corrección", cx));
        cx.observe(&correction_reason, |_, _, cx| cx.notify())
            .detach();
        let mut this = Self {
            editor,
            directory,
            fields: vec![String::new(); FIELDS.len()],
            inputs,
            page: Page::Collection,
            automatic: false,
            edit_mode: false,
            rules_details_open: false,
            garage,
            garage_detail,
            demo_car: None,
            capture_demo: None,
            automatic_preparation: None,
            duration: None,
            event: 0,
            variant: 0,
            form: FormState::default(),
            status:
                "Abre un documento V2 o crea uno. Los datos de cálculo se introducen manualmente."
                    .into(),
            error: error.or(garage_error).or(garage_detail_error),
            result: None,
            last_input: None,
            manual_source_status,
            source_revisions: Vec::new(),
            data: datos::State::default(),
            correction_reason,
            edited_plan: None,
            baseline_edited_plan: None,
            baseline_result: None,
            edit_dirty: false,
            plan_editor: stint::EditorState::new(cx),
            edit_cost_seconds: None,
            edit_error: None,
            running: false,
            cancellation: Arc::new(AtomicBool::new(false)),
            generation: 0,
        };
        this.restore_selection();
        this.load_fields(cx);
        this
    }
    fn outcome(&mut self, result: Result<(), String>, cx: &mut Context<Self>) {
        self.error = result.err();
        cx.notify();
    }
    fn invalidate(&mut self) {
        self.cancellation.store(true, Ordering::Relaxed);
        self.generation = self.generation.wrapping_add(1);
        self.running = false;
        self.result = None;
        self.last_input = None;
        self.edited_plan = None;
        self.baseline_edited_plan = None;
        self.baseline_result = None;
        self.edit_dirty = false;
        self.edit_cost_seconds = None;
        self.edit_error = None;
        self.automatic_preparation = None;
    }

    pub(super) fn set_review_source(
        &mut self,
        label: String,
        source: CorrectionSource,
        selected_revisions: Vec<AnalysisRevisionRef>,
        saved: &[PreparedFamilyCorrection],
    ) -> Result<(), String> {
        self.data.load(label, source, selected_revisions, saved)?;
        self.invalidate();
        self.error = None;
        self.source_revisions = self.data.selected_revisions().to_vec();
        Ok(())
    }

    fn ensure_clean_form(&self) -> Result<(), String> {
        if self.form.dirty {
            return Err("Confirma los cambios pendientes o descártalos antes de continuar".into());
        }
        Ok(())
    }
    pub fn persist(&mut self) -> Result<(), String> {
        self.ensure_clean_form()?;
        self.editor.save()
    }
    fn load_fields(&mut self, cx: &mut Context<Self>) {
        self.fields.fill(String::new());
        self.form.dirty = false;
        self.form.scalar_dirty = false;
        let Some(doc) = &self.editor.document else {
            self.sync_inputs(cx);
            return;
        };
        let event = &doc.value()["events"][self.event];
        for (index, (_, field)) in FIELDS.iter().take(6).enumerate() {
            self.fields[index] = display(&event[field]["value"]);
        }
        self.fields[24] = display(&event["startAt"]["value"]);
        self.fields[25] = display(&event["team"]["value"]);
        self.fields[26] = display(&event["drivers"][0]["name"]["value"]);
        self.fields[27] = display(&event["drivers"][0]["ini"]["value"]);
        for (index, key) in [(10, "base_pace_seconds"), (11, "fuel_per_lap_liters")] {
            self.fields[index] = display(&event["planningInputs"]["overrides"][key]["value"]);
        }
        let variant = &event["strategies"][self.variant];
        for (index, field) in [(6, "name"), (7, "note"), (8, "mode")] {
            self.fields[index] = display(&variant[field]["value"]);
        }
        if let Ok(input) =
            serde_json::from_value::<Input>(variant["overrides"]["nativeScalarInput"].clone())
        {
            self.fields[9] = input.race_laps.to_string();
            let scalars = [
                input.base_lap_seconds.value,
                input.fuel_per_lap_liters.value,
                input.ve_capacity_percent.value,
                input.ve_per_lap_percent.value,
                input.tyre_life_laps.value,
                input.degradation_per_lap_seconds.value,
                input.pit_cost.refuel_rate_l_per_s.value,
                input.pit_cost.ve_rate_p_per_s.value,
                input.pit_cost.tyre_seconds.value,
                input.formation.seconds.value,
                input.discretization.fuel_liters,
                input.discretization.ve_percent,
            ];
            for (index, value) in scalars.into_iter().enumerate() {
                self.fields[10 + index] = value.to_string();
            }
            self.fields[22] = display(&input.fuel_reserve["laps"]["value"]);
            self.fields[23] = input.pit_cost.service_mode;
        }
        self.sync_inputs(cx);
    }
    fn choose(&mut self, event: usize, variant: usize, cx: &mut Context<Self>) {
        let result = self.ensure_clean_form().and_then(|()| {
            let doc = self.editor.document.as_mut().ok_or("Documento ausente")?;
            let event_value = doc.value()["events"]
                .as_array()
                .and_then(|a| a.get(event))
                .ok_or("Evento ausente")?;
            let id = event_value["id"].clone();
            let variant_id = event_value["strategies"]
                .as_array()
                .and_then(|a| a.get(variant))
                .map(|v| v["id"].clone());
            let mut next = doc.clone();
            next.put("/activeEventId", &id)?;
            if let Some(id) = variant_id {
                next.put(&format!("/events/{event}/activeStrategyId"), &id)?;
            }
            *doc = next;
            Ok(())
        });
        if result.is_ok() {
            self.event = event;
            self.variant = variant;
            self.invalidate();
            self.load_fields(cx);
        }
        self.outcome(result, cx);
    }
    fn discard(&mut self, cx: &mut Context<Self>) {
        let result = self.editor.discard();
        if result.is_ok() {
            self.event = 0;
            self.variant = 0;
            self.manual_source_status = if self.editor.document.is_some() {
                SourceStatus::Open
            } else {
                SourceStatus::Closed
            };
            self.invalidate();
            self.load_fields(cx);
            self.page = Page::Collection;
            self.status = "Cambios locales descartados; los bytes en disco no se alteran.".into();
        }
        self.outcome(result, cx);
    }
    fn open(&mut self, cx: &mut Context<Self>) {
        if let Err(error) = self.ensure_clean_form().and_then(|()| {
            if self.editor.dirty() {
                Err("Guarda o descarta el documento antes de abrir otro".into())
            } else {
                Ok(())
            }
        }) {
            self.outcome(Err(error), cx);
            return;
        }
        let picker = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: false,
            prompt: Some("Abrir Strategy V2".into()),
        });
        cx.spawn(async move |this, cx| {
            let response = picker.await;
            let _ = this.update(cx, |this, cx| {
                let result = match response {
                    Ok(Ok(Some(paths))) => paths
                        .into_iter()
                        .next()
                        .ok_or("No se seleccionó archivo".into())
                        .and_then(|path| {
                            this.ensure_clean_form()
                                .and_then(|()| this.editor.open(path))
                        }),
                    Ok(Ok(None)) => return,
                    _ => Err("No se pudo abrir el selector de archivos".into()),
                };
                if result.is_ok() {
                    this.manual_source_status = SourceStatus::Open;
                    this.restore_selection();
                    this.invalidate();
                    this.load_fields(cx);
                    this.page = Page::Collection;
                    this.status =
                        "Documento cargado; procedencia y campos desconocidos conservados.".into();
                }
                this.outcome(result, cx);
            });
        })
        .detach();
    }
    fn restore_selection(&mut self) {
        self.event = 0;
        self.variant = 0;
        if let Some(doc) = &self.editor.document {
            let events = doc.value()["events"]
                .as_array()
                .map_or(&[][..], Vec::as_slice);
            self.event = events
                .iter()
                .position(|e| e["id"] == doc.value()["activeEventId"])
                .unwrap_or(0);
            if let Some(event) = events.get(self.event) {
                self.variant = event["strategies"]
                    .as_array()
                    .and_then(|a| a.iter().position(|v| v["id"] == event["activeStrategyId"]))
                    .unwrap_or(0);
            }
        }
    }
    fn save(&mut self, cx: &mut Context<Self>) {
        let result = self.ensure_clean_form().and_then(|()| {
            if self.editor.path.is_none() {
                self.editor.save_as(self.directory.join("strategy-v2.json"))
            } else {
                self.editor.save()
            }
        });
        if result.is_ok() {
            self.status = "Documento guardado de forma atómica.".into();
        }
        self.outcome(result, cx);
    }
    fn save_as(&mut self, cx: &mut Context<Self>) {
        if let Err(error) = self.ensure_clean_form() {
            self.outcome(Err(error), cx);
            return;
        }
        let picker = cx.prompt_for_new_path(&self.directory, Some("strategy-v2.json"));
        cx.spawn(async move |this, cx| {
            let response = picker.await;
            let _ = this.update(cx, |this, cx| {
                let result = match response {
                    Ok(Ok(Some(path))) => this
                        .ensure_clean_form()
                        .and_then(|()| this.editor.save_as(path)),
                    Ok(Ok(None)) => return,
                    _ => Err("No se pudo abrir el selector de guardado".into()),
                };
                if result.is_ok() {
                    this.status =
                        "Documento guardado; los archivos preexistentes no se sobrescriben.".into();
                }
                this.outcome(result, cx);
            });
        })
        .detach();
    }
    fn confirm_event(&mut self, cx: &mut Context<Self>) {
        let result = self
            .editor
            .document
            .as_mut()
            .ok_or_else(|| "Documento ausente".into())
            .and_then(|doc| confirm_metadata(doc, self.event, self.variant, &self.fields));
        if result.is_ok() {
            self.form.dirty = self.form.scalar_dirty;
            self.status =
                "Evento y variante confirmados; las entradas de cálculo se confirman al calcular."
                    .into();
        }
        self.outcome(result, cx);
    }
    fn sync_inputs(&self, cx: &mut Context<Self>) {
        for (index, input) in self.inputs.iter().enumerate() {
            if input.read(cx).value != self.fields[index] {
                input.update(cx, |input, cx| {
                    input.set_value(self.fields[index].clone(), cx);
                });
            }
        }
    }
    fn add_event(&mut self, cx: &mut Context<Self>) {
        let result = (|| {
            let mut next = match &self.editor.document {
                Some(doc) => doc.clone(),
                None => Document::empty(&chrono::Utc::now().to_rfc3339())?,
            };
            let index = append_manual_event(&mut next, &self.fields)?;
            self.editor.document = Some(next);
            self.manual_source_status = SourceStatus::Open;
            self.event = index;
            self.variant = 0;
            self.invalidate();
            self.load_fields(cx);
            self.page = Page::Editor(EditorTab::Carrera);
            self.status =
                "Evento creado. Completa las entradas explícitas para calcular el plan.".into();
            Ok(())
        })();
        self.outcome(result, cx);
    }
    fn current_event(&self) -> Option<&Value> {
        self.editor.document.as_ref()?.value()["events"]
            .as_array()?
            .get(self.event)
    }
    fn input(&self) -> Result<Input, String> {
        let n = |index: usize| parse_number(&self.fields[index]);
        let race = self.fields[9]
            .trim()
            .parse::<u32>()
            .map_err(|_| "Vueltas enteras requeridas")?;
        let reserve = vantare_strategy::document::manual(json!(n(22)?));
        let evidence = reserve["evidence"].clone();
        let input = Input {
            contract_version: "strategy.solver.v2".into(),
            race_laps: race,
            base_lap_seconds: Scalar::manual(n(10)?),
            pit_cost: PitCost {
                transit_seconds: Scalar::manual(n(3)?),
                refuel_rate_l_per_s: Scalar::manual(n(16)?),
                ve_rate_p_per_s: Scalar::manual(n(17)?),
                tyre_seconds: Scalar::manual(n(18)?),
                service_mode: self.fields[23].trim().into(),
            },
            formation: Formation {
                seconds: Scalar::manual(n(19)?),
                presence: "valid".into(),
            },
            event_rules: Rules::default(),
            budget: Budget {
                p95_millis: 2000,
                max_candidates: 250_000,
                max_iterations: 1_000_000,
            },
            fuel_capacity_liters: Scalar::manual(n(2)?),
            ve_capacity_percent: Scalar::manual(n(12)?),
            tyre_life_laps: Scalar::manual(n(14)?),
            fuel_per_lap_liters: Scalar::manual(n(11)?),
            ve_per_lap_percent: Scalar::manual(n(13)?),
            degradation_per_lap_seconds: Scalar::manual(n(15)?),
            discretization: Discretization {
                fuel_liters: n(20)?,
                ve_percent: n(21)?,
            },
            fuel_reserve: json!({"kind":"laps","laps":reserve,"selection":evidence}),
            virtual_energy_reserve: Value::Null,
            extra: std::collections::BTreeMap::new(),
        };
        input.validate()?;
        Ok(input)
    }
    fn prepare_input(&mut self) -> Result<Input, String> {
        let event = self
            .current_event()
            .ok_or("Selecciona un evento con variante")?;
        // Never silently solve an imported forecast/rules/projection as a dry
        // scalar race. Those dimensions must be ported before this UI uses them.
        if event["source"]["value"] != "custom"
            || event["planningInputs"]["overrides"]
                .as_object()
                .is_some_and(|a| {
                    a.keys().any(|key| {
                        !["base_pace_seconds", "fuel_per_lap_liters"].contains(&key.as_str())
                    })
                })
            || event["weatherScenarios"]
                .as_array()
                .is_some_and(|a| !a.is_empty())
            || !event["planningInputs"]["projection"].is_null()
            || event["drivers"].as_array().is_some_and(|a| a.len() > 1)
            || event["availability"]
                .as_object()
                .is_some_and(|a| !a.is_empty())
            || event["tyreInventory"]["sets"]
                .as_array()
                .is_some_and(|a| !a.is_empty())
            || event["tyreInventory"]["byCompound"]
                .as_object()
                .is_some_and(|a| !a.is_empty())
        {
            return Err("Este evento tiene clima, proyección, pilotos, disponibilidad o inventario que el solver escalar aún no admite".into());
        }
        let input = self.input()?;
        let pointer = format!(
            "/events/{}/strategies/{}/overrides",
            self.event, self.variant
        );
        let doc = self.editor.document.as_mut().ok_or("Documento ausente")?;
        let variant = doc
            .value()
            .pointer(&format!(
                "/events/{}/strategies/{}",
                self.event, self.variant
            ))
            .ok_or("Variante ausente")?;
        if let Ok(previous) =
            serde_json::from_value::<Input>(variant["overrides"]["nativeScalarInput"].clone())
        {
            previous.validate()?;
            if previous.event_rules.min_pit_stops.is_some()
                || previous.event_rules.max_pit_stops.is_some()
                || !previous.event_rules.required_windows.is_empty()
                || !previous.event_rules.extra.is_empty()
                || !previous.extra.is_empty()
                || !previous.virtual_energy_reserve.is_null()
                || previous.fuel_reserve["kind"]
                    .as_str()
                    .is_some_and(|kind| kind != "laps")
            {
                return Err("La entrada guardada tiene reglas o reservas que este formulario aún no edita; no se sustituyen por un cálculo sin ellas".into());
            }
        } else if !variant["overrides"]["nativeScalarInput"].is_null() {
            return Err("Entrada nativa guardada inválida; se conserva sin sobrescribir".into());
        }
        if self.fields[8].trim() != "dry"
            || variant["mode"]["value"] != "dry"
            || variant["tyres"].as_object().is_some_and(|a| !a.is_empty())
            || variant["overrides"]
                .as_object()
                .is_some_and(|a| a.keys().any(|key| key != "nativeScalarInput"))
        {
            return Err("La variante contiene modo, neumáticos o restricciones aún no portados; se conservan, pero no se ignoran al calcular".into());
        }
        let mut next = doc.clone();
        confirm_metadata(&mut next, self.event, self.variant, &self.fields)?;
        let planning = format!("/events/{}/planningInputs", self.event);
        if next.value().pointer(&planning).is_none_or(Value::is_null) {
            next.put(&planning, &json!({}))?;
        }
        if next
            .value()
            .pointer(&format!("{planning}/overrides"))
            .is_none_or(Value::is_null)
        {
            next.put(&format!("{planning}/overrides"), &json!({}))?;
        }
        for (key, value) in [
            ("base_pace_seconds", input.base_lap_seconds.value),
            ("fuel_per_lap_liters", input.fuel_per_lap_liters.value),
        ] {
            next.put(
                &format!("{planning}/overrides/{key}"),
                &manual_override(value),
            )?;
        }
        if next.value().pointer(&pointer).is_none_or(Value::is_null) {
            next.put(&pointer, &json!({}))?;
        }
        next.put(
            &format!("{pointer}/nativeScalarInput"),
            &serde_json::to_value(&input).map_err(|e| e.to_string())?,
        )?;
        *doc = next;
        Ok(input)
    }
    fn calculate(&mut self, cx: &mut Context<Self>) {
        if self.running {
            return;
        }
        if self.edit_dirty {
            self.status =
                "Recalcula o restablece el calendario editado antes de iniciar otro cálculo."
                    .into();
            cx.notify();
            return;
        }
        if self.manual_source_status != SourceStatus::Open || self.editor.document.is_none() {
            self.outcome(Err("source_not_open".into()), cx);
            return;
        }
        let input = self.prepare_input();
        let input = match input {
            Ok(input) => input,
            Err(error) => {
                self.outcome(Err(error), cx);
                return;
            }
        };
        let input = match application::prepare_manual(input) {
            Ok(input) => input,
            Err(error) => {
                self.outcome(Err(error), cx);
                return;
            }
        };
        let solver_input = input.input().clone();
        self.invalidate();
        self.last_input = Some(solver_input);
        self.form.dirty = false;
        self.form.scalar_dirty = false;
        self.running = true;
        self.error = None;
        self.status = "Calculando el espacio escalar con entradas manuales confirmadas…".into();
        self.cancellation = Arc::new(AtomicBool::new(false));
        let cancel = self.cancellation.clone();
        let generation = self.generation;
        let task = cx
            .background_executor()
            .spawn(async move { application::calculate(&input, SourceStatus::Open, &cancel) });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                if this.generation != generation {
                    return;
                }
                this.running = false;
                match result {
                    Ok(outcome) => {
                        this.status = match outcome.certificate.status {
                            solver::OptimalityStatus::Proven => {
                                "Óptima demostrada dentro del subespacio escalar declarado"
                            }
                            solver::OptimalityStatus::NotProven if outcome.result.feasible => {
                                "Plan parcial; la búsqueda no demostró la óptima"
                            }
                            solver::OptimalityStatus::NotProven => {
                                "Búsqueda parcial; aún no hay una solución demostrada"
                            }
                            solver::OptimalityStatus::NoSolution => {
                                "No hay solución factible con estos recursos y reservas"
                            }
                        }
                        .into();
                        this.result = Some(outcome);
                    }
                    Err(error) => this.error = Some(error),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
}

fn capture_solver_input(page: crate::demo::CaptureStrategyPage) -> Result<Input, String> {
    let mut input: Input = serde_json::from_str(include_str!(
        "../reference/fixtures/strategy-solver-demo.json"
    ))
    .map_err(|error| format!("fixture demo solver: {error}"))?;
    match page {
        crate::demo::CaptureStrategyPage::PlanPartial => input.budget.max_candidates = 1,
        crate::demo::CaptureStrategyPage::PlanError => {
            input.event_rules.min_pit_stops = None;
            input.event_rules.max_pit_stops = Some(0);
        }
        _ => {}
    }
    Ok(input)
}
impl Drop for Strategy {
    fn drop(&mut self) {
        self.cancellation.store(true, Ordering::Relaxed);
    }
}
fn duration_selection(value: &str) -> Option<usize> {
    if value.trim().is_empty() {
        return None;
    }
    let minutes = value.trim().parse::<u32>().ok();
    Some(
        DURATIONS
            .iter()
            .position(|preset| Some(*preset) == minutes)
            .unwrap_or(DURATIONS.len()),
    )
}
fn parse_number(value: &str) -> Result<f64, String> {
    let number = value
        .trim()
        .parse::<f64>()
        .map_err(|_| "Entrada numérica explícita requerida")?;
    if !number.is_finite() {
        return Err("Número no finito".into());
    }
    Ok(number)
}
fn display(value: &Value) -> String {
    value.as_str().map_or_else(
        || {
            if value.is_null() {
                String::new()
            } else {
                value.to_string()
            }
        },
        str::to_owned,
    )
}

/// Only confirmed user values enter the V2 document; no solver defaults here.
fn append_manual_event(doc: &mut Document, fields: &[String]) -> Result<usize, String> {
    let name = fields[0].trim();
    if name.is_empty() {
        return Err("Nombre del evento requerido".into());
    }
    let duration = fields[1]
        .trim()
        .parse::<u32>()
        .map_err(|_| "Duración entera requerida")?;
    let tank = parse_number(&fields[2])?;
    let pit = parse_number(&fields[3])?;
    let events = doc.value()["events"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let index = events.len();
    let id = (1..=index + 1)
        .map(|n| format!("native-event-{n}"))
        .find(|id| !events.iter().any(|event| event["id"] == id.as_str()))
        .ok_or("No se pudo crear ID")?;
    let mut event = new_event(&id, name, duration, tank, pit);
    event["teamMode"] = vantare_strategy::document::manual(json!("solo"));
    for (index, key) in [(4, "track"), (5, "cls"), (25, "team")] {
        event[key] = vantare_strategy::document::manual(json!(fields[index].trim()));
    }
    for (index, key) in [(6, "name"), (7, "note"), (8, "mode")] {
        if !fields[index].trim().is_empty() {
            event["strategies"][0][key] =
                vantare_strategy::document::manual(json!(fields[index].trim()));
        }
    }
    if !fields[24].trim().is_empty() {
        chrono::DateTime::parse_from_rfc3339(fields[24].trim())
            .map_err(|_| "Salida requerida en RFC 3339 con zona horaria")?;
        event["startAt"] = vantare_strategy::document::manual(json!(fields[24].trim()));
    }
    for (index, key) in [(26, "name"), (27, "ini")] {
        if !fields[index].trim().is_empty() {
            event["drivers"][0][key] =
                vantare_strategy::document::manual(json!(fields[index].trim()));
        }
    }
    let mut overrides = serde_json::Map::new();
    for (index, key) in [(10, "base_pace_seconds"), (11, "fuel_per_lap_liters")] {
        if !fields[index].trim().is_empty() {
            overrides.insert(key.into(), manual_override(parse_number(&fields[index])?));
        }
    }
    if !overrides.is_empty() {
        event["planningInputs"] = json!({"overrides": overrides});
    }
    // Commit all edits together: failed validation leaves the collection intact.
    let mut next = doc.clone();
    next.append_event(&event)?;
    next.put("/activeEventId", &json!(id))?;
    next.put(
        &format!("/events/{index}/activeStrategyId"),
        &json!("variant-1"),
    )?;
    *doc = next;
    Ok(index)
}

fn manual_override(value: f64) -> Value {
    let scalar = Scalar::manual(value);
    json!({"value": value, "presence": "valid", "provenance": scalar.provenance, "confidence": scalar.confidence})
}

fn confirm_metadata(
    doc: &mut Document,
    event: usize,
    variant: usize,
    fields: &[String],
) -> Result<(), String> {
    let mut next = doc.clone();
    for (index, (_, key)) in FIELDS.iter().take(9).enumerate() {
        let pointer = if index < 6 {
            format!("/events/{event}/{key}")
        } else {
            let key = ["name", "note", "mode"][index - 6];
            format!("/events/{event}/strategies/{variant}/{key}")
        };
        let value = match index {
            1 => json!(
                fields[index]
                    .trim()
                    .parse::<u32>()
                    .map_err(|_| "Duración entera requerida")?
            ),
            2 | 3 => json!(parse_number(&fields[index])?),
            _ => json!(fields[index].trim()),
        };
        if next.value().pointer(&format!("{pointer}/value")) != Some(&value) {
            next.edit_sourced(&pointer, &value)?;
        }
    }
    *doc = next;
    Ok(())
}

impl Strategy {
    fn result_card(&self) -> gpui::Div {
        let mut result = orbit::card_body();
        if let Some(outcome) = &self.result {
            let plan = &outcome.result;
            if plan.feasible {
                result = result
                    .child(orbit::setting_row(
                        "Tiempo previsto",
                        "Plan escalar factible con las entradas confirmadas",
                        orbit::text(
                            format!("{:.3} s", plan.expected.total_seconds),
                            15.0,
                            700,
                            orbit::INK,
                        ),
                    ))
                    .child(orbit::setting_row(
                        "Stints",
                        "Vueltas por stint",
                        orbit::text(format!("{:?}", plan.stints), 13.5, 600, orbit::INK),
                    ))
                    .child(orbit::setting_row(
                        "Recursos de salida",
                        "Fuel / energía virtual",
                        orbit::text(
                            format!(
                                "{:.3} L / {:.3} %",
                                plan.fuel_start_liters, plan.ve_start_percent
                            ),
                            13.5,
                            600,
                            orbit::INK,
                        ),
                    ))
                    .child(orbit::setting_row(
                        "Recursos de llegada",
                        "Fuel / energía virtual",
                        orbit::text(
                            format!(
                                "{:.3} L / {:.3} %",
                                plan.fuel_remaining_liters, plan.ve_remaining_percent
                            ),
                            13.5,
                            600,
                            orbit::INK,
                        ),
                    ));
                for pit in &plan.pit_stops {
                    result = result.child(orbit::setting_row(
                        &format!("Boxes · vuelta {}", pit.lap),
                        &pit.service_mode,
                        orbit::text(
                            format!(
                                "Fuel +{:.3} L · VE +{:.3} %",
                                pit.fuel_liters, pit.ve_percent
                            ),
                            12.5,
                            400,
                            orbit::INK_2,
                        ),
                    ));
                }
            } else {
                result = result.child(orbit::callout(
                    "Sin plan factible; no hay tiempos ni recursos de salida que mostrar.",
                ));
            }
        } else {
            result = result.child(orbit::text(
                if self.running {
                    "Calculando…"
                } else {
                    "Confirma las entradas y calcula para ver el plan y sus paradas."
                },
                12.5,
                400,
                orbit::INK_2,
            ));
        }
        orbit::card("Resultado y paradas").child(result)
    }
}

impl Render for Strategy {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.render_page(window, cx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manual_duration_selects_matching_preset_or_custom_without_filling_empty_input() {
        assert_eq!(duration_selection(""), None);
        assert_eq!(duration_selection(" 120 "), Some(1));
        assert_eq!(duration_selection("060"), Some(0));
        assert_eq!(duration_selection("130"), Some(4));
        assert_eq!(duration_selection("invalid"), Some(4));
    }

    #[test]
    fn capture_plan_states_are_native_solver_outcomes() {
        let calculated = capture_solver_input(crate::demo::CaptureStrategyPage::PlanCalculated)
            .expect("fixture de cálculo");
        let prepared = application::prepare_manual(calculated).expect("entrada manual válida");
        let outcome =
            application::calculate(&prepared, SourceStatus::Open, &AtomicBool::new(false))
                .expect("solver demo calculado");
        assert!(outcome.result.feasible);
        assert_eq!(outcome.certificate.status, solver::OptimalityStatus::Proven);
        assert_eq!(outcome.result.stints, [23, 23, 23]);
        assert_eq!(
            outcome
                .result
                .pit_stops
                .iter()
                .map(|stop| stop.lap)
                .collect::<Vec<_>>(),
            [23, 46]
        );

        let partial = capture_solver_input(crate::demo::CaptureStrategyPage::PlanPartial)
            .expect("fixture parcial");
        assert_eq!(partial.budget.max_candidates, 1);
        let prepared = application::prepare_manual(partial).expect("entrada parcial válida");
        let outcome =
            application::calculate(&prepared, SourceStatus::Open, &AtomicBool::new(false))
                .expect("solver demo parcial");
        assert_eq!(
            outcome.certificate.status,
            solver::OptimalityStatus::NotProven
        );

        let impossible = capture_solver_input(crate::demo::CaptureStrategyPage::PlanError)
            .expect("fixture sin solución");
        assert_eq!(impossible.event_rules.max_pit_stops, Some(0));
        let prepared =
            application::prepare_manual(impossible).expect("entrada sin solución válida");
        let outcome =
            application::calculate(&prepared, SourceStatus::Open, &AtomicBool::new(false))
                .expect("solver demo sin solución");
        assert!(!outcome.result.feasible);
        assert_eq!(
            outcome.certificate.status,
            solver::OptimalityStatus::NoSolution
        );
    }
    fn event_fields() -> Vec<String> {
        let mut fields = vec![String::new(); FIELDS.len()];
        for (index, value) in [
            (0, "Carrera manual"),
            (1, "120"),
            (2, "90"),
            (3, "60"),
            (4, "Imola"),
            (5, "LMGT3"),
            (10, "105"),
            (11, "2.8"),
            (24, "2026-09-30T17:00:00+02:00"),
            (26, "Piloto"),
            (27, "PI"),
        ] {
            fields[index] = value.into();
        }
        fields
    }
    #[test]
    fn manual_creation_preserves_collection_selects_event_and_round_trips_confirmed_inputs() {
        let mut doc = Document::empty("2026-09-30T00:00:00Z").expect("document");
        let fields = event_fields();
        assert_eq!(append_manual_event(&mut doc, &fields).expect("first"), 0);
        let first = doc.value()["events"][0].clone();
        assert_eq!(append_manual_event(&mut doc, &fields).expect("second"), 1);
        assert_eq!(doc.value()["events"][0], first);
        assert_eq!(doc.value()["activeEventId"], "native-event-2");
        assert_eq!(doc.value()["events"][1]["activeStrategyId"], "variant-1");
        let restarted = Document::parse(doc.bytes()).expect("round trip");
        let event = &restarted.value()["events"][1];
        assert_eq!(event["startAt"]["value"], fields[24]);
        assert_eq!(event["drivers"][0]["name"]["value"], "Piloto");
        assert_eq!(event["teamMode"]["value"], "solo");
        assert_eq!(
            event["planningInputs"]["overrides"]["base_pace_seconds"]["value"],
            105.0
        );
        assert_eq!(
            event["planningInputs"]["overrides"]["fuel_per_lap_liters"]["provenance"]["kind"],
            "manual"
        );
        // Unentered resources remain absent, including the full solver input.
        assert!(event["strategies"][0]["overrides"]["nativeScalarInput"].is_null());
    }
    #[test]
    fn manual_creation_persists_explicit_variant_and_team_metadata() {
        let mut document = Document::empty("2026-09-30T00:00:00Z").expect("document");
        let mut fields = event_fields();
        fields[6] = "Lluvia".into();
        fields[7] = "Ajustes revisados".into();
        fields[8] = "wet".into();
        fields[25] = "Equipo local".into();
        append_manual_event(&mut document, &fields).expect("evento");
        let event = &document.value()["events"][0];
        assert_eq!(event["teamMode"]["value"], "solo");
        assert_eq!(event["team"]["value"], "Equipo local");
        assert_eq!(event["strategies"][0]["name"]["value"], "Lluvia");
        assert_eq!(event["strategies"][0]["note"]["value"], "Ajustes revisados");
        assert_eq!(event["strategies"][0]["mode"]["value"], "wet");
    }
    #[test]
    fn invalid_manual_form_never_changes_existing_document_or_selection() {
        let mut doc = Document::empty("2026-09-30T00:00:00Z").expect("document");
        append_manual_event(&mut doc, &event_fields()).expect("original");
        let bytes = doc.bytes().to_vec();
        for (index, invalid) in [
            (0, ""),
            (1, "0"),
            (1, "2.5"),
            (2, "-1"),
            (3, "NaN"),
            (10, "0"),
            (11, "-2"),
            (24, "2026-09-30 17:00"),
        ] {
            let mut fields = event_fields();
            fields[index] = invalid.into();
            assert!(
                append_manual_event(&mut doc, &fields).is_err(),
                "field {index}"
            );
            assert_eq!(doc.bytes(), bytes);
        }
    }
    #[test]
    fn empty_optional_inputs_are_not_filled_with_example_data() {
        let mut doc = Document::empty("2026-09-30T00:00:00Z").expect("document");
        let mut fields = event_fields();
        for index in [10, 11, 24, 26, 27] {
            fields[index].clear();
        }
        append_manual_event(&mut doc, &fields).expect("minimal form");
        let event = &doc.value()["events"][0];
        assert!(event["planningInputs"].is_null());
        assert!(event["startAt"]["value"].is_null());
        assert!(event["drivers"][0]["name"].is_null());
    }
    #[test]
    fn metadata_confirmation_is_atomic_and_preserves_unchanged_evidence() {
        let mut doc = Document::empty("2026-09-30T00:00:00Z").expect("document");
        let mut fields = event_fields();
        append_manual_event(&mut doc, &fields).expect("original");
        fields[6] = "Base".into();
        fields[8] = "dry".into();
        let original = doc.bytes().to_vec();
        confirm_metadata(&mut doc, 0, 0, &fields).expect("unchanged");
        assert_eq!(doc.bytes(), original);
        fields[0] = "Nombre nuevo".into();
        fields[8] = "invalid".into();
        assert!(confirm_metadata(&mut doc, 0, 0, &fields).is_err());
        assert_eq!(doc.bytes(), original);
        fields[8] = "dry".into();
        confirm_metadata(&mut doc, 0, 0, &fields).expect("confirmed edit");
        assert_eq!(doc.value()["events"][0]["name"]["value"], "Nombre nuevo");
    }
    #[test]
    fn atomic_save_restart_conflict_and_failed_open_preserve_the_document() {
        let directory =
            std::env::temp_dir().join(format!("vantare-strategy-editor-{}", std::process::id()));
        std::fs::create_dir_all(&directory).expect("own directory");
        let path = directory.join("strategy.json");
        let mut editor = Editor::default();
        editor.create().expect("create");
        editor
            .document
            .as_mut()
            .expect("doc")
            .append_event(&new_event("event", "Original", 60, 90.0, 30.0))
            .expect("event");
        assert!(editor.open(path.clone()).is_err());
        editor.save_as(path.clone()).expect("save");
        let original = files::read(&path, LIMIT).expect("read");
        let mut restarted = Editor::default();
        restarted.open(path.clone()).expect("restart");
        restarted
            .document
            .as_mut()
            .expect("doc")
            .edit_sourced("/events/0/name", &json!("Edited"))
            .expect("edit");
        std::fs::write(&path, b"external bytes").expect("external mutation");
        assert!(
            restarted
                .save()
                .expect_err("conflict")
                .contains("conflicto")
        );
        assert_eq!(
            files::read(&path, LIMIT).expect("retained"),
            b"external bytes"
        );
        restarted.discard().expect("discard");
        assert_eq!(restarted.document.as_ref().expect("doc").bytes(), original);
        assert!(restarted.open(path.clone()).is_err());
        assert_eq!(restarted.document.as_ref().expect("doc").bytes(), original);
        std::fs::remove_file(path).expect("remove own file");
        std::fs::remove_dir(directory).expect("remove empty directory");
    }
    #[test]
    fn numbers_are_explicit_and_nonfinite_values_are_rejected() {
        for invalid in ["", "NaN", "inf", "text"] {
            assert!(parse_number(invalid).is_err());
        }
        assert_eq!(
            parse_number("0").expect("explicit zero").to_bits(),
            0.0_f64.to_bits()
        );
    }
}
