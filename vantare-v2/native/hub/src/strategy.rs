//! Local Strategy editor. Analysis and weather acquisition remain separate.
use std::path::PathBuf;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use gpui::{
    Context, FocusHandle, IntoElement, KeyDownEvent, PathPromptOptions, Render, Window, div,
    prelude::*, rgb,
};
use serde_json::{Value, json};
use vantare_ui::efficiency::tokens;

use crate::{
    files,
    shell::button,
    strategy_core::{
        document::{Document, new_event},
        solver::{
            self, Budget, Discretization, Formation, Input, PitCost, ResultV2, Rules, Scalar,
        },
    },
};

const LIMIT: u64 = 12 * 1024 * 1024;

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

const FIELDS: &[(&str, &str)] = &[
    ("Nombre del evento", "name"),
    ("Duración (min)", "durationMin"),
    ("Depósito (L)", "tankLiters"),
    ("Tránsito boxes (s)", "pitLossSeconds"),
    ("Circuito", "track"),
    ("Clase", "cls"),
    ("Nombre variante", "variantName"),
    ("Nota variante", "variantNote"),
    ("Modo variante (dry / humid / wet / eco)", "variantMode"),
    ("Vueltas de carrera", "raceLaps"),
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
];

pub struct Strategy {
    editor: Editor,
    directory: PathBuf,
    focus: FocusHandle,
    fields: Vec<String>,
    editing: Option<usize>,
    buffer: String,
    event: usize,
    variant: usize,
    form_dirty: bool,
    pub status: String,
    pub error: Option<String>,
    result: Option<ResultV2>,
    running: bool,
    cancellation: Arc<AtomicBool>,
    generation: u64,
}
impl Strategy {
    pub fn new(directory: PathBuf, cx: &mut Context<Self>) -> Self {
        Self {
            editor: Editor::default(),
            directory,
            focus: cx.focus_handle(),
            fields: vec![String::new(); FIELDS.len()],
            editing: None,
            buffer: String::new(),
            event: 0,
            variant: 0,
            form_dirty: false,
            status:
                "Abre un documento V2 o crea uno. Los datos de cálculo se introducen manualmente."
                    .into(),
            error: None,
            result: None,
            running: false,
            cancellation: Arc::new(AtomicBool::new(false)),
            generation: 0,
        }
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
    }
    fn ensure_clean_form(&self) -> Result<(), String> {
        if self.form_dirty || self.editing.is_some() {
            return Err(
                "Aplica la edición y confirma los datos con Calcular, o descarta los cambios"
                    .into(),
            );
        }
        Ok(())
    }
    pub fn persist(&mut self) -> Result<(), String> {
        self.ensure_clean_form()?;
        self.editor.save()
    }
    fn load_fields(&mut self) {
        self.fields.fill(String::new());
        self.editing = None;
        self.form_dirty = false;
        let Some(doc) = &self.editor.document else {
            return;
        };
        let event = &doc.value()["events"][self.event];
        for (index, (_, field)) in FIELDS.iter().take(6).enumerate() {
            self.fields[index] = display(&event[field]["value"]);
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
            self.load_fields();
        }
        self.outcome(result, cx);
    }
    fn create(&mut self, cx: &mut Context<Self>) {
        let result = self.ensure_clean_form().and_then(|()| self.editor.create());
        if result.is_ok() {
            self.event = 0;
            self.variant = 0;
            self.invalidate();
            self.load_fields();
            self.status="Documento vacío; completa nombre, duración, depósito y tránsito para añadir un evento.".into();
        }
        self.outcome(result, cx);
    }
    fn discard(&mut self, cx: &mut Context<Self>) {
        let result = self.editor.discard();
        if result.is_ok() {
            self.event = 0;
            self.variant = 0;
            self.invalidate();
            self.load_fields();
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
                    this.restore_selection();
                    this.invalidate();
                    this.load_fields();
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
        let result = self.persist();
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
    fn apply(&mut self, cx: &mut Context<Self>) {
        let Some(index) = self.editing else {
            return;
        };
        let result = (|| {
            if index < 9 && self.current_event().is_some() {
                let field = if index < 6 {
                    FIELDS[index].1
                } else {
                    ["name", "note", "mode"][index - 6]
                };
                let pointer = if index < 6 {
                    format!("/events/{}/{field}", self.event)
                } else {
                    format!("/events/{}/strategies/{}/{field}", self.event, self.variant)
                };
                let value = if index == 1 {
                    json!(
                        self.buffer
                            .trim()
                            .parse::<u32>()
                            .map_err(|_| "Duración entera requerida")?
                    )
                } else if [2, 3].contains(&index) {
                    json!(parse_number(&self.buffer)?)
                } else {
                    json!(self.buffer.trim())
                };
                self.editor
                    .document
                    .as_mut()
                    .ok_or("Documento ausente")?
                    .edit_sourced(&pointer, &value)?;
            } else {
                self.form_dirty = true;
            }
            self.fields[index].clone_from(&self.buffer);
            self.editing = None;
            self.invalidate();
            Ok(())
        })();
        self.outcome(result, cx);
    }
    fn add_event(&mut self, cx: &mut Context<Self>) {
        let result = (|| {
            if self.editing.is_some() {
                return Err("Aplica primero el campo en edición".into());
            }
            let name = self.fields[0].trim();
            if name.is_empty() {
                return Err("Nombre del evento requerido".into());
            }
            let duration = self.fields[1]
                .parse::<u32>()
                .map_err(|_| "Duración entera requerida")?;
            let tank = parse_number(&self.fields[2])?;
            let pit = parse_number(&self.fields[3])?;
            let doc = self
                .editor
                .document
                .as_mut()
                .ok_or("Crea un documento primero")?;
            let count = doc.value()["events"].as_array().map_or(0, Vec::len);
            let existing = doc.value()["events"]
                .as_array()
                .map_or(&[][..], Vec::as_slice);
            let id = (1..=count + 1)
                .map(|n| format!("native-event-{n}"))
                .find(|id| !existing.iter().any(|e| e["id"] == id.as_str()))
                .ok_or("No se pudo crear ID")?;
            let mut event = new_event(&id, name, duration, tank, pit);
            event["track"] = crate::strategy_core::document::manual(json!(self.fields[4]));
            event["cls"] = crate::strategy_core::document::manual(json!(self.fields[5]));
            doc.append_event(&event)?;
            self.event = count;
            self.variant = 0;
            self.invalidate();
            self.load_fields();
            self.status="Evento añadido con una variante y un piloto; completa los datos manuales del cálculo.".into();
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
        let reserve = crate::strategy_core::document::manual(json!(n(22)?));
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
        if self.editing.is_some() {
            return Err("Aplica primero el campo en edición".into());
        }
        let event = self
            .current_event()
            .ok_or("Selecciona un evento con variante")?;
        // Never silently solve an imported forecast/rules/projection as a dry
        // scalar race. Those dimensions must be ported before this UI uses them.
        if event["source"]["value"] != "custom"
            || event["planningInputs"]["overrides"]
                .as_object()
                .is_some_and(|a| !a.is_empty())
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
        if variant["mode"]["value"] != "dry"
            || variant["tyres"].as_object().is_some_and(|a| !a.is_empty())
            || variant["overrides"]
                .as_object()
                .is_some_and(|a| a.keys().any(|key| key != "nativeScalarInput"))
        {
            return Err("La variante contiene modo, neumáticos o restricciones aún no portados; se conservan, pero no se ignoran al calcular".into());
        }
        let mut next = doc.clone();
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
        let input = self.prepare_input();
        let input = match input {
            Ok(input) => input,
            Err(error) => {
                self.outcome(Err(error), cx);
                return;
            }
        };
        self.invalidate();
        self.form_dirty = false;
        self.running = true;
        self.error = None;
        self.status = "Calculando el espacio escalar con entradas manuales confirmadas…".into();
        self.cancellation = Arc::new(AtomicBool::new(false));
        let cancel = self.cancellation.clone();
        let generation = self.generation;
        let task = cx
            .background_executor()
            .spawn(async move { solver::solve_cancellable(&input, &cancel) });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                if this.generation != generation {
                    return;
                }
                this.running = false;
                match result {
                    Ok(result) => {
                        this.status = if result.feasible {
                            "Plan escalar óptimo dentro de las entradas manuales declaradas"
                        } else {
                            "No hay plan factible con estos recursos y reservas"
                        }
                        .into();
                        this.result = Some(result);
                    }
                    Err(error) => this.error = Some(error),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
    fn key(&mut self, event: &KeyDownEvent, cx: &mut Context<Self>) {
        if self.editing.is_none() {
            return;
        }
        let key = &event.keystroke;
        if key.modifiers.control && key.key == "v" {
            if let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) {
                self.buffer.push_str(&text.replace(['\n', '\r'], " "));
            }
        } else if key.modifiers.control && key.key == "a" {
            self.buffer.clear();
        } else if key.key == "backspace" {
            self.buffer.pop();
        } else if key.key == "escape" {
            self.editing = None;
        } else if key.key == "enter" {
            self.apply(cx);
        } else if !key.modifiers.control
            && !key.modifiers.alt
            && let Some(text) = &key.key_char
        {
            self.buffer.push_str(text);
        } else {
            return;
        }
        if self.buffer.len() > 4096 {
            self.buffer.truncate(self.buffer.floor_char_boundary(4096));
        }
        cx.stop_propagation();
        cx.notify();
    }
}
impl Drop for Strategy {
    fn drop(&mut self) {
        self.cancellation.store(true, Ordering::Relaxed);
    }
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

impl Strategy {
    fn field_evidence(&self, index: usize) -> String {
        let Some(event) = self.current_event() else {
            return "sin confirmar".into();
        };
        let sourced = match index {
            0..=5 => &event[FIELDS[index].1],
            6..=8 => {
                let field = ["name", "note", "mode"][index - 6];
                &event["strategies"][self.variant][field]
            }
            _ => return "entrada manual explícita al confirmar".into(),
        };
        let evidence = &sourced["evidence"];
        format!(
            "{} · confianza {} · {}",
            display(&evidence["provenance"]["kind"]),
            display(&evidence["confidence"]["level"]),
            display(&evidence["confidence"]["basis"])
        )
    }

    fn choices(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut choices = div().flex().flex_col().gap_1();
        if let Some(doc) = &self.editor.document {
            for (event, event_value) in doc.value()["events"]
                .as_array()
                .map_or(&[][..], Vec::as_slice)
                .iter()
                .enumerate()
            {
                let label = format!(
                    "{} · {} variantes",
                    display(&event_value["name"]["value"]),
                    event_value["strategies"].as_array().map_or(0, Vec::len)
                );
                choices = choices.child(
                    button("strategy-event", "Elegir evento")
                        .id(("strategy-event", event))
                        .child(label)
                        .on_click(cx.listener(move |this, _, _, cx| this.choose(event, 0, cx))),
                );
            }
            if let Some(event) = self.current_event() {
                for (variant, value) in event["strategies"]
                    .as_array()
                    .map_or(&[][..], Vec::as_slice)
                    .iter()
                    .enumerate()
                {
                    let event = self.event;
                    let label = display(&value["name"]["value"]);
                    choices = choices.child(
                        button("strategy-variant", "Elegir variante")
                            .id(("strategy-variant", variant))
                            .child(label)
                            .on_click(
                                cx.listener(move |this, _, _, cx| this.choose(event, variant, cx)),
                            ),
                    );
                }
            }
        }
        choices
    }
}

impl Render for Strategy {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let choices = self.choices(cx);
        let mut fields = div().flex().flex_col().gap_1();
        for (index, (label, _)) in FIELDS.iter().enumerate() {
            let value = if self.editing == Some(index) {
                format!("{}▏", self.buffer)
            } else {
                self.fields[index].clone()
            };
            fields = fields.child(
                div()
                    .id(index)
                    .role(gpui::Role::TextInput)
                    .aria_label(*label)
                    .tab_index(0)
                    .px_2()
                    .py_1()
                    .border_1()
                    .border_color(rgb(tokens::MUTED))
                    .cursor(gpui::CursorStyle::IBeam)
                    .child(format!("{label}: {value}"))
                    .child(
                        div()
                            .text_xs()
                            .text_color(rgb(tokens::MUTED))
                            .child(self.field_evidence(index)),
                    )
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.editing = Some(index);
                        this.buffer = this.fields[index].clone();
                        this.focus.focus(window, cx);
                        cx.notify();
                    })),
            );
        }
        let mut result = div().flex().flex_col().gap_1();
        if let Some(plan) = &self.result {
            if plan.feasible {
                result = result
                    .child(format!(
                        "Factible: {} · {:.3} s · stints {:?}",
                        plan.feasible, plan.expected.total_seconds, plan.stints
                    ))
                    .child(format!(
                        "Salida Fuel {:.3} L / VE {:.3} % · llegada Fuel {:.3} L / VE {:.3} %",
                        plan.fuel_start_liters,
                        plan.ve_start_percent,
                        plan.fuel_remaining_liters,
                        plan.ve_remaining_percent
                    ));
                for pit in &plan.pit_stops {
                    result = result.child(format!(
                        "Vuelta {} · Fuel +{:.3} L · VE +{:.3} % · {}",
                        pit.lap, pit.fuel_liters, pit.ve_percent, pit.service_mode
                    ));
                }
            } else {
                result = result
                    .child("Sin plan factible; no hay tiempos ni recursos de salida que mostrar.");
            }
        }
        div().id("strategy").track_focus(&self.focus).flex_1().min_h_0().flex().flex_col().gap_2().overflow_y_scroll().on_key_down(cx.listener(|this,event,_,cx|this.key(event,cx)))
            .child(self.status.clone()).when_some(self.error.clone(),gpui::ParentElement::child)
            .child(format!("Archivo: {} · cambios {}",self.editor.path.as_ref().map_or_else(||"sin guardar".into(),|p|p.display().to_string()),self.editor.dirty()||self.form_dirty))
            .child(div().flex().gap_2().flex_wrap()
                .child(button("strategy-open","Abrir").on_click(cx.listener(|this,_,_,cx|this.open(cx))))
                .child(button("strategy-create","Crear documento").on_click(cx.listener(|this,_,_,cx|this.create(cx))))
                .child(button("strategy-save","Guardar").on_click(cx.listener(|this,_,_,cx|this.save(cx))))
                .child(button("strategy-save-as","Guardar como").on_click(cx.listener(|this,_,_,cx|this.save_as(cx))))
                .child(button("strategy-discard","Descartar cambios").on_click(cx.listener(|this,_,_,cx|this.discard(cx)))))
            .child("Cálculo manual escalar: sin telemetría, forecast, pilotos múltiples, inventario físico, ahorro ni incertidumbre. Escribe todos los números; 0 desactiva VE/vida/reserva. No se inventan entradas ausentes.")
            .child(choices).child(fields)
            .child("Edición: clic, escribir; Ctrl+A vacía, Ctrl+V pega, Enter aplica, Esc cancela. Procedencia manual solo al confirmar.")
            .child(div().flex().gap_2().flex_wrap()
                .child(button("strategy-apply","Aplicar campo").on_click(cx.listener(|this,_,_,cx|this.apply(cx))))
                .child(button("strategy-add-event","Añadir evento con estos datos").on_click(cx.listener(|this,_,_,cx|this.add_event(cx))))
                .child(button("strategy-calculate","Confirmar entradas y calcular").on_click(cx.listener(|this,_,_,cx|this.calculate(cx))))
                .child(button("strategy-cancel","Cancelar cálculo").on_click(cx.listener(|this,_,_,cx|{this.invalidate();this.status="Cálculo cancelado; no se conserva resultado parcial".into();cx.notify();}))))
            .child(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
