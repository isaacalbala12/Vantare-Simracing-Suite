//! Workshop de desarrollo sobre el mismo `Overlay` que el producto.
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

use gpui::{
    App, Context, Entity, FocusHandle, IntoElement, Render, Window, WindowOptions, div, prelude::*,
    px, rgb,
};
use vantare_domain::{Snapshot, format::Preferences};

use crate::{
    Kind, Settings,
    app::{self, Overlay},
};

mod interpolation;
mod state;
mod view;

const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures");

struct Scene {
    path: PathBuf,
    modified: Option<SystemTime>,
    snapshots: Vec<Snapshot>,
    error: Option<String>,
    label: String,
    frame_ms: u64,
    captions: Vec<String>,
    watch_for: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneDocument {
    label: String,
    frame_ms: u64,
    frames: Vec<SceneFrame>,
    watch_for: String,
}

#[derive(serde::Deserialize)]
struct SceneFrame {
    caption: String,
    snapshot: serde_json::Value,
}

/// Foto DTO o secuencia no vacía; cada miembro conserva la validación del IPC.
pub fn snapshots_from_json(json: &str) -> Result<Vec<Snapshot>, String> {
    if json.trim_start().starts_with('[') {
        let values: Vec<serde_json::Value> =
            serde_json::from_str(json).map_err(|e| e.to_string())?;
        if values.is_empty() {
            return Err("la escena no contiene fotos".into());
        }
        values
            .into_iter()
            .enumerate()
            .map(|(i, value)| {
                vantare_ipc::snapshot_from_saved_json(&value.to_string())
                    .map_err(|e| format!("foto {i}: {e}"))
            })
            .collect()
    } else {
        vantare_ipc::snapshot_from_saved_json(json)
            .map(|snapshot| vec![snapshot])
            .map_err(|e| e.to_string())
    }
}

fn modified(path: &Path) -> Option<SystemTime> {
    std::fs::metadata(path).and_then(|m| m.modified()).ok()
}

impl Scene {
    fn new(path: &Path) -> Result<Self, String> {
        let path = std::fs::canonicalize(path).map_err(|e| format!("{}: {e}", path.display()))?;
        let stamp = modified(&path);
        let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let (snapshots, label, frame_ms, captions, watch_for) =
            if path.to_string_lossy().ends_with(".scene.json") {
                let document: SceneDocument =
                    serde_json::from_str(&json).map_err(|e| e.to_string())?;
                if document.frames.is_empty() || !(50..=60_000).contains(&document.frame_ms) {
                    return Err("escena vacía o duración de fase inválida".into());
                }
                let mut snapshots = Vec::new();
                let mut captions = Vec::new();
                for frame in document.frames {
                    snapshots.push(
                        vantare_ipc::snapshot_from_saved_json(&frame.snapshot.to_string())
                            .map_err(|e| e.to_string())?,
                    );
                    captions.push(frame.caption);
                }
                (
                    snapshots,
                    document.label,
                    document.frame_ms,
                    captions,
                    document.watch_for,
                )
            } else {
                (
                    snapshots_from_json(&json)?,
                    path.file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned(),
                    1200,
                    Vec::new(),
                    "Escena DTO; cada foto conserva la validación IPC.".into(),
                )
            };
        Ok(Self {
            path,
            modified: stamp,
            snapshots,
            error: None,
            label,
            frame_ms,
            captions,
            watch_for,
        })
    }

    fn reload(&mut self) {
        // Una escritura incompleta o JSON inválido nunca reemplaza la última foto válida.
        match Self::new(&self.path) {
            Ok(scene) => *self = scene,
            Err(error) => self.error = Some(error),
        }
    }

    fn poll(&mut self) -> bool {
        let stamp = modified(&self.path);
        if stamp == self.modified {
            return false;
        }
        self.modified = stamp;
        self.reload();
        true
    }

    fn select(&mut self, path: PathBuf) {
        self.modified = modified(&path);
        self.path = path;
        self.reload();
    }
}

fn scenes(initial: &Path) -> Result<Vec<PathBuf>, String> {
    let mut paths = std::fs::read_dir(FIXTURES)
        .map_err(|e| format!("leer {FIXTURES}: {e}"))?
        .map(|entry| entry.map(|e| e.path()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    paths.retain(|p| {
        p.is_file()
            && (p.to_string_lossy().ends_with(".snapshot.json")
                || p.to_string_lossy().ends_with(".sequence.json")
                || p.to_string_lossy().ends_with(".scene.json"))
    });
    let mut paths = paths
        .into_iter()
        .map(std::fs::canonicalize)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if !paths.iter().any(|p| p == initial) {
        paths.push(initial.to_path_buf());
    }
    paths.sort();
    Ok(paths)
}

/// Estilo editable en vivo: el último JSON válido se conserva ante errores.
struct LiveStyle<T> {
    path: PathBuf,
    modified: Option<SystemTime>,
    value: std::sync::Arc<T>,
    error: Option<String>,
    parse: fn(&str) -> Result<std::sync::Arc<T>, String>,
}

impl<T> LiveStyle<T> {
    fn new(
        path: PathBuf,
        compiled: std::sync::Arc<T>,
        parse: fn(&str) -> Result<std::sync::Arc<T>, String>,
    ) -> Self {
        let mut file = Self {
            path,
            modified: None,
            value: compiled,
            error: None,
            parse,
        };
        file.reload();
        file
    }

    fn reload(&mut self) {
        self.modified = modified(&self.path);
        match std::fs::read_to_string(&self.path)
            .map_err(|e| e.to_string())
            .and_then(|json| (self.parse)(&json))
        {
            Ok(style) => {
                self.value = style;
                self.error = None;
                eprintln!(
                    "Workshop en vivo: estilo aplicado · {}",
                    self.path.display()
                );
            }
            Err(error) => self.error = Some(format!("{}: {error}", self.path.display())),
        }
    }

    fn poll(&mut self) -> bool {
        if modified(&self.path) == self.modified {
            return false;
        }
        self.reload();
        true
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Control {
    Widget,
    Scene,
    Language,
    Background,
    Scale,
    Study,
    Source,
    Session,
    Location,
    Width,
    Height,
    Surface,
    Compare,
    Player,
    Name,
    Module(&'static str),
    Footer(&'static str),
    Preset,
    Setting(&'static str),
    /// Plantilla de columnas Vantare (compact, standard, expanded).
    Template(&'static str),
    /// Desplaza una columna Vantare un puesto (−1 izquierda, +1 derecha).
    MoveColumn(&'static str, i32),
    /// Marca Vantare visible u oculta (en producto la decide la licencia).
    Brand,
}

struct Playback {
    frame: usize,
    playing: bool,
    looping: bool,
    elapsed: Duration,
    last_tick: Instant,
    last_sample: Option<(usize, u64)>,
}

impl Playback {
    fn new(now: Instant) -> Self {
        Self {
            frame: 0,
            playing: false,
            looping: false,
            elapsed: Duration::ZERO,
            last_tick: now,
            last_sample: None,
        }
    }

    /// Un tick nunca salta varias fases después de suspender el equipo.
    /// true reconstruye el renderer al volver al principio del bucle.
    fn advance(&mut self, now: Instant, frame_ms: u64, count: usize) -> Option<bool> {
        let phase = Duration::from_millis(frame_ms);
        let delta = now.saturating_duration_since(self.last_tick).min(phase);
        self.last_tick = now;
        if !self.playing {
            return None;
        }
        self.elapsed += delta;
        if self.elapsed < phase {
            return None;
        }
        self.elapsed -= phase;
        if self.frame + 1 < count {
            self.frame += 1;
            if !self.looping && self.frame + 1 == count {
                self.playing = false;
            }
            Some(false)
        } else if self.looping {
            self.frame = 0;
            Some(true)
        } else {
            self.playing = false;
            None
        }
    }
}

struct Workshop {
    style: LiveStyle<crate::standings::style::Style>,
    vantare_style: LiveStyle<crate::vantare::style::Style>,
    kind: Kind,
    settings: Settings,
    prefs: Preferences,
    scene: Scene,
    scenes: Vec<PathBuf>,
    scene_labels: Vec<String>,
    overlay: Entity<Overlay>,
    comparison: Option<Entity<Overlay>>,
    state_file: Option<PathBuf>,
    state_error: Option<String>,
    focus: FocusHandle,
    open: Option<Control>,
    background: String,
    scale: f32,
    study: String,
    dimensions: Option<(f32, f32)>,
    surface: String,
    preset: String,
    comparison_surface: String,
    source: Option<vantare_domain::SourceState>,
    source_error: bool,
    session: Option<vantare_domain::SessionKind>,
    in_pits: Option<bool>,
    playback: Playback,
    player_position: Option<usize>,
    name_mode: String,
    numeric: Option<(Control, String)>,
    slider_bounds: Option<gpui::Bounds<gpui::Pixels>>,
    dragging: bool,
    /// Escala que encaja el widget en el escenario visible (≤ 1).
    fit: f32,
    /// Panel lateral oculto para dar todo el ancho al escenario.
    panel_hidden: bool,
    /// Rectángulo de la vista previa del widget en la ventana.
    widget_bounds: Option<gpui::Bounds<gpui::Pixels>>,
    /// Columna Vantare cogida para moverla.
    column_drag: Option<&'static str>,
    /// Columna Vantare bajo el puntero, recuadrada para saber qué se coge.
    column_hover: Option<&'static str>,
}

/// Ajustes de partida de Standings en Workshop para cada sistema de diseño.
/// Ajustes de partida en Workshop de un widget con columnas para cada sistema.
fn system_defaults(kind: Kind, system: crate::look::Look) -> Settings {
    system.workshop_defaults(kind)
}

fn default_settings(kind: Kind) -> Settings {
    system_defaults(kind, crate::standings::DesignSystem::default())
}

pub(crate) fn default_columns(kind: Kind) -> Vec<crate::standings::options::ColumnSetting> {
    let metrics: &[(&str, &str, bool)] = if kind == Kind::Relative {
        &[
            ("position", "xs", true),
            ("class", "auto", true),
            ("driverName", "lg", true),
            ("gap", "md", true),
        ]
    } else {
        &[
            ("position", "xs", true),
            ("driverName", "lg", true),
            ("gap", "md", true),
            ("bestLap", "lg", false),
            ("lastLap", "lg", true),
            ("pit", "auto", true),
        ]
    };
    metrics
        .iter()
        .map(
            |(metric, preset, enabled)| crate::standings::options::ColumnSetting {
                id: (*metric).into(),
                metric_id: (*metric).into(),
                width_preset: (*preset).into(),
                enabled: *enabled,
                ..Default::default()
            },
        )
        .collect()
}

fn default_path(kind: Kind) -> PathBuf {
    let demo = Path::new(FIXTURES).join(format!("{}-default.scene.json", kind.name()));
    if demo.is_file() {
        return demo;
    }
    for suffix in ["sequence.json", "snapshot.json"] {
        let path = Path::new(FIXTURES).join(format!("{}.{suffix}", kind.name()));
        if path.is_file() {
            return path;
        }
    }
    Path::new(FIXTURES).join("lmu47.snapshot.json")
}

/// Tamaño de la vista previa: el Relative Eficiencia heredado se muestra con su
/// ancho fijo de 470 px; el resto (Vantare incluido) con su tamaño real.
fn preview_size(fixed_relative_preview: bool, size: (f32, f32)) -> (f32, f32) {
    if fixed_relative_preview {
        (
            crate::relative::SIZE.0,
            size.1 * crate::relative::SIZE.0 / size.0,
        )
    } else {
        size
    }
}

impl Workshop {
    /// El widget es el Relative Eficiencia heredado (vista previa a 470 px).
    fn fixed_relative_preview(&self) -> bool {
        self.settings.fixed_relative_preview()
    }

    fn edit_number(&mut self, key: &str, cx: &mut Context<Self>) -> bool {
        let Some((control, text)) = &mut self.numeric else {
            return false;
        };
        match key {
            "escape" => {
                self.numeric = None;
                cx.notify();
                return key != "tab";
            }
            "enter" | "tab" => {
                let Some((control, text)) = self.numeric.take() else {
                    return false;
                };
                let max = if control == Control::Width {
                    3840
                } else {
                    2160
                };
                match text.parse::<u32>() {
                    Ok(n) if (64..=max).contains(&n) => self.select(control, &n.to_string(), cx),
                    _ => {
                        self.state_error = Some(format!("Tamaño entre 64 y {max} px"));
                        cx.notify();
                    }
                }
                return key == "enter";
            }
            "backspace" => {
                text.pop();
            }
            key if key.len() == 1 && key.as_bytes()[0].is_ascii_digit() && text.len() < 4 => {
                text.push_str(key);
            }
            _ => return false,
        }
        let _ = control;
        cx.notify();
        true
    }

    fn scrub(&mut self, x: gpui::Pixels, cx: &mut Context<Self>) {
        if let Some(bounds) = self.slider_bounds {
            let ratio =
                (f32::from(x - bounds.left()) / f32::from(bounds.size.width)).clamp(0.0, 1.0);
            let frame = (ratio * (self.scene.snapshots.len() - 1) as f32).round() as usize;
            self.park(frame, cx);
        }
    }

    fn persist(&mut self) {
        if let Some(path) = &self.state_file {
            let saved = state::Saved {
                version: 1,
                settings: self.settings.clone(),
                scene: self.scene.path.clone(),
                frame: self.playback.frame,
                background: self.background.clone(),
                scale: self.scale,
                dimensions: self.dimensions,
                study: self.study.clone(),
                preset: self.preset.clone(),
                surface: self.surface.clone(),
                comparison: self
                    .comparison
                    .as_ref()
                    .map(|_| self.comparison_surface.clone()),
                language: if self.prefs.language == vantare_domain::format::Language::En {
                    "en"
                } else {
                    "es"
                }
                .into(),
                player_position: self.player_position,
                name_mode: self.name_mode.clone(),
            };
            self.state_error = saved.save(path).err();
        }
    }

    fn snapshot(&self, index: usize) -> Snapshot {
        let mut snapshot = self.scene.snapshots[index].clone();
        // «Pilotos totales» es un control de Eficiencia; Vantare elige sus filas.
        if let Some(row_count) = self.settings.preview_row_limit() {
            snapshot.state.cars.retain(|car| {
                car.position
                    .current()
                    .is_some_and(|position| *position <= row_count as u32)
            });
        }
        if let Some(position) = self.player_position {
            let car = snapshot
                .state
                .cars
                .iter()
                .find(|car| car.position.current() == Some(&(position as u32)))
                .map(|car| car.id);
            if let (Some(player), Some(car)) = (&mut snapshot.state.player, car) {
                player.car = car;
            }
        }
        if let Some(source) = self.source {
            snapshot.state.source_state = source;
        }
        if let Some(session) = &self.session {
            snapshot.state.session.kind = vantare_domain::Quality::Reliable(session.clone());
        }
        if let Some(in_pits) = self.in_pits {
            let player = snapshot.state.player.as_ref().map(|p| p.car);
            if let Some(car) = snapshot
                .state
                .cars
                .iter_mut()
                .find(|c| Some(c.id) == player)
            {
                car.in_pits = vantare_domain::Quality::Reliable(in_pits);
            }
        }
        snapshot
    }

    fn replay(&mut self, cx: &mut Context<Self>) {
        self.playback.last_sample = None;
        // Retroceder/editar reconstruye el renderer para no inferir eventos del futuro.
        let snapshots: Vec<_> = (0..=self.playback.frame)
            .map(|index| self.snapshot(index))
            .collect();
        let mut settings = self.settings.clone();
        if let Settings::Standings(settings) = &mut settings {
            settings.player_window &= self.study == "default";
        }
        if let Settings::Standings(settings) = &mut settings
            && settings.player_window
            && let Some(snapshot) = snapshots.last()
        {
            let player = snapshot.state.player.as_ref().map(|p| p.car);
            let index = snapshot
                .state
                .cars
                .iter()
                .position(|c| Some(c.id) == player)
                .unwrap_or(0);
            settings.row_count = snapshot
                .state
                .cars
                .len()
                .min(3 + settings.window_around + usize::from(index >= 3));
        }
        let prefs = self.prefs;
        let mut style = (*self.style.value).clone();
        if self.study == "v2-focus" {
            style.fonts.brand_size = 9.0;
            style.fonts.clock_size = 13.0;
            style.fonts.column_label_size = 10.0;
            style.colors.column_label.0 = 0x9a9aa0;
            style.opacity.frame = 0.08;
            style.opacity.top_frame = 0.14;
            style.geometry.player_marker_width = 0.0;
            style.geometry.chip_radius = 3.0;
            style.geometry.chip_cut_radius = 3.0;
        }
        let style = std::sync::Arc::new(style);
        let vantare = self.vantare_style.value.clone();
        let scale = self.scale * self.fit;
        let dimensions = self.dimensions;
        let study = self.study.clone();
        let legacy = self.fixed_relative_preview();
        let make = |cx: &mut Context<Overlay>| {
            let mut overlay = Overlay::configured(&settings, prefs);
            overlay.workshop_layout();
            overlay.standings_style(style.clone(), cx);
            overlay.vantare_style(vantare.clone(), cx);
            overlay.standings_study(&study);
            let size = overlay.wanted_size();
            let natural = preview_size(legacy, size);
            let target = dimensions.unwrap_or(natural);
            if let Err(error) =
                overlay.set_preview_axes(scale * target.0 / size.0, scale * target.1 / size.1)
            {
                eprintln!("Workshop: {error}");
            }
            // La historia se ingiere de golpe: solo debe animar el último cambio.
            if let Some((last, history)) = snapshots.split_last() {
                for snapshot in history {
                    overlay.ingest(snapshot, cx);
                }
                overlay.settle();
                overlay.ingest(last, cx);
            }
            overlay
        };
        self.overlay = cx.new(make);
        if self.comparison.is_some() {
            self.comparison = Some(cx.new(make));
        }
    }

    /// Punto de la ventana → punto del widget (px lógicos del widget).
    fn widget_point(&self, point: gpui::Point<gpui::Pixels>, cx: &App) -> Option<(f32, f32)> {
        let bounds = self.widget_bounds?;
        let (sx, sy) = self.widget_scale(cx);
        Some((
            f32::from(point.x - bounds.left()) / sx,
            f32::from(point.y - bounds.top()) / sy,
        ))
    }

    /// Escala real de la vista previa en cada eje (px de pantalla por px del widget).
    fn widget_scale(&self, cx: &App) -> (f32, f32) {
        let size = self.overlay.read(cx).wanted_size();
        let target = self
            .dimensions
            .unwrap_or(preview_size(self.fixed_relative_preview(), size));
        let scale = self.scale * self.fit;
        (scale * target.0 / size.0, scale * target.1 / size.1)
    }

    /// Coge la columna bajo el puntero (no la posición, que es fija).
    fn start_column_drag(&mut self, point: gpui::Point<gpui::Pixels>, cx: &mut Context<Self>) {
        let (Some((x, y)), Some(boxes)) = (
            self.widget_point(point, cx),
            self.overlay.read(cx).vantare_columns(),
        ) else {
            return;
        };
        self.column_drag = boxes.at(x, y).map(|(metric, ..)| metric);
        cx.notify();
    }

    /// Recuadra la columna bajo el puntero o, arrastrando, la mueve en
    /// directo en cuanto el puntero pasa la mitad de la vecina.
    fn drag_column(&mut self, point: gpui::Point<gpui::Pixels>, cx: &mut Context<Self>) {
        let (Some((x, y)), Some(boxes)) = (
            self.widget_point(point, cx),
            self.overlay.read(cx).vantare_columns(),
        ) else {
            return;
        };
        let Some(dragged) = self.column_drag else {
            let hover = boxes.at(x, y).map(|(metric, ..)| metric);
            if hover != self.column_hover {
                self.column_hover = hover;
                cx.notify();
            }
            return;
        };
        let columns = &boxes.columns;
        let Some(from) = columns.iter().position(|(m, ..)| *m == dragged) else {
            return;
        };
        let target = if from + 1 < columns.len() {
            let (next, left, width) = columns[from + 1];
            (x > left + width / 2.0).then_some((next, 1))
        } else {
            None
        }
        .or_else(|| {
            from.checked_sub(1).and_then(|index| {
                let (previous, left, width) = columns[index];
                (x < left + width / 2.0).then_some((previous, -1))
            })
        });
        if let Some((_, step)) = target
            && self.shift_vantare_column(dragged, step)
        {
            self.replay(cx);
        }
        cx.notify();
    }

    /// Columnas Vantare del widget (Standings o Relative), con la plantilla
    /// estándar si aún no hay ninguna.
    fn vantare_columns_mut(
        &mut self,
    ) -> Option<&mut Vec<crate::standings::options::ColumnSetting>> {
        self.settings.style_columns_mut()
    }

    fn shift_vantare_column(&mut self, metric: &str, step: i32) -> bool {
        let relative = self.kind == Kind::Relative;
        let Some(columns) = self.vantare_columns_mut() else {
            return false;
        };
        if relative {
            crate::relative::shift_column(columns, metric, step)
        } else {
            crate::standings::shift_column(columns, metric, step)
        }
    }

    fn finish_column_drag(&mut self, cx: &mut Context<Self>) {
        if self.column_drag.take().is_some() {
            self.persist();
            cx.notify();
        }
    }

    /// Reaplica la escala de vista previa sin recrear los widgets.
    fn apply_preview(&self, cx: &mut App) {
        let (scale, dimensions, legacy) = (
            self.scale * self.fit,
            self.dimensions,
            self.fixed_relative_preview(),
        );
        for view in std::iter::once(&self.overlay).chain(self.comparison.as_ref()) {
            view.update(cx, |overlay, cx| {
                let size = overlay.wanted_size();
                let target = dimensions.unwrap_or(preview_size(legacy, size));
                if overlay
                    .set_preview_axes(scale * target.0 / size.0, scale * target.1 / size.1)
                    .is_ok()
                {
                    cx.notify();
                }
            });
        }
    }

    fn park(&mut self, frame: usize, cx: &mut Context<Self>) {
        self.playback.playing = false;
        self.playback.frame = frame.min(self.scene.snapshots.len() - 1);
        self.playback.elapsed = Duration::ZERO;
        self.playback.last_sample = None;
        self.replay(cx);
        self.persist();
        cx.notify();
    }

    fn play(&mut self, cx: &mut Context<Self>) {
        self.playback.playing = !self.playback.playing;
        if self.playback.playing {
            if self.playback.frame + 1 == self.scene.snapshots.len() {
                self.playback.frame = 0;
                self.playback.elapsed = Duration::ZERO;
                self.playback.last_sample = None;
                self.replay(cx);
            }
            self.playback.last_tick = Instant::now();
        }
        cx.notify();
    }

    fn tick(&mut self, now: Instant, cx: &mut Context<Self>) {
        let advanced = self
            .playback
            .advance(now, self.scene.frame_ms, self.scene.snapshots.len());
        if advanced == Some(true) {
            self.replay(cx);
        }
        if !self.playback.playing && advanced.is_none() {
            return;
        }
        let hz = match self.kind {
            Kind::Standings | Kind::Relative => 15.0,
            Kind::DeltaTrace
            | Kind::Delta
            | Kind::Pedals
            | Kind::PedalsTelemetry
            | Kind::InputTelemetry => 30.0,
            Kind::CarDamageNumbers | Kind::CarDamageVisual | Kind::FuelStrategy => 5.0,
            Kind::TrackWeather | Kind::TrackMap => 2.0,
            _ => 10.0,
        };
        let sample = (self.playback.elapsed.as_secs_f64() * hz).floor() as u64;
        let key = (self.playback.frame, sample);
        if self.playback.last_sample == Some(key) {
            return;
        }
        self.playback.last_sample = Some(key);
        let from = self.snapshot(self.playback.frame);
        let next = if self.playback.frame + 1 < self.scene.snapshots.len() {
            self.playback.frame + 1
        } else if self.playback.looping {
            0
        } else {
            self.playback.frame
        };
        let progress = (sample as f64 / hz * 1000.0 / self.scene.frame_ms as f64).min(1.0);
        let snapshot = interpolation::snapshot(
            &from,
            &self.snapshot(next),
            progress,
            self.kind == Kind::Radar,
        );
        self.overlay
            .update(cx, |overlay, cx| overlay.ingest(&snapshot, cx));
        if let Some(view) = &self.comparison {
            view.update(cx, |overlay, cx| overlay.ingest(&snapshot, cx));
        }
        cx.notify();
    }

    fn select(&mut self, control: Control, value: &str, cx: &mut Context<Self>) {
        let previous_settings = self.settings.clone();
        self.open = None;
        let result: Result<(), String> = (|| {
            match control {
                Control::Widget => {
                    let kind = value.parse().map_err(|()| "widget inválido".to_owned())?;
                    let scene = Scene::new(&default_path(kind))?;
                    self.kind = kind;
                    self.settings = default_settings(kind);
                    self.scene = scene;
                    self.playback.frame = 0;
                    self.playback.elapsed = Duration::ZERO;
                    self.playback.playing = false;
                    self.dimensions = None;
                    self.player_position = None;
                    self.name_mode = "full".into();
                }
                Control::Scene => {
                    self.scene.select(PathBuf::from(value));
                    self.playback.frame = 0;
                    self.playback.elapsed = Duration::ZERO;
                    self.playback.playing = false;
                }
                Control::Language => {
                    self.prefs.language = if value == "en" {
                        vantare_domain::format::Language::En
                    } else {
                        vantare_domain::format::Language::Es
                    };
                }
                Control::Study => self.study = value.into(),
                Control::Background => self.background = value.into(),
                Control::Scale => self.scale = value.parse().map_err(|e| format!("escala: {e}"))?,
                Control::Source => {
                    self.source_error = value == "error";
                    self.source = match value {
                        "stale" => Some(vantare_domain::SourceState::Stale),
                        "lost" => Some(vantare_domain::SourceState::Lost),
                        "waiting" => Some(vantare_domain::SourceState::Waiting),
                        _ => None,
                    }
                }
                Control::Session => {
                    self.session = Some(match value {
                        "practice" => vantare_domain::SessionKind::Practice,
                        "qualifying" => vantare_domain::SessionKind::Qualifying,
                        _ => vantare_domain::SessionKind::Race,
                    });
                }
                Control::Location => self.in_pits = Some(value == "pits"),
                Control::Width | Control::Height => {
                    let wanted = preview_size(
                        self.fixed_relative_preview(),
                        self.overlay.read(cx).wanted_size(),
                    );
                    let mut size = self.dimensions.unwrap_or(wanted);
                    let number = value.parse::<f32>().map_err(|e| format!("tamaño: {e}"))?;
                    if control == Control::Width {
                        size.0 = number;
                    } else {
                        size.1 = number;
                    }
                    self.dimensions = Some(size);
                }
                Control::Surface => self.surface = value.into(),
                Control::Preset => {
                    self.preset = value.into();
                    self.dimensions = Some(match value {
                        "720p" => (1280.0, 720.0),
                        "1440p" => (2560.0, 1440.0),
                        _ => (1920.0, 1080.0),
                    });
                }
                Control::Player => {
                    self.player_position = Some(value.parse::<usize>().map_err(|e| e.to_string())?);
                }
                Control::Name | Control::Module(_) => {
                    if control == Control::Name {
                        self.name_mode = value.into();
                    }
                    let columns = match &mut self.settings {
                        Settings::Standings(settings) => &mut settings.columns,
                        Settings::Relative(settings) => &mut settings.columns,
                        _ => return Err("este widget no tiene columnas de pilotos".into()),
                    };
                    let columns = columns.get_or_insert_with(|| default_columns(self.kind));
                    for column in columns {
                        if column.metric_id == "driverName" {
                            column.format.mode.clone_from(&self.name_mode);
                        }
                        if let Control::Module(metric) = control
                            && column.metric_id == metric
                        {
                            column.enabled = !column.enabled;
                        }
                    }
                }
                Control::Template(name) => {
                    let mut template = if self.kind == Kind::Relative {
                        crate::relative::vantare_template(name)
                    } else {
                        crate::standings::vantare_template(name)
                    };
                    for column in &mut template {
                        if column.metric_id == "driverName" {
                            column.format.mode.clone_from(&self.name_mode);
                        }
                    }
                    let Some(columns) = self.vantare_columns_mut() else {
                        return Err("este widget no tiene plantillas Vantare".into());
                    };
                    *columns = template;
                    // Las plantillas de Relative fijan también su alcance (±2, ±3, ±4).
                    if let Settings::Relative(settings) = &mut self.settings {
                        let range = match name {
                            "compact" => 2,
                            "expanded" => 4,
                            _ => 3,
                        };
                        settings.range_ahead = range;
                        settings.range_behind = range;
                    }
                }
                Control::MoveColumn(metric, step) => {
                    self.shift_vantare_column(metric, step);
                }
                Control::Brand => {
                    let brand = match &mut self.settings {
                        Settings::Standings(settings) => &mut settings.brand_visible,
                        Settings::Relative(settings) => &mut settings.brand_visible,
                        Settings::FuelStrategy(settings) => &mut settings.brand_visible,
                        Settings::Delta(settings) => &mut settings.brand_visible,
                        _ => return Err("este widget no tiene marca".into()),
                    };
                    *brand = Some(value == "true");
                }
                Control::Footer(slot) => {
                    let slots = match &mut self.settings {
                        Settings::Standings(settings) => {
                            settings.footer_slots.get_or_insert_with(Vec::new)
                        }
                        Settings::Relative(settings) => &mut settings.footer_slots,
                        _ => return Err("este widget no tiene pie de datos".into()),
                    };
                    if slots.iter().any(|s| s == slot) {
                        slots.retain(|s| s != slot);
                    } else {
                        slots.push(slot.into());
                    }
                }
                Control::Compare => {
                    self.comparison_surface = value.into();
                    self.comparison = if value == "off" {
                        None
                    } else {
                        Some(self.overlay.clone())
                    };
                }
                Control::Setting("designSystem") => {
                    let look = crate::look::Look::from_name(value).ok_or("Look inválido")?;
                    self.settings.set_look(look);
                }
                Control::Setting(key) => {
                    let mut settings =
                        serde_json::to_value(&self.settings).map_err(|e| e.to_string())?;
                    let current = &settings[key];
                    settings[key] = if current.is_boolean() {
                        serde_json::json!(value == "true")
                    } else if current.is_number() {
                        serde_json::json!(value.parse::<u64>().map_err(|e| e.to_string())?)
                    } else {
                        serde_json::json!(value)
                    };
                    let next = serde_json::from_value::<Settings>(settings)
                        .map_err(|e| e.to_string())?
                        .normalized();
                    self.settings = next;
                }
            }
            Ok(())
        })();
        self.state_error = result.err();
        if self.state_error.is_none() && self.scene.error.is_none() {
            if let Some(look) = previous_settings.look_change(&self.settings) {
                self.overlay.update(cx, |overlay, cx| {
                    overlay.set_look(look);
                    cx.notify();
                });
                if let Some(view) = &self.comparison {
                    view.update(cx, |overlay, cx| {
                        overlay.set_look(look);
                        cx.notify();
                    });
                }
                self.apply_preview(cx);
            } else {
                self.replay(cx);
            }
            self.persist();
        }
        cx.notify();
    }
}

/// Abre una ventana interactiva; las capturas siguen usando su host independiente.
pub fn run(kind: Option<Kind>, path: Option<PathBuf>) -> Result<(), String> {
    let state_file = Some(state::path()?);
    let mut state_error = None;
    let mut saved = match state::Saved::load(state_file.as_ref().ok_or("ruta de ajustes ausente")?)
    {
        Ok(saved) => saved,
        Err(error) => {
            state_error = Some(error);
            None
        }
    };
    if path.is_some()
        || kind.is_some_and(|kind| saved.as_ref().is_some_and(|s| s.settings.kind() != kind))
    {
        saved = None;
    }
    if let Some(previous) = &saved
        && let Err(error) = Scene::new(&previous.scene)
    {
        state_error = Some(format!("restaurar escena: {error}"));
        saved = None;
    }
    let kind = kind
        .or_else(|| saved.as_ref().map(|s| s.settings.kind()))
        .unwrap_or(Kind::Standings);
    let path = path
        .or_else(|| saved.as_ref().map(|s| s.scene.clone()))
        .unwrap_or_else(|| default_path(kind));
    let path = std::fs::canonicalize(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let scene = Scene::new(&path)?;
    let style_path = std::env::var_os("VANTARE_WORKSHOP_STYLES").map_or_else(
        || PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/styles")),
        PathBuf::from,
    );
    let style = LiveStyle::new(
        style_path.join("standings.json"),
        crate::standings::style::Style::compiled(),
        crate::standings::style::Style::from_json,
    );
    let vantare_style = LiveStyle::new(
        style_path.join("vantare.json"),
        crate::vantare::style::Style::compiled(),
        crate::vantare::style::Style::from_json,
    );
    let scenes = scenes(&scene.path)?;
    let scene_labels = scenes
        .iter()
        .map(|p| Scene::new(p).map(|s| s.label))
        .collect::<Result<Vec<_>, _>>()?;

    let failure = std::rc::Rc::new(std::cell::RefCell::new(None));
    let result = failure.clone();
    gpui_platform::application().run(move |cx: &mut App| {
        if !app::init(cx) {
            *failure.borrow_mut() = Some("no se pudieron registrar las fuentes".into());
            return;
        }
        // Ocupa todo el monitor principal (macOS la ajusta bajo la barra de menús).
        let window_bounds = cx
            .primary_display()
            .map(|display| gpui::WindowBounds::Windowed(display.bounds()));
        let options = WindowOptions {
            titlebar: Some(gpui::TitlebarOptions {
                title: Some("Vantare — Workshop en vivo".into()),
                ..Default::default()
            }),
            window_bounds,
            focus: false,
            ..Default::default()
        };
        let opened = cx.open_window(options, |window, cx| {
            cx.new(|cx: &mut Context<Workshop>| {
                let focus = cx.focus_handle();
                focus.focus(window, cx);
                let overlay = cx.new(|cx| {
                    let mut overlay = Overlay::new(kind, Preferences::default());
                    overlay.standings_style(style.value.clone(), cx);
                    overlay.vantare_style(vantare_style.value.clone(), cx);
                    for snapshot in &scene.snapshots {
                        overlay.ingest(snapshot, cx);
                    }
                    overlay
                });
                let mut workshop = Workshop {
                    style,
                    vantare_style,
                    kind,
                    settings: default_settings(kind),
                    prefs: Preferences::default(),
                    comparison: None,
                    open: None,
                    background: "grid".into(),
                    scale: 1.0,
                    study: "default".into(),
                    dimensions: None,
                    surface: "studio".into(),
                    preset: "1080p".into(),
                    comparison_surface: "desktop".into(),
                    source: None,
                    source_error: false,
                    session: None,
                    in_pits: None,
                    playback: Playback::new(Instant::now()),
                    scene,
                    scenes,
                    scene_labels,
                    player_position: None,
                    name_mode: "full".into(),
                    numeric: None,
                    slider_bounds: None,
                    dragging: false,
                    fit: 1.0,
                    panel_hidden: false,
                    widget_bounds: None,
                    column_drag: None,
                    column_hover: None,
                    overlay,
                    state_file,
                    state_error,
                    focus,
                };
                if let Some(saved) = saved {
                    workshop.settings = saved.settings.normalized();
                    workshop.background = saved.background;
                    workshop.scale = saved.scale;
                    workshop.dimensions = saved.dimensions;
                    workshop.study = saved.study;
                    workshop.preset = saved.preset;
                    workshop.surface = saved.surface;
                    workshop.player_position = saved.player_position;
                    workshop.name_mode = saved.name_mode;
                    workshop.playback.frame = saved.frame.min(workshop.scene.snapshots.len() - 1);
                    workshop.prefs.language = if saved.language == "en" {
                        vantare_domain::format::Language::En
                    } else {
                        vantare_domain::format::Language::Es
                    };
                    if let Some(surface) = saved.comparison {
                        workshop.comparison_surface = surface;
                        workshop.comparison = Some(workshop.overlay.clone());
                    }
                }
                workshop.replay(cx);
                if workshop.state_error.is_none() {
                    workshop.persist();
                }
                cx.spawn(async move |this, cx| {
                    loop {
                        cx.background_executor()
                            .timer(Duration::from_millis(16))
                            .await;
                        if this
                            .update(cx, |this, cx| {
                                this.tick(Instant::now(), cx);
                                // `|` para sondear ambos ficheros en cada vuelta.
                                if this.style.poll() | this.vantare_style.poll() {
                                    this.replay(cx);
                                    cx.notify();
                                }
                                if this.scene.poll() {
                                    if this.scene.error.is_none() {
                                        this.playback.frame =
                                            this.playback.frame.min(this.scene.snapshots.len() - 1);
                                        this.replay(cx);
                                    }
                                    cx.notify();
                                }
                            })
                            .is_err()
                        {
                            break;
                        }
                    }
                })
                .detach();
                workshop
            })
        });
        if let Err(error) = opened {
            *failure.borrow_mut() = Some(format!("abrir Workshop: {error}"));
            cx.quit();
        } else {
            eprintln!("Workshop en vivo: ventana abierta · {}", kind.name());
        }
        cx.on_window_closed(|cx, _| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
        // Sin activar la app: se abre detrás para no robar el foco al editor.
        // `VANTARE_WORKSHOP_ACTIVATE=1` la trae al frente (capturas de evidencia).
        if std::env::var_os("VANTARE_WORKSHOP_ACTIVATE").is_some() {
            cx.activate(true);
        }
    });
    match result.borrow_mut().take() {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workshop_relative_uses_react_columns_and_compact_height() {
        let settings = system_defaults(Kind::Relative, crate::standings::DesignSystem::Eficiencia);
        let Settings::Relative(relative) = &settings else {
            panic!("Relative");
        };
        let columns = relative.columns.as_ref().expect("columns");
        assert_eq!(
            columns
                .iter()
                .map(|c| c.metric_id.as_str())
                .collect::<Vec<_>>(),
            ["position", "class", "driverName", "gap"]
        );
        let mut overlay = Overlay::configured(&settings, Preferences::default());
        let production = overlay.wanted_size();
        overlay.workshop_layout();
        let preview = preview_size(true, overlay.wanted_size());
        assert_eq!(preview.0, 470.0);
        assert!((preview.1 - 277.0).abs() < 0.01);
        assert_eq!(production, crate::relative::SIZE);
        for kind in Kind::ALL {
            Scene::new(&default_path(*kind)).expect("every selector opens a valid scene");
        }
    }

    #[test]
    fn playback_honors_pause_phase_duration_end_and_loop_without_skipping_on_resume() {
        let start = Instant::now();
        let mut playback = Playback::new(start);
        assert_eq!(
            playback.advance(start + Duration::from_secs(10), 1200, 3),
            None
        );
        assert_eq!(playback.frame, 0);
        playback.playing = true;
        assert_eq!(
            playback.advance(start + Duration::from_millis(10_500), 1200, 3),
            None
        );
        assert_eq!(
            playback.advance(start + Duration::from_millis(11_200), 1200, 3),
            Some(false)
        );
        assert_eq!(playback.frame, 1);
        assert_eq!(
            playback.advance(start + Duration::from_mins(2), 1200, 3),
            Some(false)
        );
        assert_eq!(playback.frame, 2);
        assert!(!playback.playing);
        playback.playing = true;
        playback.looping = true;
        assert_eq!(
            playback.advance(start + Duration::from_millis(121_200), 1200, 3),
            Some(true)
        );
        assert_eq!(playback.frame, 0);
        assert!(playback.playing);
    }

    #[test]
    fn react_scenes_validate_and_keep_keyframes_names_pits_and_best_laps() {
        let initial = std::fs::canonicalize(default_path(Kind::Standings)).expect("fixture");
        let catalog = scenes(&initial).expect("catálogo");
        let mut count = 0;
        for path in &catalog {
            let scene = Scene::new(path).expect("escena validada por IPC");
            assert!(!scene.snapshots.is_empty());
            for snapshot in &scene.snapshots {
                let ids: std::collections::HashSet<_> =
                    snapshot.state.cars.iter().map(|car| car.id).collect();
                assert_eq!(
                    ids.len(),
                    snapshot.state.cars.len(),
                    "IDs únicos en {}",
                    path.display()
                );
            }
            if path.to_string_lossy().ends_with(".scene.json") {
                count += 1;
                assert_eq!(scene.captions.len(), scene.snapshots.len());
                assert!(
                    scene
                        .snapshots
                        .windows(2)
                        .all(|p| p[0].sequence < p[1].sequence)
                );
            }
        }
        // 43 demostraciones React + ocho escenas Vantare r10b (#1497).
        assert_eq!(count, 51);
        let default = Scene::new(&initial).expect("Standings default");
        assert_eq!(
            default.snapshots[0].state.cars[0].last_lap_s.current(),
            Some(&109.667)
        );
        let relative = Scene::new(&Path::new(FIXTURES).join("relative-default.scene.json"))
            .expect("Relative default");
        let ahead = relative.snapshots[0]
            .state
            .cars
            .iter()
            .find(|car| car.driver.name == "Antonio Giovinazzi")
            .expect("piloto delante");
        assert_eq!(ahead.relative_s.current(), Some(&4.2));
        let nico = relative.snapshots[0]
            .state
            .cars
            .iter()
            .find(|car| car.driver.name == "Nico Pino")
            .expect("Nico Pino");
        assert_eq!(nico.class.as_ref().expect("clase declarada").name, "lmp2");
        let scene =
            Scene::new(&Path::new(FIXTURES).join("standings-functional-position.scene.json"))
                .expect("posición");
        for car in &scene.snapshots[0].state.cars {
            for frame in &scene.snapshots {
                if let Some(later) = frame.state.cars.iter().find(|c| c.id == car.id) {
                    assert_eq!(
                        later.driver.name, car.driver.name,
                        "identidad estable al adelantar"
                    );
                }
            }
        }
        let positions = |snapshot: &Snapshot| {
            snapshot
                .state
                .cars
                .iter()
                .map(|c| (c.driver.name.clone(), c.position))
                .collect::<Vec<_>>()
        };
        assert_ne!(
            positions(&scene.snapshots[0]),
            positions(&scene.snapshots[2])
        );
        let pit = Scene::new(&Path::new(FIXTURES).join("standings-functional-pit.scene.json"))
            .expect("boxes");
        assert!(pit.snapshots.windows(2).any(|p| {
            p[0].state
                .cars
                .iter()
                .zip(&p[1].state.cars)
                .any(|(a, b)| a.in_pits != b.in_pits)
        }));
        let best =
            Scene::new(&Path::new(FIXTURES).join("standings-functional-personal-best.scene.json"))
                .expect("mejor vuelta");
        assert!(best.snapshots.windows(2).any(|p| {
            p[0].state
                .cars
                .iter()
                .zip(&p[1].state.cars)
                .any(|(a, b)| a.best_lap_s != b.best_lap_s)
        }));
    }

    #[test]
    fn scene_document_reload_keeps_valid_phases_after_partial_write_and_recovers() {
        let path = std::env::temp_dir().join(format!(
            "vantare-workshop-scene-{}.scene.json",
            std::process::id()
        ));
        let original = include_str!("../fixtures/standings-functional-position.scene.json");
        std::fs::write(&path, original).expect("escena");
        let mut scene = Scene::new(&path).expect("escena");
        let snapshots = scene.snapshots.clone();
        std::fs::write(&path, "{").expect("escritura incompleta");
        scene.reload();
        assert!(scene.error.is_some());
        assert_eq!(scene.snapshots, snapshots);
        std::fs::write(&path, original).expect("recuperar");
        scene.reload();
        assert!(scene.error.is_none());
        assert_eq!(scene.snapshots, snapshots);
        std::fs::remove_file(&path).expect("retirar fixture temporal");
    }

    #[test]
    fn style_reload_preserves_last_valid_values_and_recovers() {
        let dir = std::env::temp_dir().join(format!("vantare-style-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("directorio");
        let path = dir.join("standings.json");
        let original = include_str!("../styles/standings.json");
        std::fs::write(&path, original).expect("estilo");
        let mut file = LiveStyle::new(
            path.clone(),
            crate::standings::style::Style::compiled(),
            crate::standings::style::Style::from_json,
        );
        assert!(!file.poll());
        let previous = file.value.clone();
        std::fs::write(&path, "{").expect("escritura parcial");
        file.modified = None;
        assert!(file.poll());
        assert!(file.error.is_some());
        assert_eq!(file.value, previous);
        std::fs::remove_file(&path).expect("retirar");
        assert!(file.poll());
        assert_eq!(file.value, previous);
        let mut changed = serde_json::to_value(&*previous).expect("JSON");
        changed["colors"]["panel"] = serde_json::json!("#123456");
        changed["geometry"]["row_height"] = serde_json::json!(40);
        std::fs::write(&path, changed.to_string()).expect("guardar");
        assert!(file.poll());
        assert!(file.error.is_none());
        assert_eq!(file.value.colors.panel.0, 0x123456);
        assert_eq!(file.value.geometry.row_height, 40.0);
        std::fs::remove_dir_all(dir).expect("limpiar");
    }

    #[test]
    fn vantare_style_reloads_live_and_keeps_the_last_valid_one() {
        let dir = std::env::temp_dir().join(format!("vantare-style-v-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("directorio");
        let path = dir.join("vantare.json");
        std::fs::write(&path, include_str!("../styles/vantare.json")).expect("estilo");
        let mut file = LiveStyle::new(
            path.clone(),
            crate::vantare::style::Style::compiled(),
            crate::vantare::style::Style::from_json,
        );
        assert!(file.error.is_none());
        let mut changed = serde_json::to_value(&*file.value).expect("JSON");
        changed["geometry"]["row_height"] = serde_json::json!(30);
        std::fs::write(&path, changed.to_string()).expect("guardar");
        file.modified = None;
        assert!(file.poll());
        assert_eq!(file.value.geometry.row_height, 30.0);
        std::fs::write(&path, "{").expect("escritura parcial");
        file.modified = None;
        assert!(file.poll());
        assert!(file.error.is_some());
        assert_eq!(file.value.geometry.row_height, 30.0);
        std::fs::remove_dir_all(dir).expect("limpiar");
    }

    #[test]
    fn scenes_accept_one_or_many_valid_dto_photos_in_order() {
        let json = include_str!("../fixtures/pedals.snapshot.json");
        let single = snapshots_from_json(json).expect("foto");
        let mut second = single[0].clone();
        second.sequence += 1;
        let sequence = format!(
            "[{json},{}]",
            vantare_ipc::snapshot_to_json(&second).expect("DTO")
        );
        let photos = snapshots_from_json(&sequence).expect("secuencia");
        assert_eq!(photos, vec![single[0].clone(), second]);
        for invalid in ["[]", "[{}]", "[null]", "{}"] {
            assert!(snapshots_from_json(invalid).is_err());
        }
        assert!(snapshots_from_json(&format!("[{json},{{}}]")).is_err());
    }

    #[test]
    fn reload_keeps_last_valid_snapshot_and_recovers_after_invalid_or_missing_json() {
        let dir =
            std::env::temp_dir().join(format!("vantare-workshop-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("directorio temporal");
        let path = dir.join("scene.snapshot.json");
        let valid = include_str!("../fixtures/pedals.snapshot.json");
        std::fs::write(&path, valid).expect("escena");
        let mut scene = Scene::new(&path).expect("cargar");
        let previous = scene.snapshots.clone();
        assert!(!scene.poll());
        std::fs::write(&path, "{").expect("JSON inválido");
        // Fuerza mtime anterior sin sleeps: el test no depende de la resolución del FS.
        scene.modified = None;
        assert!(scene.poll());
        assert!(scene.error.is_some());
        assert_eq!(scene.snapshots, previous);
        std::fs::remove_file(&path).expect("borrar escena");
        assert!(scene.poll());
        assert!(scene.error.is_some());
        std::fs::write(&path, valid).expect("restaurar");
        assert!(scene.poll());
        assert!(scene.error.is_none());
        assert_eq!(scene.snapshots, previous);
        scene.select(Path::new(FIXTURES).join("radar.snapshot.json"));
        assert_ne!(scene.snapshots, previous);
        assert!(scene.error.is_none());
        scene.select(path.with_file_name("missing.json"));
        assert!(scene.error.is_some());
        std::fs::remove_dir_all(dir).expect("limpiar");
    }
}
