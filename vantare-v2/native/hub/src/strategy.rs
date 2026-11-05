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
use serde_json::Value;
#[cfg(test)]
use serde_json::json;

use crate::{
    files,
    orbit::{self, button},
};
use vantare_strategy::{
    application::{
        self, AnalysisRevisionRef, EditedPlan, ManualEvent, ManualField as Field, SourceStatus,
    },
    document::Document,
    solver::{self, Input, SolverOutcome},
};

// Only the selected expression exists after cfg expansion.
macro_rules! capture {
    ($normal:expr, $capture:expr) => {{
        #[cfg(feature = "parity-capture")]
        {
            $capture.unwrap_or_else(|| $normal)
        }
        #[cfg(not(feature = "parity-capture"))]
        {
            $normal
        }
    }};
    ($capture:block) => {
        #[cfg(feature = "parity-capture")]
        $capture
    };
}

#[path = "strategy/asistente.rs"]
mod assistant;
#[cfg(any(test, feature = "parity-capture"))]
mod captura;
#[path = "strategy/editor.rs"]
mod editor_view;
mod parada;
mod plan;
#[cfg(feature = "parity-capture")]
mod view_data;
#[cfg(test)]
use captura::capture_solver_input;
#[cfg(test)]
mod state_tests;
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
    format: ImageFormat,
    description: &str,
) -> (Option<Arc<RenderImage>>, Option<String>) {
    let image = Image::from_bytes(format, bytes.to_vec())
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
    damaged_observed: Option<Vec<u8>>,
    warning: Option<String>,
}
impl Editor {
    // Read after a successful open, before the recovery warning is consumed.
    fn take_open_status(&mut self) -> String {
        self.warning.take().map_or_else(
            || "Documento cargado; procedencia y campos desconocidos conservados.".into(),
            |warning| format!("Se empezó un documento vacío. {warning}"),
        )
    }

    pub fn dirty(&self) -> bool {
        self.document
            .as_ref()
            .is_some_and(|doc| self.saved.as_deref() != Some(doc.bytes()))
    }
    pub fn open(&mut self, path: PathBuf) -> Result<(), String> {
        if self.dirty() {
            return Err("Guarda o descarta los cambios antes de abrir otro documento".into());
        }
        std::fs::metadata(&path).map_err(|error| error.to_string())?;
        let opened = vantare_ipc::files::Doc::open_or_quarantine(
            &path,
            &vantare_ipc::files::Options {
                limit: LIMIT,
                ..Default::default()
            },
            |bytes| {
                let value: Value = serde_json::from_slice(bytes)
                    .map_err(|error| files::Error::InvalidInput(error.to_string()))?;
                for (field, supported) in [
                    ("contractVersion", &["strategy.v2"][..]),
                    ("schemaVersion", &["2.0.0", "2.1.0"][..]),
                ] {
                    if let Some(version) = value[field].as_str()
                        && !supported.contains(&version)
                    {
                        return Err(files::Error::Unsupported(format!(
                            "{field} {version}: original protegido"
                        )));
                    }
                }
                Document::parse(bytes)
                    .map(Some)
                    .map_err(files::Error::InvalidInput)
            },
            || None,
        );
        // No observed bytes means recovery was unsafe (future version, read or
        // archive failure). Keep the currently open document untouched.
        let observed = opened.observed.ok_or_else(|| {
            opened
                .warning
                .clone()
                .unwrap_or_else(|| "Documento no disponible".into())
        })?;
        let recovered = opened.value.is_none();
        let document = match opened.value {
            Some(document) => document,
            None => Document::empty(&chrono::Utc::now().to_rfc3339())?,
        };
        self.document = Some(document);
        self.path = Some(path);
        if recovered {
            self.saved = None;
            self.damaged_observed = Some(observed);
        } else {
            self.saved = Some(observed);
            self.damaged_observed = None;
        }
        self.warning = opened.warning;
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
        self.damaged_observed = None;
        self.warning = None;
        Ok(())
    }
    pub fn save(&mut self) -> Result<(), files::Error> {
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
        files::save_with_limit(
            path,
            doc.bytes(),
            self.damaged_observed.as_deref().or(self.saved.as_deref()),
            LIMIT,
        )?;
        self.saved = Some(doc.bytes().to_vec());
        self.damaged_observed = None;
        self.warning = None;
        Ok(())
    }
    pub fn save_as(&mut self, path: PathBuf) -> Result<(), files::Error> {
        let doc = self.document.as_ref().ok_or("Crea o abre un documento")?;
        if self.path.as_ref() == Some(&path) {
            return self.save();
        }
        // Never overwrite an unobserved target, even if the OS dialog accepts it.
        files::save_with_limit(&path, doc.bytes(), None, LIMIT)?;
        self.path = Some(path);
        self.saved = Some(doc.bytes().to_vec());
        self.damaged_observed = None;
        self.warning = None;
        Ok(())
    }
    pub fn discard(&mut self) -> Result<(), String> {
        if let Some(saved) = &self.saved {
            self.document = Some(Document::parse(saved)?);
        } else {
            self.document = None;
            self.path = None;
            self.damaged_observed = None;
            self.warning = None;
        }
        Ok(())
    }
}

#[derive(Default)]
struct FormState {
    dirty: bool,
    scalar_dirty: bool,
}

const FIELDS: &[(Field, &str)] = &[
    (Field::Name, "Nombre de la carrera"),
    (Field::DurationMinutes, "Duración (min)"),
    (Field::FuelCapacityLiters, "Depósito (L)"),
    (Field::PitTransitSeconds, "Tránsito boxes (s)"),
    (Field::Track, "Circuito"),
    (Field::Class, "Clase"),
    (Field::VariantName, "Nombre variante"),
    (Field::VariantNote, "Nota variante"),
    (
        Field::VariantMode,
        "Modo variante (dry / humid / wet / eco)",
    ),
    (Field::RaceLaps, "Distancia · vueltas"),
    (Field::BasePaceSeconds, "Ritmo (s/v)"),
    (Field::FuelPerLapLiters, "Consumo Fuel (L/v)"),
    (Field::VeCapacityPercent, "Capacidad VE (%)"),
    (Field::VePerLapPercent, "Consumo VE (%/v)"),
    (Field::TyreLifeLaps, "Vida neumático (v; 0 sin límite)"),
    (Field::DegradationSeconds, "Degradación (s/v)"),
    (Field::RefuelRate, "Repostaje (L/s)"),
    (Field::VeRate, "Recarga VE (%/s)"),
    (Field::TyreServiceSeconds, "Neumáticos en boxes (s)"),
    (Field::FormationSeconds, "Formación (s)"),
    (Field::FuelStep, "Paso Fuel (L)"),
    (Field::VeStep, "Paso VE (%)"),
    (Field::ReserveLaps, "Reserva final (v)"),
    (Field::ServiceMode, "Servicio (parallel / sequential)"),
    (Field::StartAt, "Salida (RFC 3339 con zona; opcional)"),
    (Field::Team, "Equipo"),
    (Field::DriverName, "Piloto"),
    (Field::DriverInitials, "Iniciales"),
];

#[allow(clippy::struct_excessive_bools)] // Modo, edición, formulario y solver son estados independientes.
pub struct Strategy {
    editor: Editor,
    directory: PathBuf,
    fields: ManualEvent,
    inputs: Vec<Entity<orbit::Input>>,
    page: Page,
    edit_mode: bool,
    rules_details_open: bool,
    garage: Option<Arc<RenderImage>>,
    garage_detail: Option<Arc<RenderImage>>,
    garage_veil: Option<Arc<RenderImage>>,
    #[cfg(feature = "parity-capture")]
    view_data: view_data::ViewData,
    duration: Option<Entity<orbit::Choice>>,
    event: usize,
    variant: usize,
    form: FormState,
    pub status: String,
    pub error: Option<crate::files::Failure>,
    result: Option<SolverOutcome>,
    last_input: Option<Input>,
    manual_source_status: SourceStatus,
    source_revisions: Vec<AnalysisRevisionRef>,
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
    let result = if path.exists() {
        editor.open(path)
    } else {
        application::repository::import_last_draft(directory).and_then(|draft| {
            if let Some(bytes) = draft {
                editor.document = Some(Document::parse(&bytes)?);
                editor.save_as(path).map_err(|error| error.to_string())?;
            }
            Ok(())
        })
    };
    let error = result.err().or_else(|| editor.warning.take());
    (editor, error)
}

impl Strategy {
    pub fn new(directory: PathBuf, cx: &mut Context<Self>) -> Self {
        let (editor, error) = open_editor(&directory);
        let (garage, garage_error) = load_strategy_image(
            include_bytes!("../assets/strategy-garage.png"),
            ImageFormat::Png,
            "fondo de Strategy",
        );
        let (garage_detail, garage_detail_error) = load_strategy_image(
            include_bytes!("../assets/strategy-garage-detail.png"),
            ImageFormat::Png,
            "fondo detallado de Strategy",
        );

        let (garage_veil, garage_veil_error) = view::load_garage_veil();

        let manual_source_status = if editor.document.is_some() {
            SourceStatus::Open
        } else {
            SourceStatus::Closed
        };
        let inputs = FIELDS
            .iter()
            .map(|(field, label)| {
                let field = *field;
                let input = cx.new(|cx| orbit::Input::new(String::new(), label, cx));
                cx.observe(&input, move |this, input, cx| {
                    let value = input.read(cx).value.clone();
                    if this.fields[field] != value {
                        this.fields[field] = value;
                        this.form.dirty = true;
                        this.form.scalar_dirty |= field.is_scalar();
                        if field == Field::DurationMinutes
                            && this.page == Page::Create
                            && let Some(duration) = &this.duration
                        {
                            let selected = duration_selection(&this.fields[Field::DurationMinutes]);
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
        let mut this = Self {
            editor,
            directory,
            fields: ManualEvent::default(),
            inputs,
            page: Page::Collection,
            edit_mode: false,
            rules_details_open: false,
            garage,
            garage_detail,
            garage_veil,
            #[cfg(feature = "parity-capture")]
            view_data: view_data::ViewData::default(),
            duration: None,
            event: 0,
            variant: 0,
            form: FormState::default(),
            status:
                "Abre un documento V2 o crea uno. Los datos de cálculo se introducen manualmente."
                    .into(),
            error: [error, garage_error, garage_detail_error, garage_veil_error]
                .into_iter()
                .find_map(|error| error.map(Into::into)),
            result: None,
            last_input: None,
            manual_source_status,
            source_revisions: Vec::new(),
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
    fn outcome<E: Into<files::Error>>(&mut self, result: Result<(), E>, cx: &mut Context<Self>) {
        self.error = result.err().map(|error| files::Failure::from(error.into()));
        cx.notify();
    }
    fn cancel_pending_calculation(&mut self) {
        self.cancellation.store(true, Ordering::Relaxed);
        self.generation = self.generation.wrapping_add(1);
        self.running = false;
    }

    fn invalidate(&mut self) {
        self.cancel_pending_calculation();
        self.result = None;
        self.last_input = None;
        self.edited_plan = None;
        self.baseline_edited_plan = None;
        self.baseline_result = None;
        self.edit_dirty = false;
        self.edit_cost_seconds = None;
        self.edit_error = None;
    }

    fn ensure_clean_form(&self) -> Result<(), String> {
        if self.form.dirty {
            return Err("Confirma los cambios pendientes o descártalos antes de continuar".into());
        }
        Ok(())
    }
    pub fn persist(&mut self) -> Result<(), files::Error> {
        self.ensure_clean_form()?;
        self.editor.save().inspect_err(|error| {
            self.error = Some(files::Failure::new(error.kind(), error.to_string()));
        })
    }
    fn load_fields(&mut self, cx: &mut Context<Self>) {
        self.form.dirty = false;
        self.form.scalar_dirty = false;
        self.fields = self
            .editor
            .document
            .as_ref()
            .map_or_else(ManualEvent::default, |doc| {
                ManualEvent::read(doc, self.event, self.variant)
            });
        self.sync_inputs(cx);
    }
    fn choose(&mut self, event: usize, variant: usize, cx: &mut Context<Self>) {
        let result = self.ensure_clean_form().and_then(|()| {
            let doc = self.editor.document.as_mut().ok_or("Documento ausente")?;
            application::select_event(doc, event, variant)
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
            self.outcome::<String>(Err(error), cx);
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
                    this.status = this.editor.take_open_status();
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
        let result = self
            .ensure_clean_form()
            .map_err(files::Error::from)
            .and_then(|()| {
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
            self.outcome::<String>(Err(error), cx);
            return;
        }
        let picker = cx.prompt_for_new_path(&self.directory, Some("strategy-v2.json"));
        cx.spawn(async move |this, cx| {
            let response = picker.await;
            let _ = this.update(cx, |this, cx| {
                let result = match response {
                    Ok(Ok(Some(path))) => this
                        .ensure_clean_form()
                        .map_err(files::Error::from)
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
            .and_then(|doc| self.fields.confirm(doc, self.event, self.variant));
        if result.is_ok() {
            self.form.dirty = self.form.scalar_dirty;
            self.status =
                "Evento y variante confirmados; las entradas de cálculo se confirman al calcular."
                    .into();
        }
        self.outcome(result, cx);
    }
    fn sync_inputs(&self, cx: &mut Context<Self>) {
        for ((field, _), input) in FIELDS.iter().zip(&self.inputs) {
            if input.read(cx).value != self.fields[*field] {
                input.update(cx, |input, cx| {
                    input.set_value(self.fields[*field].clone(), cx);
                });
            }
        }
    }
    fn add_event(&mut self, cx: &mut Context<Self>) {
        let result: Result<(), String> = (|| {
            let mut next = match &self.editor.document {
                Some(doc) => doc.clone(),
                None => Document::empty(&chrono::Utc::now().to_rfc3339())?,
            };
            let index = self.fields.append(&mut next)?;
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
        self.fields.to_input()
    }
    fn prepare_input(&mut self) -> Result<Input, String> {
        let doc = self
            .editor
            .document
            .as_mut()
            .ok_or("Selecciona un evento con variante")?;
        self.fields.prepare(doc, self.event, self.variant)
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
            self.outcome::<String>(Err("source_not_open".into()), cx);
            return;
        }
        let input = self.prepare_input();
        let input = match input {
            Ok(input) => input,
            Err(error) => {
                self.outcome::<String>(Err(error), cx);
                return;
            }
        };
        let input = match application::prepare_manual(input) {
            Ok(input) => input,
            Err(error) => {
                self.outcome::<String>(Err(error), cx);
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
                    Err(error) => this.error = Some(error.into()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
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

impl Strategy {
    fn result_card(&self, cx: &gpui::App) -> gpui::Div {
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
                            orbit::ink(cx),
                            cx,
                        ),
                        cx,
                    ))
                    .child(orbit::setting_row(
                        "Stints",
                        "Vueltas por stint",
                        orbit::text(format!("{:?}", plan.stints), 13.5, 600, orbit::ink(cx), cx),
                        cx,
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
                            orbit::ink(cx),
                            cx,
                        ),
                        cx,
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
                            orbit::ink(cx),
                            cx,
                        ),
                        cx,
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
                            orbit::ink_2(cx),
                            cx,
                        ),
                        cx,
                    ));
                }
            } else {
                result = result.child(orbit::callout(
                    "Sin plan factible; no hay tiempos ni recursos de salida que mostrar.",
                    cx,
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
                orbit::ink_2(cx),
                cx,
            ));
        }
        orbit::card("Resultado y paradas", cx).child(result)
    }
}

impl Render for Strategy {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.render_page(window, cx)
    }
}

#[cfg(test)]
use vantare_strategy::document::new_event;
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manual_fields_match_input_entity_indices() {
        let fields = FIELDS.iter().map(|(field, _)| *field).collect::<Vec<_>>();
        assert_eq!(fields.as_slice(), Field::ALL);
        for (index, field) in fields.into_iter().enumerate() {
            assert_eq!(field as usize, index);
        }
    }

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
    fn event_fields() -> ManualEvent {
        let mut fields = ManualEvent::default();
        for (index, value) in [
            (Field::Name, "Carrera manual"),
            (Field::DurationMinutes, "120"),
            (Field::FuelCapacityLiters, "90"),
            (Field::PitTransitSeconds, "60"),
            (Field::Track, "Imola"),
            (Field::Class, "LMGT3"),
            (Field::BasePaceSeconds, "105"),
            (Field::FuelPerLapLiters, "2.8"),
            (Field::StartAt, "2026-09-30T17:00:00+02:00"),
            (Field::DriverName, "Piloto"),
            (Field::DriverInitials, "PI"),
        ] {
            fields[index] = value.into();
        }
        fields
    }
    #[test]
    fn manual_creation_preserves_collection_selects_event_and_round_trips_confirmed_inputs() {
        let mut doc = Document::empty("2026-09-30T00:00:00Z").expect("document");
        let fields = event_fields();
        assert_eq!(fields.append(&mut doc).expect("first"), 0);
        let first = doc.value()["events"][0].clone();
        assert_eq!(fields.append(&mut doc).expect("second"), 1);
        assert_eq!(doc.value()["events"][0], first);
        assert_eq!(doc.value()["activeEventId"], "native-event-2");
        assert_eq!(doc.value()["events"][1]["activeStrategyId"], "variant-1");
        let restarted = Document::parse(doc.bytes()).expect("round trip");
        let event = &restarted.value()["events"][1];
        assert_eq!(event["startAt"]["value"], fields[Field::StartAt]);
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
        fields[Field::VariantName] = "Lluvia".into();
        fields[Field::VariantNote] = "Ajustes revisados".into();
        fields[Field::VariantMode] = "wet".into();
        fields[Field::Team] = "Equipo local".into();
        fields.append(&mut document).expect("evento");
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
        event_fields().append(&mut doc).expect("original");
        let bytes = doc.bytes().to_vec();
        for (index, invalid) in [
            (Field::Name, ""),
            (Field::DurationMinutes, "0"),
            (Field::DurationMinutes, "2.5"),
            (Field::FuelCapacityLiters, "-1"),
            (Field::PitTransitSeconds, "NaN"),
            (Field::BasePaceSeconds, "0"),
            (Field::FuelPerLapLiters, "-2"),
            (Field::StartAt, "2026-09-30 17:00"),
        ] {
            let mut fields = event_fields();
            fields[index] = invalid.into();
            assert!(fields.append(&mut doc).is_err(), "field {index:?}");
            assert_eq!(doc.bytes(), bytes);
        }
    }
    #[test]
    fn empty_optional_inputs_are_not_filled_with_example_data() {
        let mut doc = Document::empty("2026-09-30T00:00:00Z").expect("document");
        let mut fields = event_fields();
        for index in [
            Field::BasePaceSeconds,
            Field::FuelPerLapLiters,
            Field::StartAt,
            Field::DriverName,
            Field::DriverInitials,
        ] {
            fields[index].clear();
        }
        fields.append(&mut doc).expect("minimal form");
        let event = &doc.value()["events"][0];
        assert!(event["planningInputs"].is_null());
        assert!(event["startAt"]["value"].is_null());
        assert!(event["drivers"][0]["name"].is_null());
    }
    #[test]
    fn metadata_confirmation_is_atomic_and_preserves_unchanged_evidence() {
        let mut doc = Document::empty("2026-09-30T00:00:00Z").expect("document");
        let mut fields = event_fields();
        fields.append(&mut doc).expect("original");
        fields[Field::VariantName] = "Base".into();
        fields[Field::VariantMode] = "dry".into();
        let original = doc.bytes().to_vec();
        fields.confirm(&mut doc, 0, 0).expect("unchanged");
        assert_eq!(doc.bytes(), original);
        fields[Field::Name] = "Nombre nuevo".into();
        fields[Field::VariantMode] = "invalid".into();
        assert!(fields.confirm(&mut doc, 0, 0).is_err());
        assert_eq!(doc.bytes(), original);
        fields[Field::VariantMode] = "dry".into();
        fields.confirm(&mut doc, 0, 0).expect("confirmed edit");
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
        assert!(restarted.save().expect_err("conflict").kind().is_conflict());
        assert_eq!(
            files::read(&path, LIMIT).expect("retained"),
            b"external bytes"
        );
        restarted.discard().expect("discard");
        assert_eq!(restarted.document.as_ref().expect("doc").bytes(), original);
        assert!(restarted.open(directory.join("missing.json")).is_err());
        assert_eq!(restarted.document.as_ref().expect("doc").bytes(), original);
        std::fs::remove_file(path).expect("remove own file");
        std::fs::remove_dir_all(directory).expect("limpiar temporal");
    }
}
