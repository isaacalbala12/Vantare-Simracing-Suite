//! Editor espacial sobre el documento y el renderer compartidos.
mod examples;
mod scenes;
use crate::{
    document::Editor,
    inspector::{self, Control, Tab},
    orbit::{
        self, Checkbox, Checked, Choice, ChoiceChanged, ChoiceKind, NumberChanged, NumberControl,
        NumberFinished, NumberKind, NumberRange, OptionItem, button,
    },
};
use gpui::{
    Context, Entity, EventEmitter, FocusHandle, IntoElement, MouseButton, MouseMoveEvent,
    PathBuilder, Pixels, Point, Render, SharedString, Window, div, linear_color_stop,
    linear_gradient, prelude::*, px, rgb,
};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use vantare_domain::{Snapshot, format::Preferences};
use vantare_ui::{
    Kind, Overlay, Settings,
    layout::{CanvasResolution, Instance, Layout},
};

const STUDIO_PREVIEW_SCALE: f32 = 700.0 / 1920.0;
const ZOOM_STEPS: [Option<u16>; 6] = [None, Some(50), Some(75), Some(100), Some(125), Some(150)];
const AUTO_SAVED: &str = "Guardado";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DocumentKey {
    History(bool),
    Duplicate,
    Remove,
    Save,
}

fn document_key(key: &gpui::Keystroke) -> Option<DocumentKey> {
    let modifiers = key.modifiers;
    if modifiers.alt || modifiers.function {
        return None;
    }
    if modifiers.control || modifiers.platform {
        match (key.key.to_ascii_lowercase().as_str(), modifiers.shift) {
            ("z", redo) => Some(DocumentKey::History(redo)),
            ("y", false) => Some(DocumentKey::History(true)),
            ("d", false) => Some(DocumentKey::Duplicate),
            ("s", false) => Some(DocumentKey::Save),
            _ => None,
        }
    } else if !modifiers.shift && key.key == "delete" {
        Some(DocumentKey::Remove)
    } else {
        None
    }
}

/// Un paso inmediato, pausa inicial y repetición a 1/4/8 px cada 30 ms.
fn held_nudge_distance(elapsed: Duration, shift: bool) -> f32 {
    let ticks = elapsed.as_millis().saturating_sub(300) / 30;
    let pixels =
        1 + ticks.min(20) + ticks.saturating_sub(20).min(30) * 4 + ticks.saturating_sub(50) * 8;
    #[allow(clippy::cast_precision_loss)] // Acotado al límite de coordenadas del documento.
    let distance = pixels.min(100_000) as f32;
    distance * if shift { 8.0 } else { 1.0 }
}

struct HeldNudge {
    frame: Entity<CanvasFrame>,
    origin: (f32, f32),
    direction: (i8, i8),
    shift: bool,
    started: Instant,
}

fn keyboard_nudge(key: &gpui::Keystroke) -> Option<((i8, i8), bool)> {
    if key.modifiers.control
        || key.modifiers.platform
        || key.modifiers.alt
        || key.modifiers.function
    {
        return None;
    }
    let direction = match key.key.as_str() {
        "left" => (-1, 0),
        "right" => (1, 0),
        "up" => (0, -1),
        "down" => (0, 1),
        _ => return None,
    };
    Some((direction, key.modifiers.shift))
}

fn unavailable_scenario(
    index: usize,
    label: &'static str,
    reason: &'static str,
    cx: &gpui::App,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(("studio-scenario", index))
        .role(gpui::Role::Group)
        .aria_label(format!("{label} · Próximamente"))
        .aria_description(reason)
        .h(px(30.0))
        .px(px(8.0))
        .flex_none()
        .flex()
        .items_center()
        .opacity(orbit::DISABLED)
        .child(orbit::text(label, 12.0, 650, orbit::ink_2(cx), cx))
        .tooltip(move |_, cx| cx.new(|_| orbit::Tooltip(reason.to_owned())).into())
}

fn widget_lock(
    access: Option<crate::shell::navigation::Access>,
    kind: Kind,
) -> Option<&'static str> {
    access?.widget_lock(kind) // Workshop y capturas conservan su excepción explícita.
}

fn catalog_options(access: Option<crate::shell::navigation::Access>) -> Vec<OptionItem> {
    Kind::ALL
        .iter()
        .map(|&kind| match widget_lock(access, kind) {
            Some(reason) => OptionItem::locked(kind.label(), reason),
            None => OptionItem::new(kind.label()),
        })
        .collect()
}

const CANVAS_PRESETS: [CanvasResolution; 6] = [
    CanvasResolution {
        width: 1920.0,
        height: 1080.0,
    },
    CanvasResolution {
        width: 2520.0,
        height: 1080.0,
    },
    CanvasResolution {
        width: 1920.0,
        height: 1200.0,
    },
    CanvasResolution {
        width: 3840.0,
        height: 1080.0,
    },
    CanvasResolution {
        width: 2560.0,
        height: 1440.0,
    },
    CanvasResolution {
        width: 3840.0,
        height: 2160.0,
    },
];

fn fitted_scale(width: f32, height: f32, resolution: CanvasResolution) -> Option<f32> {
    if !width.is_finite() || !height.is_finite() || !resolution.valid() {
        return None;
    }
    let scale = (width / resolution.width).min(height / resolution.height);
    (scale > 0.0).then_some(scale)
}

/// El zoom mayor que el viewport comienza en su origen para poder desplazarse.
fn preview_origin(width: f32, height: f32, scale: f32, resolution: CanvasResolution) -> (f32, f32) {
    (
        ((width - resolution.width * scale) / 2.0).max(0.0),
        ((height - resolution.height * scale) / 2.0).max(0.0),
    )
}

fn selection_caption_top(client_y: f32, scale: f32) -> f32 {
    (-22.0_f32).max(-client_y * scale)
}

/// El documento conserva posiciones globales; el lienzo muestra el monitor de sus overlays.
fn overlay_monitor(
    layout: &Layout,
    displays: &[(f32, f32, f32, f32)],
    fallback: (f32, f32, f32, f32),
) -> (f32, f32, f32, f32) {
    layout
        .instances
        .iter()
        .filter(|item| item.visible)
        .find_map(|item| {
            displays.iter().copied().find(|&(x, y, width, height)| {
                item.x >= x && item.x < x + width && item.y >= y && item.y < y + height
            })
        })
        .unwrap_or(fallback)
}

fn client_monitor(layout: &Layout, cx: &gpui::App) -> (f32, f32, f32, f32) {
    let bounds = |bounds: gpui::Bounds<Pixels>| {
        (
            f32::from(bounds.origin.x),
            f32::from(bounds.origin.y),
            f32::from(bounds.size.width),
            f32::from(bounds.size.height),
        )
    };
    let fallback = cx
        .primary_display()
        .as_ref()
        .map_or((0.0, 0.0, 1920.0, 1080.0), |display| {
            bounds(display.bounds())
        });
    overlay_monitor(
        layout,
        &cx.displays()
            .iter()
            .map(|display| bounds(display.bounds()))
            .collect::<Vec<_>>(),
        fallback,
    )
}

#[cfg(any(test, feature = "parity-capture"))]
fn demo_standings_settings() -> Settings {
    use vantare_ui::standings::{
        Settings as StandingsSettings,
        options::{ColumnSetting, Format},
    };
    // La escena Wails reserva 340×420 en x=1560. Eficiencia usa filas de 30 px:
    // estas opciones admitidas producen 338×424 sin cambiar el renderer ni sus defaults.
    Settings::Standings(StandingsSettings {
        row_count: 12,
        columns: Some(
            ["position", "driverNumber", "driverName", "gap", "lastLap"]
                .into_iter()
                .map(|metric| ColumnSetting {
                    id: metric.into(),
                    metric_id: metric.into(),
                    format: if metric == "driverName" {
                        Format {
                            mode: "truncate".into(),
                            max_chars: Some(11),
                            ..Format::default()
                        }
                    } else {
                        Format::default()
                    },
                    ..ColumnSetting::default()
                })
                .collect(),
        ),
        ..StandingsSettings::eficiencia()
    })
}

#[cfg(any(test, feature = "parity-capture"))]
fn demo_content_scale(kind: Kind, width: f32) -> f32 {
    // Ancho lógico de delta en hub-profile-mock-state.ts. Mantiene su aspecto.
    if kind == Kind::Delta {
        400.0 / width
    } else {
        1.0
    }
}

#[cfg(any(test, feature = "parity-capture"))]
const DEMO_ITEMS: [(Kind, f32, f32); 4] = [
    (Kind::Standings, 48.0, 62.0),
    (Kind::Delta, 760.0, 40.0),
    (Kind::Relative, 700.0, 480.0),
    (Kind::FuelStrategy, 1180.0, 62.0),
];
#[cfg(any(test, feature = "parity-capture"))]
fn capture_settings(kind: Kind) -> Settings {
    let mut settings = if kind == Kind::Standings {
        demo_standings_settings()
    } else {
        Settings::default_for(kind)
    };
    if let Settings::Standings(settings) = &mut settings {
        settings.row_count = 8;
    }
    settings
}

// El peso ya está en las fuentes Inter estáticas del kit.
fn text(
    content: impl Into<SharedString>,
    size: f32,
    weight: u16,
    color: u32,
    cx: &gpui::App,
) -> gpui::Div {
    orbit::text(content, size, weight.min(800), color, cx)
        .font_weight(orbit::face_weight(weight.min(800), cx))
}

fn toggle_visibility(editor: &mut Editor, id: &str) -> Result<(), String> {
    let selected = editor.selected.replace(id.to_owned());
    let result = editor.edit_selected(|item| item.visible = !item.visible);
    editor.selected = selected;
    result
}

fn visibility_icon(visible: bool) -> impl IntoElement {
    gpui::canvas(
        |_, _, _| (),
        move |bounds, (), window, cx| {
            let at = |x: f32, y: f32| {
                gpui::point(
                    bounds.origin.x + px(x * 15.0 / 16.0),
                    bounds.origin.y + px(y * 15.0 / 16.0),
                )
            };
            let mut eye = PathBuilder::stroke(px(1.4));
            eye.move_to(at(1.8, 8.0));
            eye.cubic_bezier_to(at(14.2, 8.0), at(4.0, 2.7), at(12.0, 2.7));
            eye.cubic_bezier_to(at(1.8, 8.0), at(12.0, 13.3), at(4.0, 13.3));
            eye.close();
            if !visible {
                eye.move_to(at(3.0, 13.0));
                eye.line_to(at(13.0, 3.0));
            }
            if let Ok(path) = eye.build() {
                window.paint_path(path, rgb(orbit::ink_3(cx)));
            }
            window.paint_quad(gpui::quad(
                gpui::Bounds::new(at(6.2, 6.2), gpui::size(px(3.4), px(3.4))),
                gpui::Corners::all(px(1.7)),
                rgb(orbit::ink_3(cx)),
                gpui::Edges::default(),
                gpui::transparent_black(),
                gpui::BorderStyle::default(),
            ));
        },
    )
    .size(px(15.0))
}

fn example_snapshots() -> Result<Vec<(Kind, Snapshot)>, String> {
    [
        (
            Kind::Standings,
            include_str!("../../ui/fixtures/standings.snapshot.json"),
        ),
        (
            Kind::Radar,
            include_str!("../../ui/fixtures/radar.snapshot.json"),
        ),
        (
            Kind::Pedals,
            include_str!("../../ui/fixtures/pedals.snapshot.json"),
        ),
        (
            Kind::Delta,
            include_str!("../../ui/fixtures/delta.snapshot.json"),
        ),
        (
            Kind::CarDamageVisual,
            include_str!("../../ui/fixtures/car-damage-visual.snapshot.json"),
        ),
        (
            Kind::InputTelemetry,
            include_str!("../../ui/fixtures/input-telemetry.snapshot.json"),
        ),
        (
            Kind::MulticlassRelative,
            include_str!("../../ui/fixtures/multiclass-relative.snapshot.json"),
        ),
        (
            Kind::BroadcastTower,
            include_str!("../../ui/fixtures/broadcast-tower.snapshot.json"),
        ),
        (
            Kind::DeltaTrace,
            include_str!("../../ui/fixtures/delta-trace.snapshot.json"),
        ),
        (
            Kind::TrackMap,
            include_str!("../../ui/fixtures/track-map.snapshot.json"),
        ),
        (
            Kind::TrackWeather,
            include_str!("../../ui/fixtures/track-weather.snapshot.json"),
        ),
        (
            Kind::CarDamageNumbers,
            include_str!("../../ui/fixtures/car-damage-numbers.snapshot.json"),
        ),
        (
            Kind::HeadToHead,
            include_str!("../../ui/fixtures/head-to-head.snapshot.json"),
        ),
        (
            Kind::FuelStrategy,
            include_str!("../../ui/fixtures/fuel-strategy.snapshot.json"),
        ),
        (
            Kind::PedalsTelemetry,
            include_str!("../../ui/fixtures/pedals-telemetry.snapshot.json"),
        ),
        (
            Kind::Relative,
            include_str!("../../ui/fixtures/relative.snapshot.json"),
        ),
        (
            Kind::RacingFlags,
            include_str!("../../ui/fixtures/racing-flags.snapshot.json"),
        ),
        (
            Kind::FastestLap,
            include_str!("../../ui/fixtures/fastest-lap.snapshot.json"),
        ),
    ]
    .into_iter()
    .map(|(kind, text)| {
        match kind {
            Kind::Standings | Kind::Relative | Kind::MulticlassRelative => examples::tables(),
            Kind::Delta => {
                examples::snapshot(include_str!("../../ui/fixtures/delta-vantare.scene.json"))
            }
            Kind::FuelStrategy => {
                examples::snapshot(include_str!("../../ui/fixtures/fuel-vantare.scene.json"))
            }
            _ => vantare_ipc::snapshot_from_saved_json(text).map_err(|error| error.to_string()),
        }
        .map(|snapshot| (kind, snapshot))
        .map_err(|error| format!("Ejemplo {}: {error}", kind.name()))
    })
    .collect()
}

fn preview_snapshot<'a>(
    example: bool,
    examples: &'a [(Kind, Snapshot)],
    live: &'a Snapshot,
    kind: Kind,
) -> &'a Snapshot {
    if example {
        &examples
            .iter()
            .find(|(candidate, _)| *candidate == kind)
            .expect("todos los widgets tienen un ejemplo validado")
            .1
    } else {
        live
    }
}

pub struct Prepared {
    photos: Vec<scenes::Photo>,
    editor: Editor,
    examples: Vec<(Kind, Snapshot)>,
}

/// Escena QA `studio-oculto`: sin selección (documento vacío sin --demo) es un
/// no-op explícito en lugar de fallar antes de inicializar el editor.
#[cfg(any(test, feature = "parity-capture"))]
fn hide_selected_for_capture(editor: &mut Editor) -> Result<(), String> {
    if editor.selected.is_some() {
        editor.edit_selected(|item| item.visible = false)?;
    }
    Ok(())
}
impl Prepared {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        #[cfg(feature = "parity-capture")]
        let mut editor = Editor::open(path)?;
        #[cfg(not(feature = "parity-capture"))]
        let editor = Editor::open(path)?;
        #[cfg(feature = "parity-capture")]
        if studio_demo_capture() && editor.layout().instances.is_empty() {
            // Escena QA del rediseño: solo --capture studio-base --demo; usa los Settings y Overlay productivos.
            for (kind, x, y) in DEMO_ITEMS {
                editor.add(kind)?;
                editor.edit_selected(|item| {
                    item.x = x;
                    item.y = y;
                    item.settings = capture_settings(kind);
                })?;
            }
            editor.selected = editor
                .layout()
                .instances
                .first()
                .map(|item| item.id.clone());
        }
        #[cfg(feature = "parity-capture")]
        if let Some(name) = capture_name() {
            if name == "studio-vacio" {
                while !editor.layout().instances.is_empty() {
                    editor.selected = editor
                        .layout()
                        .instances
                        .first()
                        .map(|item| item.id.clone());
                    editor.remove()?;
                }
            } else if name == "studio-oculto" {
                hide_selected_for_capture(&mut editor)?;
            } else if name == "inicio-opacidad" {
                let ids: Vec<_> = editor
                    .layout()
                    .instances
                    .iter()
                    .map(|item| item.id.clone())
                    .collect();
                for (index, id) in ids.into_iter().enumerate() {
                    editor.selected = Some(id);
                    editor.edit_selected(|item| {
                        item.opacity = [0.0, 0.25, 1.0, 1.0][index % 4];
                        item.x = 200.0;
                        item.y = 100.0;
                        if index == 3 {
                            item.visible = false;
                        }
                    })?;
                }
            }
            if name == "studio-sin-seleccion" {
                editor.selected = None;
            }
        }
        Ok(Self {
            editor,
            examples: example_snapshots()?,
            photos: scenes::load()?,
        })
    }
}

#[cfg(feature = "parity-capture")]
fn capture_name() -> Option<String> {
    std::env::args()
        .collect::<Vec<_>>()
        .windows(2)
        .find(|pair| pair[0] == "--capture")
        .map(|pair| pair[1].clone())
}
#[cfg(feature = "parity-capture")]
fn studio_demo_capture() -> bool {
    let args: Vec<_> = std::env::args().collect();
    args.iter().any(|arg| arg == "--demo")
        && args.windows(2).any(|pair| {
            pair[0] == "--capture"
                && matches!(
                    pair[1].as_str(),
                    name if name.starts_with("studio-") || matches!(name, "inicio-base" | "inicio-error" | "inicio-opacidad" | "inicio-nombre-largo" | "inicio-sidebar" | "inicio-sidebar-sin-carril" | "inicio-sin-carril")
                )
        })
}
pub struct Studio {
    frequency_focus: [gpui::FocusHandle; 9],
    adapt: orbit::Adapt,
    access: Option<crate::shell::navigation::Access>,
    editor: Editor,
    sidebar: Entity<StudioSidebar>,
    frames: Vec<(String, Entity<CanvasFrame>)>,
    snapshot: Snapshot,
    examples: Vec<(Kind, Snapshot)>,
    example: bool,
    photos: Vec<scenes::Photo>,
    real_photo: Option<usize>,
    photo_choice: Option<Entity<Choice>>,
    resolution_choice: Option<Entity<Choice>>,
    monitor: (f32, f32, f32, f32),
    status: Result<(), String>,
    drag: Option<Entity<CanvasFrame>>,
    opacity_preview: Option<(String, f32)>,
    held_nudge: Option<HeldNudge>,
    nudge_task: Option<gpui::Task<()>>,
    focus: FocusHandle,
    catalog: Option<Entity<Choice>>,
    catalog_open: bool,
    search: Entity<orbit::Input>,
    color: Option<Entity<orbit::Input>>,
    inspector_selection: Option<String>,
    size_fields: Vec<(&'static str, Entity<NumberControl>)>,
    fields: Vec<(Tab, &'static str, gpui::AnyView, bool)>,
    demo_profile: Option<crate::demo::DemoProfile>,
    fit_scale: f32,
    canvas_size: (f32, f32),
    zoom_step: usize,
}
/// La shell enlaza esta columna; Studio conserva el documento y sus interacciones.
pub(crate) struct StudioSidebar {
    studio: gpui::WeakEntity<Studio>,
}
impl Render for StudioSidebar {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        match self.studio.update(cx, |studio, cx| {
            studio.init_controls(window, cx);
            div()
                .h_full()
                .min_h_0()
                .flex()
                .flex_col()
                .min_w_0()
                .gap(px(0.0))
                .on_key_down(cx.listener(Studio::handle_key))
                .child(orbit::scroll_fade(
                    div()
                        .id("studio-inspector-scroll")
                        .flex_1()
                        .min_h_0()
                        .overflow_y_scroll()
                        .child(studio.inspector(cx)),
                    orbit::skin(cx).sidebar.to,
                ))
                .child(orbit::inspector_section("OBS", "v-rec", cx).child(Studio::obs_settings(cx)))
        }) {
            Ok(column) => column,
            Err(_) => orbit::empty_state("Studio no disponible", "El editor se ha cerrado.", cx),
        }
    }
}
struct Drag {
    pointer: (f32, f32),
    origin: (f32, f32),
    preview: (f32, f32),
    scale: f32,
}
impl Drag {
    fn update(&mut self, pointer: (f32, f32)) -> bool {
        if !pointer.0.is_finite()
            || !pointer.1.is_finite()
            || !self.scale.is_finite()
            || self.scale <= 0.0
        {
            return false;
        }
        // El umbral está en píxeles de pantalla: seleccionar con ruido de ratón
        // no debe mover el documento, ni siquiera con el lienzo reducido.
        if self.preview == self.origin
            && (pointer.0 - self.pointer.0).hypot(pointer.1 - self.pointer.1) < 3.0
        {
            return false;
        }
        self.preview = (
            (self.origin.0 + (pointer.0 - self.pointer.0) / self.scale)
                .clamp(-100_000.0, 100_000.0),
            (self.origin.1 + (pointer.1 - self.pointer.1) / self.scale)
                .clamp(-100_000.0, 100_000.0),
        );
        true
    }
}
struct Resize {
    pointer: (f32, f32),
    origin: (f32, f32),
    size: vantare_ui::geometry::Size,
    preview: ((f32, f32), vantare_ui::geometry::Size),
    scale: f32,
    handle: vantare_ui::geometry::Handle,
    locked: bool,
}
impl Resize {
    fn update(&mut self, pointer: (f32, f32)) -> bool {
        if !self.scale.is_finite() || self.scale <= 0.0 {
            return false;
        }
        let Some(next) = vantare_ui::geometry::resize(
            self.origin,
            self.size,
            self.handle,
            (
                (pointer.0 - self.pointer.0) / self.scale,
                (pointer.1 - self.pointer.1) / self.scale,
            ),
            self.locked,
        ) else {
            return false;
        };
        self.preview = next;
        true
    }
}
struct Started(Point<Pixels>, Option<vantare_ui::geometry::Handle>);
/// En GPUI la preview pertenece a una entidad de marco, no al documento ni al widget.
/// Mover invalida solo esta entidad; Overlay conserva su renderer y su foto durante el gesto.
struct CanvasFrame {
    item: Instance,
    lock: Option<&'static str>,
    renderer: Entity<Overlay>,
    preview_scale: f32,
    client_origin: (f32, f32),
    content_scale: f32,
    selected: bool,
    focus: FocusHandle,
    drag: Option<Drag>,
    resize: Option<Resize>,
    opacity_preview: Option<f32>,
    nudge_position: Option<(f32, f32)>,
}
impl EventEmitter<Started> for CanvasFrame {}
impl Render for CanvasFrame {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.element(cx)
    }
}
impl CanvasFrame {
    fn element(&mut self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let (x, y) = self
            .drag
            .as_ref()
            .map_or((self.item.x, self.item.y), |drag| drag.preview);
        let (x, y) = self.resize.as_ref().map_or((x, y), |r| r.preview.0);
        let (x, y) = self.nudge_position.unwrap_or((x, y));
        let dimensions = self.renderer.read(cx).frame_size();
        div()
            .id("widget-frame")
            .absolute()
            .left(px((x - self.client_origin.0) * self.preview_scale))
            .top(px((y - self.client_origin.1) * self.preview_scale))
            .w(px(dimensions.0 * self.preview_scale * self.content_scale))
            .h(px(dimensions.1 * self.preview_scale * self.content_scale))
            .when(self.selected, |frame| {
                frame.child(Self::selection_outline(cx))
            })
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &gpui::MouseDownEvent, window, cx| {
                    this.focus.focus(window, cx);
                    cx.emit(Started(event.position, None));
                }),
            )
            .when(self.lock.is_none(), |frame| {
                frame.child(
                    div()
                        .size_full()
                        .opacity(self.opacity_preview.unwrap_or(self.item.opacity))
                        .child(self.renderer.clone()),
                )
            })
            .when_some(self.lock, |frame, reason| {
                frame.child(orbit::catalog_placeholder(reason, cx))
            })
            .when(self.selected, |frame| {
                frame
                    .child(
                        text(
                            format!(
                                "{} · {:.0} × {:.0}",
                                self.item.settings.kind().label(),
                                dimensions.0,
                                dimensions.1
                            ),
                            10.0,
                            500,
                            orbit::ink(cx),
                            cx,
                        )
                        .whitespace_nowrap()
                        .line_height(px(14.0))
                        .absolute()
                        .top(px(selection_caption_top(
                            y - self.client_origin.1,
                            self.preview_scale,
                        )))
                        .left_0()
                        .px(px(5.0))
                        .bg(rgb(orbit::carmine(cx))),
                    )
                    .children(self.resize_handles(dimensions, cx))
            })
    }
    /// El borde no participa en la geometría ni hereda la opacidad del contenido.
    fn selection_outline(cx: &gpui::App) -> gpui::Div {
        div()
            .absolute()
            .top_0()
            .left_0()
            .size_full()
            .border_1()
            .border_color(rgb(orbit::carmine(cx)))
    }
    fn resize_handles(
        &self,
        dimensions: (f32, f32),
        cx: &mut Context<Self>,
    ) -> Vec<gpui::Stateful<gpui::Div>> {
        [
            (-1, -1, 0.0, 0.0),
            (0, -1, 0.5, 0.0),
            (1, -1, 1.0, 0.0),
            (-1, 0, 0.0, 0.5),
            (1, 0, 1.0, 0.5),
            (-1, 1, 0.0, 1.0),
            (0, 1, 0.5, 1.0),
            (1, 1, 1.0, 1.0),
        ]
        .into_iter()
        .enumerate()
        .map(|(index, (hx, hy, x, y))| {
            let handle = vantare_ui::geometry::Handle(hx, hy);
            let cursor = match (hx, hy) {
                (0, _) => gpui::CursorStyle::ResizeUpDown,
                (_, 0) => gpui::CursorStyle::ResizeLeftRight,
                (-1, -1) | (1, 1) => gpui::CursorStyle::ResizeUpLeftDownRight,
                _ => gpui::CursorStyle::ResizeUpRightDownLeft,
            };
            div()
                .id(("studio-resize", index))
                .role(gpui::Role::Button)
                .aria_label(format!(
                    "Redimensionar {} {}",
                    match hx {
                        -1 => "izquierda",
                        1 => "derecha",
                        _ => "centro",
                    },
                    match hy {
                        -1 => "arriba",
                        1 => "abajo",
                        _ => "centro",
                    }
                ))
                .absolute()
                .left(px(dimensions.0
                    * self.preview_scale
                    * self.content_scale
                    * x
                    - 5.0))
                .top(px(dimensions.1
                    * self.preview_scale
                    * self.content_scale
                    * y
                    - 5.0))
                .size(px(10.0))
                .bg(rgb(orbit::carmine(cx)))
                .border_1()
                .border_color(rgb(orbit::ink(cx)))
                .cursor(cursor)
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(move |this, event: &gpui::MouseDownEvent, window, cx| {
                        this.focus.focus(window, cx);
                        cx.emit(Started(event.position, Some(handle)));
                        cx.stop_propagation();
                    }),
                )
        })
        .collect()
    }
}
/// Región flexible: el error completo queda en accesibilidad y tooltip.
fn save_status_host(status: &str, child: impl IntoElement) -> gpui::Stateful<gpui::Div> {
    let full = status.to_owned();
    div()
        .id("studio-save-status")
        .role(gpui::Role::Status)
        .aria_label(full.clone())
        .flex_1()
        .min_w_0()
        .overflow_hidden()
        .tooltip(move |_, cx| cx.new(|_| orbit::Tooltip(full.clone())).into())
        .child(child)
}
impl Studio {
    pub(crate) fn set_adapt(&mut self, adapt: orbit::Adapt, cx: &mut Context<Self>) {
        if self.adapt != adapt {
            // No mezclar el origen/escala anteriores con los nuevos durante un gesto.
            self.cancel_drag(cx);
            self.adapt = adapt;
            cx.notify();
        }
    }

    pub(crate) fn topbar_actions(&self, cx: &mut Context<Self>) -> gpui::Div {
        let profile = self
            .demo_profile
            .as_ref()
            .map_or("Layout local", |profile| profile.name.as_str());
        let status = self
            .status
            .as_ref()
            .err()
            .map_or(AUTO_SAVED, String::as_str);
        let compact = self.adapt.center_width() - 2.0 * self.adapt.padding().1 < 960.0;
        let publish = if compact {
            orbit::pending_icon_button(
                "publish-obs",
                "v-camera",
                "Publicar en OBS · Próximamente",
                36.0,
                "Próximamente. Usa captura de ventana en OBS",
                cx,
            )
        } else {
            orbit::pending_button(
                "publish-obs",
                "Publicar en OBS",
                "Próximamente. Usa captura de ventana en OBS",
                cx,
            )
        };
        let show = orbit::play_button(
            "studio-show-track",
            if compact { "" } else { "Mostrar en pista" },
            44.0,
            false,
            cx,
        )
        .aria_label("Mostrar en pista")
        .on_click(cx.listener(|studio, _, _, cx| {
            studio.status = studio.editor.show_on_track();
            cx.notify();
        }));
        div()
            .w_full()
            .flex()
            .items_center()
            .gap(px(8.0))
            .min_w_0()
            .flex_none()
            .min_h(px(44.0))
            .child(
                orbit::pending_select(
                    "studio-profile",
                    "Layout activo",
                    profile,
                    if compact { 140.0 } else { 180.0 },
                    "Solo está disponible el diseño guardado en este equipo.",
                    cx,
                )
                .flex_none(),
            )
            .child(self.toolbar_preview_mode(cx).flex_none())
            .child(save_status_host(
                status,
                text(
                    status.to_owned(),
                    12.0,
                    500,
                    if self.status.is_ok() {
                        orbit::green(cx)
                    } else {
                        orbit::red(cx)
                    },
                    cx,
                )
                .truncate()
                .min_w_0(),
            ))
            .child(publish.flex_none())
            .child(show.flex_none())
    }
    pub(crate) fn context_column(&self) -> Entity<StudioSidebar> {
        self.sidebar.clone()
    }
    /// Documento productivo para el resumen de Inicio; no implica ejecución en Desktop.
    pub(crate) fn catalog_access(&self) -> Option<crate::shell::navigation::Access> {
        self.access
    }

    pub(crate) fn home_layout(&self) -> &vantare_ui::layout::Layout {
        self.editor.layout()
    }
    pub(crate) fn home_track(&self) -> Option<&str> {
        self.snapshot
            .state
            .session
            .track_name
            .current()
            .map(String::as_str)
    }
    pub fn preferences(&self) -> Preferences {
        self.editor.layout().preferences
    }
    pub fn set_preferences(
        &mut self,
        prefs: Preferences,
        cx: &mut Context<Self>,
    ) -> Result<(), String> {
        let result = self.editor.set_preferences(prefs);
        self.status.clone_from(&result);
        if result.is_err() {
            cx.notify();
            return result;
        }
        self.reset_fields();
        self.rebuild(cx);
        Ok(())
    }
    pub fn new(mut prepared: Prepared, cx: &mut Context<Self>) -> Self {
        let status = cx.primary_display().map_or(Ok(()), |display| {
            let bounds = display.bounds();
            prepared.editor.initialize((
                f32::from(bounds.origin.x),
                f32::from(bounds.origin.y),
                f32::from(bounds.size.width),
                f32::from(bounds.size.height),
            ))
        });
        let search = cx.new(|cx| orbit::Input::new(String::new(), "Buscar widget…", cx));
        cx.observe(&search, |_, _, cx| cx.notify()).detach();
        let parent = cx.entity();
        let sidebar = cx.new(|cx| {
            cx.observe(&parent, |_, _, cx| cx.notify()).detach();
            StudioSidebar {
                studio: parent.downgrade(),
            }
        });
        #[cfg(feature = "parity-capture")]
        let demo_profile = if studio_demo_capture() {
            match crate::demo::DemoData::load() {
                Ok(demo) => Some(demo.profile),
                Err(error) => {
                    eprintln!("Demo de Studio: {error}");
                    None
                }
            }
        } else {
            None
        };
        #[cfg(not(feature = "parity-capture"))]
        let demo_profile = None;
        let monitor = client_monitor(prepared.editor.layout(), cx);
        let mut studio = Self {
            frequency_focus: std::array::from_fn(|_| cx.focus_handle()),
            adapt: orbit::Adapt::default(),
            access: None,
            editor: prepared.editor,
            sidebar,
            frames: vec![],
            // Hasta recibir IPC, En vivo no tiene datos. Workshop es autoría, no telemetría.
            snapshot: Snapshot::default(),
            examples: prepared.examples,
            example: true,
            photos: prepared.photos,
            real_photo: None,
            photo_choice: None,
            resolution_choice: None,
            monitor,
            status,
            drag: None,
            opacity_preview: None,
            held_nudge: None,
            nudge_task: None,
            focus: cx.focus_handle(),
            catalog: None,
            catalog_open: false,
            search,
            color: None,
            inspector_selection: None,
            fields: vec![],
            size_fields: vec![],
            demo_profile,
            fit_scale: STUDIO_PREVIEW_SCALE,
            canvas_size: (700.0, 1080.0 * STUDIO_PREVIEW_SCALE),
            zoom_step: 0,
        };
        #[cfg(feature = "parity-capture")]
        match capture_name().as_deref() {
            Some("studio-error-largo" | "studio-error-largo-sin-carril") => studio.status = Err("No se pudo guardar el documento de QA: otra aplicación modificó el archivo en una ruta extensa. Recarga el diseño para revisar los cambios antes de reintentar. ".repeat(3)),
            Some("studio-manual") => studio.zoom_step = 3,
            Some("studio-en-vivo") => studio.example = false,
            _ => {}
        }
        studio.rebuild(cx);
        studio
    }
    pub(crate) fn set_access(
        &mut self,
        access: crate::shell::navigation::Access,
        cx: &mut Context<Self>,
    ) {
        if self.access == Some(access) {
            return;
        }
        self.access = Some(access);
        for (_, frame) in &self.frames {
            frame.update(cx, |frame, cx| {
                frame.lock = widget_lock(Some(access), frame.item.settings.kind());
                cx.notify();
            });
        }
        if let Some(catalog) = &self.catalog {
            catalog.update(cx, |catalog, cx| {
                catalog.state =
                    orbit::ChoiceState::new(catalog_options(Some(access)), catalog.state.selected);
                cx.notify();
            });
        }
        cx.notify();
    }
    fn reset_fields(&mut self) {
        self.inspector_selection = None;
        self.fields.clear();
        self.size_fields.clear();
    }
    fn rebuild(&mut self, cx: &mut Context<Self>) {
        self.drag = None;
        self.monitor = client_monitor(self.editor.layout(), cx);
        self.fit_scale = fitted_scale(
            self.canvas_size.0,
            self.canvas_size.1,
            self.canvas_resolution(),
        )
        .unwrap_or(self.fit_scale);
        self.frames.clear();
        for item in &self.editor.layout().instances {
            let mut overlay = Overlay::configured(&item.settings, self.preferences());
            overlay.set_frame_size(item.geometry.size);
            #[cfg(feature = "parity-capture")]
            let content_scale = if studio_demo_capture() {
                demo_content_scale(item.settings.kind(), overlay.wanted_size().0)
            } else {
                1.0
            };
            #[cfg(not(feature = "parity-capture"))]
            let content_scale = 1.0;
            if let Err(error) = overlay.set_preview_scale(self.preview_scale() * content_scale) {
                eprintln!("Studio: {error}");
            }
            let renderer = cx.new(|cx| {
                overlay.ingest(&self.settings_snapshot(&item.settings), cx);
                overlay
            });
            let frame = cx.new(|_| CanvasFrame {
                item: item.clone(),
                lock: widget_lock(self.access, item.settings.kind()),
                renderer,
                preview_scale: self.preview_scale(),
                client_origin: (self.monitor.0, self.monitor.1),
                content_scale,
                focus: self.focus.clone(),
                selected: self.editor.selected.as_ref() == Some(&item.id),
                drag: None,
                resize: None,
                opacity_preview: None,
                nudge_position: None,
            });
            let id = item.id.clone();
            cx.subscribe(&frame, move |this, frame, event: &Started, cx| {
                this.select(id.clone(), cx);
                frame.update(cx, |frame, cx| {
                    if let Some(handle) = event.1 {
                        let size = frame
                            .item
                            .geometry
                            .resolved(frame.renderer.read(cx).wanted_size());
                        frame.resize = Some(Resize {
                            pointer: (event.0.x.into(), event.0.y.into()),
                            origin: (frame.item.x, frame.item.y),
                            size,
                            preview: ((frame.item.x, frame.item.y), size),
                            scale: frame.preview_scale * frame.content_scale,
                            handle,
                            locked: frame.item.geometry.aspect_locked,
                        });
                    } else {
                        frame.drag = Some(Drag {
                            pointer: (event.0.x.into(), event.0.y.into()),
                            origin: (frame.item.x, frame.item.y),
                            preview: (frame.item.x, frame.item.y),
                            scale: frame.preview_scale,
                        });
                    }
                    cx.notify();
                });
                this.drag = Some(frame);
                cx.notify();
            })
            .detach();
            self.frames.push((item.id.clone(), frame));
        }
        self.sync_size_fields(cx);
        cx.notify();
    }
    fn sync_size_fields(&self, cx: &mut Context<Self>) {
        if let Some(size) = self.selected_size(cx) {
            for (title, control) in &self.size_fields {
                control.update(cx, |control, cx| {
                    control.range.value =
                        f64::from(if *title == "Ancho" { size.0 } else { size.1 });
                    cx.notify();
                });
            }
        }
    }
    fn preview_snapshot(&self, kind: Kind) -> &Snapshot {
        if self.example
            && let Some(index) = self.real_photo
        {
            return &self.photos[index].snapshot;
        }
        preview_snapshot(self.example, &self.examples, &self.snapshot, kind)
    }
    fn canvas_resolution(&self) -> CanvasResolution {
        self.editor
            .layout()
            .canvas_resolution
            .unwrap_or(CanvasResolution {
                width: self.monitor.2,
                height: self.monitor.3,
            })
    }
    fn resolution_values(&self) -> Vec<Option<CanvasResolution>> {
        let mut values = vec![None];
        values.extend(CANVAS_PRESETS.into_iter().map(Some));
        if let Some(current) = self.editor.layout().canvas_resolution
            && !CANVAS_PRESETS.contains(&current)
        {
            values.push(Some(current));
        }
        values
    }
    fn set_canvas_resolution(
        &mut self,
        resolution: Option<CanvasResolution>,
        cx: &mut Context<Self>,
    ) {
        self.cancel_drag(cx);
        self.status = self.editor.set_canvas_resolution(resolution);
        self.rebuild(cx);
    }
    fn anchored_position(&self, size: (f32, f32), column: u8, row: u8) -> Option<(f32, f32)> {
        inspector::anchored_position(
            size,
            (
                self.canvas_resolution().width,
                self.canvas_resolution().height,
            ),
            column,
            row,
        )
        .map(|(x, y)| (x + self.monitor.0, y + self.monitor.1))
    }
    fn preview_scale(&self) -> f32 {
        ZOOM_STEPS[self.zoom_step].map_or(self.fit_scale, |percent| f32::from(percent) / 100.0)
    }
    fn settings_snapshot(&self, settings: &Settings) -> std::borrow::Cow<'_, Snapshot> {
        let photo = self.preview_snapshot(settings.kind());
        if self.example
            && self.real_photo.is_none()
            && let Settings::Standings(value) = settings
            && value.design_system == vantare_ui::standings::DesignSystem::Vantare
            && value.classification_mode == "multiclass"
        {
            std::borrow::Cow::Owned(examples::multiclass(photo, value.row_count))
        } else {
            std::borrow::Cow::Borrowed(photo)
        }
    }

    fn rescale_preview(&mut self, cx: &mut Context<Self>) {
        self.cancel_drag(cx);
        let scale = self.preview_scale();
        for (_, frame) in &self.frames {
            frame.update(cx, |frame, cx| {
                frame.renderer.update(cx, |overlay, cx| {
                    if let Err(error) = overlay.set_preview_scale(scale * frame.content_scale) {
                        eprintln!("Studio: {error}");
                    }
                    cx.notify();
                });
                frame.preview_scale = scale;
                cx.notify();
            });
        }
        cx.notify();
    }

    fn zoom(&mut self, step: usize, cx: &mut Context<Self>) {
        self.zoom_step = step.min(ZOOM_STEPS.len() - 1);
        self.rescale_preview(cx);
    }
    fn measure_canvas(&mut self, size: (f32, f32), scale: f32, cx: &mut Context<Self>) {
        if self.canvas_size != size || (self.fit_scale - scale).abs() > 0.000_01 {
            // También el zoom manual pierde su sistema de coordenadas al cambiar el viewport.
            self.cancel_drag(cx);
            self.canvas_size = size;
            self.fit_scale = scale;
            if self.zoom_step == 0 {
                self.rescale_preview(cx);
            } else {
                cx.notify();
            }
        }
    }
    pub fn ingest(&mut self, snapshot: &Snapshot, cx: &mut Context<Self>) {
        if self.snapshot == *snapshot {
            return;
        }
        self.snapshot = snapshot.clone();
        // El commit/cancelación aplicará la foto más reciente: no competir con la preview.
        if self.drag.is_some() || self.example {
            return;
        }
        for (_, frame) in &self.frames {
            if frame.read(cx).lock.is_some() {
                continue;
            }
            frame
                .read(cx)
                .renderer
                .clone()
                .update(cx, |overlay, cx| overlay.ingest(snapshot, cx));
        }
    }
    fn select(&mut self, id: String, cx: &mut Context<Self>) {
        self.cancel_drag(cx);
        self.editor.selected = Some(id);
        self.reset_fields();
        for (id, frame) in &self.frames {
            let selected = self.editor.selected.as_ref() == Some(id);
            frame.update(cx, |frame, cx| {
                frame.selected = selected;
                cx.notify();
            });
        }
        cx.notify();
    }
    fn edit(
        &mut self,
        edit: impl FnOnce(&mut Editor) -> Result<(), String>,
        cx: &mut Context<Self>,
    ) {
        self.cancel_drag(cx);
        self.status = edit(&mut self.editor);
        if self.status.is_err() {
            self.reset_fields();
        }
        self.rebuild(cx);
    }
    fn history(&mut self, redo: bool, cx: &mut Context<Self>) {
        self.reset_fields();
        self.edit(if redo { Editor::redo } else { Editor::undo }, cx);
    }
    fn cancel_drag(&mut self, cx: &mut Context<Self>) {
        self.nudge_task = None;
        if let Some(held) = self.held_nudge.take() {
            held.frame.update(cx, |frame, cx| {
                frame.nudge_position = None;
                cx.notify();
            });
        }
        if let Some((id, _)) = self.opacity_preview.take()
            && let Some((_, frame)) = self.frames.iter().find(|(key, _)| *key == id)
        {
            frame.update(cx, |frame, cx| {
                frame.opacity_preview = None;
                cx.notify();
            });
            self.reset_fields();
            cx.notify();
        }
        if let Some(frame) = self.drag.take() {
            frame.update(cx, |frame, cx| {
                frame.drag = None;
                frame.resize = None;
                frame.renderer.update(cx, |renderer, cx| {
                    renderer.set_frame_size(frame.item.geometry.size);
                    cx.notify();
                });
                cx.notify();
            });
            // Durante el gesto se congelaron todos: restaurar también los no arrastrados.
            for (_, frame) in &self.frames {
                let settings = frame.read(cx).item.settings.clone();
                frame.read(cx).renderer.clone().update(cx, |renderer, cx| {
                    renderer.ingest(&self.settings_snapshot(&settings), cx);
                });
            }
        }
    }
    fn preview_opacity(&mut self, id: &str, value: f32, cx: &mut Context<Self>) {
        if self.editor.selected.as_deref() != Some(id) || !value.is_finite() {
            return;
        }
        let value = value.clamp(0.0, 1.0);
        self.opacity_preview = Some((id.to_owned(), value));
        if let Some((_, frame)) = self.frames.iter().find(|(key, _)| key == id) {
            frame.update(cx, |frame, cx| {
                frame.opacity_preview = Some(value);
                cx.notify();
            });
        }
    }
    fn finish_opacity(&mut self, cx: &mut Context<Self>) {
        let Some((id, value)) = self.opacity_preview.take() else {
            return;
        };
        if self.editor.selected.as_ref() != Some(&id) {
            self.cancel_drag(cx);
            return;
        }
        self.status = self.editor.edit_selected(|item| item.opacity = value);
        let saved = self.editor.selected().map_or(1.0, |item| item.opacity);
        if let Some((_, frame)) = self.frames.iter().find(|(key, _)| *key == id) {
            frame.update(cx, |frame, cx| {
                frame.item.opacity = saved;
                frame.opacity_preview = None;
                cx.notify();
            });
        }
        if self.status.is_err() {
            self.reset_fields();
        }
        cx.notify();
    }
    fn move_drag(&mut self, event: &MouseMoveEvent, cx: &mut Context<Self>) {
        if let Some(frame) = self.drag.clone() {
            if !event.dragging() {
                self.cancel_drag(cx);
                return;
            }
            frame.update(cx, |frame, cx| {
                if let Some(resize) = &mut frame.resize
                    && resize.update((event.position.x.into(), event.position.y.into()))
                {
                    frame.renderer.update(cx, |renderer, cx| {
                        renderer.set_frame_size(Some(resize.preview.1));
                        cx.notify();
                    });
                    cx.notify();
                }
                if let Some(drag) = &mut frame.drag
                    && drag.update((event.position.x.into(), event.position.y.into()))
                {
                    cx.notify();
                }
            });
        }
    }
    fn finish_drag(&mut self, pointer: Point<Pixels>, cx: &mut Context<Self>) {
        let Some(frame) = self.drag.take() else {
            return;
        };
        let next = frame.update(cx, |frame, cx| {
            cx.notify();
            if let Some(mut resize) = frame.resize.take() {
                let changed = resize.update((pointer.x.into(), pointer.y.into()))
                    && resize.preview != (resize.origin, resize.size);
                changed.then_some((
                    frame.item.id.clone(),
                    resize.preview.0,
                    Some(resize.preview.1),
                ))
            } else {
                let mut drag = frame.drag.take()?;
                drag.update((pointer.x.into(), pointer.y.into()))
                    .then_some((frame.item.id.clone(), drag.preview, None))
            }
        });
        if let Some((id, (x, y), size)) = next {
            self.editor.selected = Some(id);
            self.reset_fields();
            self.edit(
                |editor| {
                    editor.edit_selected(|item| {
                        item.x = x;
                        item.y = y;
                        if let Some(size) = size {
                            item.geometry.size = Some(size);
                        }
                    })
                },
                cx,
            );
        } else {
            self.rebuild(cx);
        }
    }
    pub(crate) fn handle_shell_key(
        &mut self,
        event: &gpui::KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if document_key(&event.keystroke).is_some() {
            self.focus.focus(window, cx);
            self.handle_key(event, window, cx);
        }
    }
    fn handle_key(
        &mut self,
        event: &gpui::KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let key = &event.keystroke;
        if key.key == "escape" && (self.drag.is_some() || self.held_nudge.is_some()) {
            self.cancel_drag(cx);
            cx.stop_propagation();
        } else if let Some(action) = document_key(key) {
            // Los campos conservan Supr y sus atajos de edición de texto.
            if matches!(action, DocumentKey::History(_)) || self.focus.is_focused(window) {
                if !event.is_held {
                    match action {
                        DocumentKey::History(redo) => self.history(redo, cx),
                        DocumentKey::Duplicate => self.edit(Editor::duplicate, cx),
                        DocumentKey::Remove => self.edit(Editor::remove, cx),
                        DocumentKey::Save => self.edit(Editor::persist, cx),
                    }
                    self.focus.focus(window, cx);
                }
                cx.stop_propagation();
            }
        } else if self.focus.is_focused(window)
            && key.modifiers.alt
            && !key.modifiers.function
            && self.editor.selected().is_some()
            && let Some((direction, shift)) = keyboard_nudge(&gpui::Keystroke {
                modifiers: gpui::Modifiers {
                    alt: false,
                    ..key.modifiers
                },
                ..key.clone()
            })
        {
            self.resize_nudge(direction, shift, cx);
            cx.stop_propagation();
        } else if self.focus.is_focused(window)
            && self.editor.selected().is_some()
            && let Some((direction, shift)) = keyboard_nudge(key)
        {
            // Los campos del inspector conservan sus flechas y su propio foco.
            self.start_nudge(direction, shift, cx);
            cx.stop_propagation();
        }
    }
    fn init_navigation_controls(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.catalog.is_none() {
            cx.observe_window_activation(window, |this, window, cx| {
                if !window.is_window_active() {
                    this.cancel_drag(cx);
                }
            })
            .detach();
            let catalog = cx.new(|cx| {
                Choice::new(
                    "Tipo de widget",
                    ChoiceKind::Dropdown,
                    catalog_options(self.access),
                    Some(0),
                    window,
                    cx,
                )
            });
            self.catalog = Some(catalog);
            let photo_choice = cx.new(|cx| {
                let mut choice = Choice::new(
                    "Vuelta y foto real",
                    ChoiceKind::Dropdown,
                    self.photos
                        .iter()
                        .map(|p| OptionItem::new(p.label.clone()))
                        .collect(),
                    Some(0),
                    window,
                    cx,
                );
                // El ancho del contenedor no cambia el trigger: usar su variante compacta.
                choice.compact(150.0);
                choice
            });
            cx.subscribe(&photo_choice, |this, _, event: &ChoiceChanged, cx| {
                if this.real_photo.is_some() && event.0 < this.photos.len() {
                    this.cancel_drag(cx);
                    this.real_photo = Some(event.0);
                    this.rebuild(cx);
                }
            })
            .detach();
            self.photo_choice = Some(photo_choice);
        }
        let values = self.resolution_values();
        let selected = values
            .iter()
            .position(|value| *value == self.editor.layout().canvas_resolution);
        let options: Vec<_> = values
            .iter()
            .map(|value| {
                OptionItem::new(match value {
                    Some(resolution) => {
                        format!("{:.0} × {:.0}", resolution.width, resolution.height)
                    }
                    None => format!("Monitor · {:.0} × {:.0}", self.monitor.2, self.monitor.3),
                })
            })
            .collect();
        if let Some(choice) = &self.resolution_choice {
            choice.update(cx, |choice, cx| {
                if choice.state.selected != selected
                    || choice
                        .state
                        .options
                        .iter()
                        .map(|item| &item.label)
                        .ne(options.iter().map(|item| &item.label))
                {
                    choice.state = orbit::ChoiceState::new(options, selected);
                    cx.notify();
                }
            });
        } else {
            let choice = cx.new(|cx| {
                let mut choice = Choice::new(
                    "Resolución del lienzo",
                    ChoiceKind::Dropdown,
                    options,
                    selected,
                    window,
                    cx,
                );
                choice.compact(170.0);
                choice
            });
            cx.subscribe(&choice, |this, _, event: &ChoiceChanged, cx| {
                if let Some(resolution) = this.resolution_values().get(event.0).copied() {
                    this.set_canvas_resolution(resolution, cx);
                }
            })
            .detach();
            self.resolution_choice = Some(choice);
        }
    }
    #[allow(clippy::cast_possible_truncation)] // Entradas acotadas a ±100000 y opacidad 0..1.
    fn init_controls(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.init_navigation_controls(window, cx);
        let Some(item) = self.editor.selected().cloned() else {
            self.reset_fields();
            return;
        };
        if self.inspector_selection.as_ref() == Some(&item.id) {
            return;
        }
        self.fields.clear();
        self.size_fields.clear();
        self.inspector_selection = Some(item.id.clone());
        self.color = if let Settings::RacingFlags(settings) = &item.settings {
            Some(cx.new(|cx| {
                orbit::Input::new(settings.text_color.clone(), "Color del texto (#RRGGBB)", cx)
            }))
        } else {
            None
        };
        if let Some(size) = self.selected_size(cx) {
            for (title, value, minimum, maximum) in [
                ("Ancho", size.0, 64.0, 3840.0),
                ("Alto", size.1, 32.0, 2160.0),
            ] {
                self.instance_number(
                    title,
                    Tab::Layout,
                    f64::from(value),
                    minimum,
                    maximum,
                    1.0,
                    |_, _| {},
                    cx,
                );
            }
        }
        let aspect =
            cx.new(|cx| Checkbox::switch("Mantener proporción", item.geometry.aspect_locked, cx));
        let id = item.id.clone();
        cx.subscribe(&aspect, move |this, _, event: &Checked, cx| {
            if this.editor.selected.as_ref() == Some(&id) {
                this.edit(
                    |editor| editor.edit_selected(|item| item.geometry.aspect_locked = event.0),
                    cx,
                );
            }
        })
        .detach();
        self.fields
            .push((Tab::Layout, "Mantener proporción", aspect.into(), false));
        self.instance_number(
            "Opacidad",
            Tab::Appearance,
            f64::from(item.opacity) * 100.0,
            0.0,
            100.0,
            5.0,
            |item, v| item.opacity = (v / 100.0) as f32,
            cx,
        );
        let visible = cx.new(|cx| Checkbox::switch("Visible", item.visible, cx));
        let id = item.id.clone();
        cx.subscribe(&visible, move |this, _, event: &Checked, cx| {
            if this.editor.selected.as_ref() == Some(&id) {
                this.edit(
                    |editor| editor.edit_selected(|item| item.visible = event.0),
                    cx,
                );
            }
        })
        .detach();
        self.fields
            .push((Tab::Behavior, "Visible", visible.into(), false));
        for field in inspector::fields(&item.settings) {
            let (tab, title) = (field.tab, field.title);
            let label = !matches!(&field.control, Control::Boolean { .. });
            let view = Self::setting_control(item.id.clone(), field, window, cx);
            self.fields.push((tab, title, view, label));
        }
    }
    fn setting_control(
        id: String,
        field: inspector::Field,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> gpui::AnyView {
        match field.control {
            Control::Boolean { value, set } => {
                let control = cx.new(|cx| Checkbox::switch(field.title, value, cx));
                cx.subscribe(&control, move |this, _, event: &Checked, cx| {
                    if this.editor.selected.as_ref() == Some(&id) {
                        this.edit(
                            |editor| editor.edit_selected(|item| set(&mut item.settings, event.0)),
                            cx,
                        );
                    }
                })
                .detach();
                control.into()
            }
            Control::Choice {
                options,
                selected,
                set,
            } => {
                let control = cx.new(|cx| {
                    Choice::new(
                        field.title,
                        ChoiceKind::Dropdown,
                        options
                            .iter()
                            .map(|(label, _)| OptionItem::new(*label))
                            .collect(),
                        selected,
                        window,
                        cx,
                    )
                });
                cx.subscribe(&control, move |this, _, event: &ChoiceChanged, cx| {
                    if this.editor.selected.as_ref() == Some(&id)
                        && let Some((_, key)) = options.get(event.0)
                    {
                        this.reset_fields();
                        this.edit(
                            |editor| editor.edit_selected(|item| set(&mut item.settings, key)),
                            cx,
                        );
                    }
                })
                .detach();
                control.into()
            }
            Control::Number { range, set } => {
                let control =
                    cx.new(|cx| NumberControl::new(field.title, NumberKind::Stepper, range, cx));
                cx.subscribe(&control, move |this, _, event: &NumberChanged, cx| {
                    if this.editor.selected.as_ref() == Some(&id) {
                        this.edit(
                            |editor| editor.edit_selected(|item| set(&mut item.settings, event.0)),
                            cx,
                        );
                    }
                })
                .detach();
                control.into()
            }
        }
    }
    #[allow(clippy::too_many_arguments)]
    fn instance_number(
        &mut self,
        title: &'static str,
        tab: Tab,
        value: f64,
        min: f64,
        max: f64,
        step: f64,
        set: impl Fn(&mut Instance, f64) + 'static,
        cx: &mut Context<Self>,
    ) {
        let control = cx.new(|cx| {
            let mut control = NumberControl::new(
                title,
                if title == "Opacidad" {
                    NumberKind::Slider
                } else {
                    NumberKind::Stepper
                },
                NumberRange {
                    min,
                    max,
                    step,
                    value,
                },
                cx,
            );
            if matches!(title, "Ancho" | "Alto") {
                control.decimal_places = Some(2);
            }
            control
        });
        let id = self.editor.selected.clone();
        cx.subscribe(&control, move |this, _, event: &NumberChanged, cx| {
            if this.editor.selected == id {
                if title == "Opacidad" {
                    #[allow(clippy::cast_possible_truncation)]
                    if let Some(id) = id.as_deref() {
                        this.preview_opacity(id, (event.0 / 100.0) as f32, cx);
                    }
                } else if matches!(title, "Ancho" | "Alto") {
                    let Some(size) = this.selected_size(cx) else {
                        return;
                    };
                    let axis = if title == "Ancho" {
                        vantare_ui::geometry::Handle(1, 0)
                    } else {
                        vantare_ui::geometry::Handle(0, 1)
                    };
                    #[allow(clippy::cast_possible_truncation)]
                    // NumberRange acotado a límites de Geometry.
                    let value = event.0 as f32;
                    let delta = if title == "Ancho" {
                        (value - size.0, 0.0)
                    } else {
                        (0.0, value - size.1)
                    };
                    this.edit(
                        |editor| {
                            editor.edit_selected(|item| {
                                if let Some((_, next)) = vantare_ui::geometry::resize(
                                    (item.x, item.y),
                                    vantare_ui::geometry::Size {
                                        width: size.0,
                                        height: size.1,
                                    },
                                    axis,
                                    delta,
                                    item.geometry.aspect_locked,
                                ) {
                                    item.geometry.size = Some(next);
                                }
                            })
                        },
                        cx,
                    );
                } else {
                    this.edit(|editor| editor.edit_selected(|item| set(item, event.0)), cx);
                }
            }
        })
        .detach();
        if title == "Opacidad" {
            cx.subscribe(&control, |this, _, _: &NumberFinished, cx| {
                this.finish_opacity(cx);
            })
            .detach();
        }
        if matches!(title, "Ancho" | "Alto") {
            self.size_fields.push((title, control.clone()));
        }
        self.fields.push((tab, title, control.into(), true));
    }
    fn widget_list(&self, cx: &mut Context<Self>) -> gpui::Div {
        let query = self.search.read(cx).value.to_lowercase();
        let mut list = div().flex().gap(px(8.0));
        let mut matches = 0;
        let mut content_width = 0.0;
        for (index, item) in self.editor.layout().instances.iter().enumerate() {
            if format!("{} {}", item.id, item.settings.kind().label())
                .to_lowercase()
                .contains(&query)
            {
                if matches > 0 {
                    content_width += 8.0;
                }
                content_width += 160.0;
                matches += 1;
                list = list.child(self.widget_row(index, item, cx));
            }
        }
        if matches == 0 {
            list = list.child(text(
                if query.is_empty() {
                    "Añade tu primer widget"
                } else {
                    "Sin resultados"
                },
                13.0,
                400,
                orbit::ink_3(cx),
                cx,
            ));
        }
        // El scroll mide el hijo directo: sus filas no deben desbordar un ancho
        // encogido al viewport, porque entonces los últimos widgets son inaccesibles.
        list.min_w(px(content_width))
    }
    fn widget_row(
        &self,
        index: usize,
        item: &Instance,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let id = item.id.clone();
        let visibility_id = id.clone();
        let selected = self.editor.selected.as_ref() == Some(&item.id);
        let lock = widget_lock(self.access, item.settings.kind());
        div()
            .id(("studio-instance", index))
            .role(gpui::Role::Button)
            .aria_label(item.settings.kind().label())
            .tab_index(0)
            .h(px(48.0))
            .w(px(160.0))
            .flex_none()
            .border_1()
            .border_color(gpui::rgba(orbit::line(cx)))
            .px(px(8.0))
            .rounded(px(orbit::skin(cx).radius.md))
            .flex()
            .items_center()
            .gap(px(6.0))
            .when(selected, |row| {
                orbit::nav_active(row, cx).shadow(orbit::selection_ring(cx))
            })
            .hover(|row| row.bg(rgb(orbit::surface_2(cx))))
            .child(orbit::icon(
                if lock.is_some() { "v-lock" } else { "v-studio" },
                20.0,
                orbit::ink_2(cx),
            ))
            .aria_selected(selected)
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .child(
                        text(item.settings.kind().label(), 12.0, 600, orbit::ink(cx), cx)
                            .whitespace_nowrap()
                            .overflow_hidden()
                            .text_ellipsis(),
                    )
                    .child(text(
                        if item.visible { "Visible" } else { "Oculto" },
                        10.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ))
                    .when_some(lock, |body, reason| {
                        body.child(text(reason, 10.0, 400, orbit::skin(cx).text3, cx))
                    }),
            )
            .child(
                div()
                    .id(("studio-visibility", index))
                    .role(gpui::Role::Button)
                    .aria_label(if item.visible {
                        "Ocultar widget"
                    } else {
                        "Mostrar widget"
                    })
                    .tab_index(0)
                    .child(visibility_icon(item.visible))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.edit(|editor| toggle_visibility(editor, &visibility_id), cx);
                        cx.stop_propagation();
                    })),
            )
            .on_click(cx.listener(move |this, _, window, cx| {
                this.select(id.clone(), cx);
                this.focus.focus(window, cx);
            }))
    }
    fn widget_actions(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .w(px(170.0))
            .flex_none()
            .gap(px(6.0))
            .when(self.catalog_open, |body| {
                body.child(text(
                    "Filtrar widgets del diseño",
                    12.0,
                    500,
                    orbit::ink_2(cx),
                    cx,
                ))
                .child(self.search.clone())
                .when_some(self.catalog.clone(), gpui::ParentElement::child)
            })
            .child(
                button("add-widget", "", cx)
                    .w_full()
                    .child(text("+  Añadir widget", 12.0, 600, orbit::ink_3(cx), cx))
                    .aria_label("Añadir widget")
                    .on_click(cx.listener(|this, _, _, cx| {
                        if !this.catalog_open {
                            this.catalog_open = true;
                            cx.notify();
                            return;
                        }
                        let kind = this
                            .catalog
                            .as_ref()
                            .and_then(|catalog| catalog.read(cx).state.selected)
                            .and_then(|index| Kind::ALL.get(index))
                            .copied();
                        if let Some(kind) = kind {
                            if let Some(reason) = widget_lock(this.access, kind) {
                                this.status = Err(reason.into());
                                cx.notify();
                                return;
                            }
                            this.catalog_open = false;
                            this.reset_fields();
                            this.edit(|editor| editor.add(kind), cx);
                        }
                    })),
            )
    }
    fn toolbar_preview_mode(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut row = div()
            .flex()
            .items_center()
            .gap(px(4.0))
            .p(px(4.0))
            .rounded(px(orbit::skin(cx).radius.md))
            .bg(rgb(orbit::surface_2(cx)));
        for (id, label, example) in [
            ("studio-example", "Ejemplo", true),
            ("studio-live", "En vivo", false),
        ] {
            row = row.child(
                orbit::ghost_button(id, label, cx)
                    .when(self.example == example, |button| {
                        button.bg(rgb(orbit::surface_3(cx)))
                    })
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.cancel_drag(cx);
                        this.example = example;
                        this.real_photo = None;
                        this.rebuild(cx);
                    })),
            );
        }
        row
    }
    fn toolbar_zoom_out_control(cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        div()
            .id("studio-zoom-out")
            .role(gpui::Role::Button)
            .aria_label("Reducir zoom")
            .cursor_pointer()
            .on_click(cx.listener(|this, _, _, cx| this.zoom(this.zoom_step.saturating_sub(1), cx)))
            .size(px(39.0))
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .child(text("−", 14.0, 500, orbit::ink_3(cx), cx))
    }

    fn toolbar_zoom_label(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let label = format!("{:.0} %", self.preview_scale() * 100.0);
        div()
            .id("studio-zoom-fit")
            .role(gpui::Role::Button)
            .aria_label("Ajustar overlay al lienzo")
            .cursor_pointer()
            .on_click(cx.listener(|this, _, _, cx| this.zoom(0, cx)))
            .w(px(60.0))
            .text_center()
            .child(orbit::mono_text(label, 12.0, orbit::ink_3(cx), cx))
    }

    fn toolbar_zoom_in_control(cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        div()
            .id("studio-zoom-in")
            .role(gpui::Role::Button)
            .aria_label("Ampliar zoom")
            .cursor_pointer()
            .on_click(cx.listener(|this, _, _, cx| this.zoom(this.zoom_step + 1, cx)))
            .size(px(39.0))
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .child(text("+", 14.0, 500, orbit::ink_3(cx), cx))
    }

    fn color_settings(&self, tab: Tab, mut panel: gpui::Div, cx: &mut Context<Self>) -> gpui::Div {
        if tab == Tab::Appearance
            && let Some(color) = &self.color
        {
            let selected = self.editor.selected.clone();
            panel = panel
                .child(orbit::eyebrow("Color del texto", cx))
                .child(color.clone())
                .child(
                    button("apply-color", "Aplicar color", cx).on_click(cx.listener(
                        move |this, _, _, cx| {
                            if this.editor.selected != selected {
                                return;
                            }
                            let Some(color) = &this.color else {
                                return;
                            };
                            let value = color.read(cx).value.clone();
                            if !inspector::valid_color(&value) {
                                this.status = Err("Color inválido: usa #RRGGBB".into());
                                cx.notify();
                                return;
                            }
                            this.edit(
                                |editor| {
                                    editor.edit_selected(|item| {
                                        if let Settings::RacingFlags(settings) = &mut item.settings
                                        {
                                            settings.text_color = value.to_ascii_lowercase();
                                        }
                                    })
                                },
                                cx,
                            );
                        },
                    )),
                );
        }
        panel
    }
    fn column_settings(
        item: &Instance,
        tab: Tab,
        mut panel: gpui::Div,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        if tab == Tab::Content
            && let Some(columns) = inspector::columns(&item.settings)
        {
            panel = panel.child(orbit::eyebrow("Columnas", cx));
            for (index, column) in columns.iter().enumerate() {
                let selected = item.id.clone();
                let required = inspector::appearance(&item.settings).is_some()
                    && (column.metric_id == "driverName"
                        || (matches!(&item.settings, Settings::Standings(_))
                            && column.metric_id == "position"));
                panel = panel.child(orbit::setting_row(
                    inspector::column_label(&column.metric_id),
                    "",
                    orbit::toggle(
                        "column-visible",
                        "Mostrar columna",
                        column.enabled || required,
                        !required,
                        cx,
                    )
                    .id(("column-visible", index))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if required || this.editor.selected.as_ref() != Some(&selected) {
                            return;
                        }
                        this.reset_fields();
                        this.edit(
                            |editor| {
                                editor.edit_selected(|item| {
                                    if let Some(columns) =
                                        inspector::columns_mut(&mut item.settings)
                                        && let Some(column) = columns.get_mut(index)
                                    {
                                        column.enabled = !column.enabled;
                                    }
                                })
                            },
                            cx,
                        );
                    })),
                    cx,
                ));
            }
        }
        panel
    }
    fn position_anchor(&mut self, column: u8, row: u8, cx: &mut Context<Self>) {
        if let Some(position) = self
            .selected_size(cx)
            .and_then(|size| self.anchored_position(size, column, row))
        {
            self.reset_fields();
            self.edit(
                |editor| {
                    editor.edit_selected(|item| {
                        item.x = position.0;
                        item.y = position.1;
                    })
                },
                cx,
            );
        }
    }
    fn position_nudge(&mut self, direction: (i8, i8), shift: bool, cx: &mut Context<Self>) {
        self.reset_fields();
        self.edit(
            |editor| {
                editor.edit_selected(|item| {
                    let next = inspector::nudged_position((item.x, item.y), direction, shift);
                    item.x = next.0;
                    item.y = next.1;
                })
            },
            cx,
        );
    }
    fn start_nudge(&mut self, direction: (i8, i8), shift: bool, cx: &mut Context<Self>) {
        if self
            .held_nudge
            .as_ref()
            .is_some_and(|held| held.direction == direction && held.shift == shift)
        {
            return;
        }
        self.cancel_drag(cx);
        let Some(item) = self.editor.selected() else {
            return;
        };
        let Some((_, frame)) = self.frames.iter().find(|(id, _)| *id == item.id) else {
            return;
        };
        self.held_nudge = Some(HeldNudge {
            frame: frame.clone(),
            origin: (item.x, item.y),
            direction,
            shift,
            started: Instant::now(),
        });
        self.tick_nudge(Duration::ZERO, cx);
        self.nudge_task = Some(cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor()
                    .timer(Duration::from_millis(16))
                    .await;
                if !this
                    .update(cx, |this, cx| {
                        let Some(held) = &this.held_nudge else {
                            return false;
                        };
                        this.tick_nudge(held.started.elapsed(), cx);
                        true
                    })
                    .unwrap_or(false)
                {
                    break;
                }
            }
        }));
    }
    fn tick_nudge(&self, elapsed: Duration, cx: &mut Context<Self>) {
        let Some(held) = &self.held_nudge else { return };
        let distance = held_nudge_distance(elapsed, held.shift);
        let position = (
            (held.origin.0 + f32::from(held.direction.0) * distance).clamp(-100_000.0, 100_000.0),
            (held.origin.1 + f32::from(held.direction.1) * distance).clamp(-100_000.0, 100_000.0),
        );
        held.frame.update(cx, |frame, cx| {
            if frame.nudge_position != Some(position) {
                frame.nudge_position = Some(position);
                cx.notify();
            }
        });
    }
    fn finish_nudge(&mut self, cx: &mut Context<Self>) {
        self.nudge_task = None;
        let Some(held) = self.held_nudge.take() else {
            return;
        };
        let frame = held.frame.read(cx);
        let position = frame.nudge_position;
        let id = frame.item.id.clone();
        held.frame.update(cx, |frame, cx| {
            frame.nudge_position = None;
            cx.notify();
        });
        if self.editor.selected.as_ref() == Some(&id)
            && let Some((x, y)) = position
        {
            self.reset_fields();
            self.edit(
                |editor| {
                    editor.edit_selected(|item| {
                        item.x = x;
                        item.y = y;
                    })
                },
                cx,
            );
        }
    }
    fn anchor_grid(&self, item: &Instance, cx: &mut Context<Self>) -> gpui::Div {
        let size = self.selected_size(cx);
        let mut anchors = div()
            .flex()
            .flex_col()
            .gap(px(4.0))
            .p(px(6.0))
            .rounded(px(orbit::skin(cx).radius.md))
            .bg(rgb(orbit::surface_2(cx)));
        for row in 0..3u8 {
            let mut line = div().flex().gap(px(4.0));
            for column in 0..3u8 {
                let position = size.and_then(|size| self.anchored_position(size, column, row));
                let active = position
                    .is_some_and(|(x, y)| (item.x - x).abs() < 0.01 && (item.y - y).abs() < 0.01);
                let label = format!(
                    "Anclar {} {}",
                    ["arriba", "centro", "abajo"][usize::from(row)],
                    ["izquierda", "centro", "derecha"][usize::from(column)]
                );
                line = line.child(
                    orbit::position_cell(
                        ("studio-anchor", usize::from(row) * 3 + usize::from(column)),
                        "",
                        22.0,
                        16.0,
                        active,
                        cx,
                    )
                    .aria_label(label)
                    .on_click(
                        cx.listener(move |this, _, _, cx| this.position_anchor(column, row, cx)),
                    ),
                );
            }
            anchors = anchors.child(line);
        }
        anchors
    }
    fn nudge_pad(cx: &mut Context<Self>) -> gpui::Div {
        let mut dpad = div().flex().flex_col().gap(px(3.0));
        let cells = [
            [None, Some(("▲", "Mover arriba", (0, -1))), None],
            [
                Some(("◀", "Mover izquierda", (-1, 0))),
                Some(("•", "Centrar widget", (0, 0))),
                Some(("▶", "Mover derecha", (1, 0))),
            ],
            [None, Some(("▼", "Mover abajo", (0, 1))), None],
        ];
        for (row, cells) in cells.into_iter().enumerate() {
            let mut line = div().flex().gap(px(3.0));
            for (column, cell) in cells.into_iter().enumerate() {
                line = match cell {
                    None => line.child(div().size(px(26.0))),
                    Some((glyph, label, direction)) => line.child(
                        orbit::position_cell(
                            ("studio-nudge", row * 3 + column),
                            glyph,
                            26.0,
                            26.0,
                            false,
                            cx,
                        )
                        .aria_label(label)
                        .on_mouse_down(
                            MouseButton::Left,
                            cx.listener(move |this, event: &gpui::MouseDownEvent, _, cx| {
                                if direction != (0, 0) {
                                    this.start_nudge(direction, event.modifiers.shift, cx);
                                }
                            }),
                        )
                        .on_mouse_up(
                            MouseButton::Left,
                            cx.listener(|this, _, _, cx| this.finish_nudge(cx)),
                        )
                        .on_mouse_up_out(
                            MouseButton::Left,
                            cx.listener(|this, _, _, cx| this.finish_nudge(cx)),
                        )
                        .on_click(cx.listener(
                            move |this, event: &gpui::ClickEvent, _, cx| {
                                if direction == (0, 0) {
                                    this.position_anchor(1, 1, cx);
                                } else if !matches!(event, gpui::ClickEvent::Mouse(_)) {
                                    this.position_nudge(direction, event.modifiers().shift, cx);
                                }
                            },
                        )),
                    ),
                };
            }
            dpad = dpad.child(line);
        }
        dpad
    }
    fn resize_nudge(&mut self, direction: (i8, i8), shift: bool, cx: &mut Context<Self>) {
        let Some(size) = self.selected_size(cx) else {
            return;
        };
        let amount = if shift { 8.0 } else { 1.0 };
        self.resize_by(
            (
                f32::from(direction.0) * amount,
                f32::from(direction.1) * amount,
            ),
            size,
            cx,
        );
    }
    fn resize_by(&mut self, delta: (f32, f32), size: (f32, f32), cx: &mut Context<Self>) {
        self.reset_fields();
        self.edit(
            |editor| {
                editor.edit_selected(|item| {
                    let handle = if delta.0 == 0.0 {
                        vantare_ui::geometry::Handle(0, 1)
                    } else {
                        vantare_ui::geometry::Handle(1, 0)
                    };
                    if let Some((_, next)) = vantare_ui::geometry::resize(
                        (item.x, item.y),
                        vantare_ui::geometry::Size {
                            width: size.0,
                            height: size.1,
                        },
                        handle,
                        delta,
                        item.geometry.aspect_locked,
                    ) {
                        item.geometry.size = Some(next);
                    }
                })
            },
            cx,
        );
    }
    fn scale_by(&mut self, factor: f32, cx: &mut Context<Self>) {
        let Some(size) = self.selected_size(cx) else {
            return;
        };
        self.reset_fields();
        self.edit(
            |editor| {
                editor.edit_selected(|item| {
                    if let Some((_, next)) = vantare_ui::geometry::resize(
                        (item.x, item.y),
                        vantare_ui::geometry::Size {
                            width: size.0,
                            height: size.1,
                        },
                        vantare_ui::geometry::Handle(1, 1),
                        (size.0 * (factor - 1.0), size.1 * (factor - 1.0)),
                        true,
                    ) {
                        item.geometry.size = Some(next);
                    }
                })
            },
            cx,
        );
    }
    fn position_controls(&self, item: &Instance, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(10.0))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(18.0))
                    .child(self.anchor_grid(item, cx))
                    .child(Self::nudge_pad(cx)),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(text("Tamaño", 11.0, 500, orbit::ink_3(cx), cx))
                    .child(
                        orbit::position_cell("studio-size-minus", "−", 28.0, 28.0, false, cx)
                            .aria_label("Reducir widget 10 %")
                            .on_click(cx.listener(|this, _, _, cx| this.scale_by(0.9, cx))),
                    )
                    .child(orbit::mono_text("Escala", 11.0, orbit::ink_2(cx), cx))
                    .child(
                        orbit::position_cell("studio-size-plus", "+", 28.0, 28.0, false, cx)
                            .aria_label("Ampliar widget 10 %")
                            .on_click(cx.listener(|this, _, _, cx| this.scale_by(1.1, cx))),
                    ),
            )
            .child(text(
                "Flechas: mover · Alt: tamaño · Mayús: 8 px",
                11.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
    }
    pub(crate) fn performance(&self) -> &vantare_ui::performance::Preferences {
        &self.editor.layout().performance
    }
    pub(crate) fn set_performance_level(
        &mut self,
        level: vantare_ui::performance::Level,
        cx: &mut Context<Self>,
    ) -> Result<(), String> {
        let mut next = self.performance().clone();
        next.level = level;
        let result = self.editor.set_performance(next);
        self.status.clone_from(&result);
        cx.notify();
        result
    }
    fn set_widget_frequency(&mut self, hz: Option<u16>, cx: &mut Context<Self>) {
        let Some(item) = self.editor.selected() else {
            return;
        };
        let id = item.id.clone();
        let mut next = self.performance().clone();
        if let Some(hz) = hz {
            next.widgets.insert(id, hz);
        } else {
            next.widgets.remove(&id);
        }
        self.status = self.editor.set_performance(next);
        cx.notify();
    }
    fn performance_settings(&self, cx: &mut Context<Self>) -> gpui::Div {
        if self
            .editor
            .selected()
            .is_some_and(|item| item.settings.kind() == vantare_ui::Kind::RacingFlags)
        {
            return orbit::inspector_section("Rendimiento", "v-gauge", cx).child(text(
                "Las banderas se actualizan con cada foto para conservar los avisos inmediatos.",
                12.0,
                400,
                orbit::ink_2(cx),
                cx,
            ));
        }
        let mut controls = div().flex().flex_wrap().gap(px(6.0));
        for (index, hz) in [
            None,
            Some(1),
            Some(4),
            Some(5),
            Some(10),
            Some(15),
            Some(20),
            Some(30),
            Some(60),
        ]
        .into_iter()
        .enumerate()
        {
            controls = controls.child(
                button(
                    format!("studio-frequency-{index}"),
                    &hz.map_or_else(|| "Usar nivel".to_owned(), |hz| format!("{hz} Hz")),
                    cx,
                )
                .track_focus(&self.frequency_focus[index])
                .when(
                    self.editor
                        .selected()
                        .map(|item| self.performance().widgets.get(&item.id).copied())
                        == Some(hz),
                    |button| button.border_color(rgb(orbit::carmine(cx))),
                )
                .on_key_down(
                    cx.listener(move |studio, event: &gpui::KeyDownEvent, _, cx| {
                        if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                            studio.set_widget_frequency(hz, cx);
                            cx.stop_propagation();
                        }
                    }),
                )
                .on_click(cx.listener(move |studio, _, _, cx| studio.set_widget_frequency(hz, cx))),
            );
        }
        let prefs = self.performance();
        let label = self.editor.selected().map_or_else(
            || "Selecciona un widget".to_owned(),
            |item| {
                format!(
                    "Frecuencia aplicada: {} · {}",
                    match prefs.hz(&item.id, item.settings.kind()) {
                        0 => "cada foto".to_owned(),
                        hz => format!("{hz} Hz"),
                    },
                    prefs.level.label()
                )
            },
        );
        orbit::inspector_section("Rendimiento", "v-gauge", cx)
            .child(text(label, 12.0, 400, orbit::ink_2(cx), cx))
            .child(controls)
    }
    fn tab_settings(
        &self,
        item: &Instance,
        tab: Tab,
        mut panel: gpui::Div,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        match tab {
            Tab::Layout => {
                panel = panel
                    .child(self.position_controls(item, cx))
                    .child(
                        button("front", "Traer al frente", cx)
                            .on_click(cx.listener(|this, _, _, cx| this.edit(Editor::front, cx))),
                    )
                    .child(
                        button("back", "Enviar al fondo", cx)
                            .on_click(cx.listener(|this, _, _, cx| this.edit(Editor::back, cx))),
                    );
            }
            Tab::Behavior => {
                panel = panel.child(text(
                    "Más condiciones próximamente",
                    12.0,
                    400,
                    orbit::ink_3(cx),
                    cx,
                ));
            }
            Tab::Content | Tab::Appearance => {
                if tab == Tab::Content && matches!(&item.settings, Settings::Delta(_)) {
                    panel = panel.child(text(
                        "La mejor vuelta es la propia. Óptima compara con tus mejores sectores; Líder, con la mejor de quien encabeza tu clase. Última vuelta y mejor absoluta de sesión: próximamente, sin señal independiente del núcleo.",
                        11.0, 400, orbit::ink_3(cx), cx,
                    ));
                }
                if tab == Tab::Appearance && inspector::appearance(&item.settings).is_none() {
                    panel = panel.child(orbit::pending_select(
                        "studio-style",
                        "Estilo del widget",
                        "Estilo · Próximamente",
                        180.0,
                        "Neo, Carmín y Limpio no están disponibles para este documento.",
                        cx,
                    ));
                    if self.color.is_none() {
                        panel = panel.child(orbit::pending_select(
                            "studio-accent",
                            "Acento del widget",
                            "Acento · Próximamente",
                            180.0,
                            "Este widget no admite un acento configurable en el documento actual.",
                            cx,
                        ));
                    }
                }
                panel = self.color_settings(tab, panel, cx);
                panel = Self::column_settings(item, tab, panel, cx);

                if tab == Tab::Content && !inspector::pending(&item.settings).is_empty() {
                    panel = panel.child(text(
                        "Más opciones próximamente",
                        12.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ));
                }
                if self
                    .fields
                    .iter()
                    .all(|(field_tab, _, _, _)| *field_tab != tab)
                {
                    panel = panel.child(orbit::empty_state(
                        "Sin ajustes disponibles",
                        "El widget conserva sus ajustes.",
                        cx,
                    ));
                }
            }
        }
        panel
    }
    #[allow(clippy::too_many_lines)] // Compone las secciones del inspector con los controles existentes.
    fn inspector(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut panel = div().min_w_0().flex().flex_col();
        if let Some(item) = self.editor.selected() {
            panel = panel.child(
                div()
                    .flex_none()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .p(px(16.0))
                    .border_b_1()
                    .border_color(orbit::alpha(orbit::skin(cx).line1))
                    .child(orbit::icon("v-studio", 28.0, orbit::carmine(cx)))
                    .child(
                        text(item.settings.kind().label(), 18.0, 600, orbit::ink(cx), cx)
                            .flex_1()
                            .min_w_0()
                            .whitespace_nowrap()
                            .overflow_hidden()
                            .text_ellipsis(),
                    )
                    .child(
                        orbit::icon_button(
                            "studio-clear-selection",
                            "x",
                            "Deseleccionar widget",
                            28.0,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.cancel_drag(cx);
                            this.editor.selected = None;
                            this.reset_fields();
                            this.rebuild(cx);
                        })),
                    ),
            );
            for tab in Tab::ALL {
                if tab == Tab::Layout {
                    panel = panel.child(self.performance_settings(cx));
                }
                let title = tab.label();
                let mut card = orbit::inspector_section(
                    title,
                    match tab {
                        Tab::Layout => "v-studio",
                        Tab::Content => "v-testing",
                        Tab::Behavior => "v-gauge",
                        Tab::Appearance => "v-palette",
                    },
                    cx,
                );
                let mut body = div().flex().flex_col().gap(px(10.0));
                for (field_tab, label, control, show_label) in &self.fields {
                    if *field_tab == tab {
                        body =
                            body.child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .gap(px(12.0))
                                    .when(*show_label, |row| {
                                        row.child(
                                            text(*label, 12.0, 500, orbit::ink_2(cx), cx)
                                                .flex_1()
                                                .min_w_0(),
                                        )
                                    })
                                    .child(
                                        div()
                                            .min_w_0()
                                            .when(!*show_label, gpui::Styled::flex_1)
                                            .when(*show_label, |control| {
                                                // NumberControl necesita 168 px; la opacidad
                                                // también reserva sitio para el sufijo «%».
                                                control
                                                    .w(px(if *label == "Opacidad" {
                                                        196.0
                                                    } else {
                                                        168.0
                                                    }))
                                                    .flex_none()
                                            })
                                            .child(control.clone())
                                            .when(*label == "Opacidad", |control| {
                                                control.flex().items_center().gap(px(8.0)).child(
                                                    text("%", 12.0, 500, orbit::ink_2(cx), cx),
                                                )
                                            }),
                                    ),
                            );
                    }
                }
                body = self.tab_settings(item, tab, body, cx);
                let content = div()
                    .id(("studio-inspector-card", tab as usize))
                    .child(body);
                card = card.child(content);
                if tab == Tab::Layout {
                    card =
                        card.child(
                            div()
                                .flex()
                                .flex_wrap()
                                .gap(px(8.0))
                                .child(button("duplicate", "Duplicar", cx).on_click(cx.listener(
                                    |this, _, _, cx| {
                                        this.reset_fields();
                                        this.edit(Editor::duplicate, cx);
                                    },
                                )))
                                .child(button("remove-widget", "Eliminar", cx).on_click(
                                    cx.listener(|this, _, _, cx| {
                                        this.reset_fields();
                                        this.edit(Editor::remove, cx);
                                    }),
                                ))
                                .child(button("deselect", "Deseleccionar", cx).on_click(
                                    cx.listener(|this, _, _, cx| {
                                        this.cancel_drag(cx);
                                        this.editor.selected = None;
                                        this.reset_fields();
                                        this.rebuild(cx);
                                    }),
                                )),
                        );
                }
                panel = panel.child(card);
            }
        } else {
            panel = panel.child(div().p(px(16.0)).child(orbit::empty_state(
                "Inspector",
                "Selecciona un widget para editar sus propiedades.",
                cx,
            )));
        }
        panel
    }
    fn obs_settings(cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .child(text(
                "Captura la ventana del overlay en OBS Studio.",
                12.0,
                400,
                orbit::ink_2(cx),
                cx,
            ))
            .child(text(
                "URL de OBS · Próximamente",
                11.0,
                500,
                orbit::ink_3(cx),
                cx,
            ))
    }

    fn preview_stage(&self, cx: &mut Context<Self>) -> gpui::Div {
        let (left, top) = preview_origin(
            self.canvas_size.0,
            self.canvas_size.1,
            self.preview_scale(),
            self.canvas_resolution(),
        );
        let mut stage = div()
            .relative()
            .w(px(self.canvas_resolution().width * self.preview_scale()))
            .h(px(self.canvas_resolution().height * self.preview_scale()))
            .ml(px(left))
            .mt(px(top))
            .flex_none()
            .overflow_hidden()
            .rounded(px(orbit::skin(cx).radius.md))
            .border_1()
            .border_color(gpui::rgba(orbit::line_strong(cx)))
            .bg(linear_gradient(
                140.0,
                linear_color_stop(rgb(orbit::stage(cx).top), 0.0),
                linear_color_stop(rgb(orbit::stage(cx).base), 1.0),
            ));
        for (_, frame) in &self.frames {
            if frame.read(cx).item.visible {
                stage = stage.child(frame.clone());
            }
        }
        stage.child(
            text(
                format!(
                    "{:.0} × {:.0}",
                    self.canvas_resolution().width,
                    self.canvas_resolution().height
                ),
                10.0,
                500,
                orbit::ink_3(cx),
                cx,
            )
            .absolute()
            .bottom(px(14.0))
            .right(px(14.0)),
        )
    }

    fn selected_size(&self, cx: &gpui::App) -> Option<(f32, f32)> {
        let item = self.editor.selected()?;
        self.frames
            .iter()
            .find(|(id, _)| *id == item.id)
            .map(|(_, frame)| {
                let frame = frame.read(cx);
                let (width, height) = frame.renderer.read(cx).frame_size();
                (width * frame.content_scale, height * frame.content_scale)
            })
    }
    fn preview_footer(&self, cx: &mut Context<Self>) -> gpui::Div {
        let selection = match (self.editor.selected(), self.selected_size(cx)) {
            (Some(item), Some((width, height))) => {
                format!("x {} · y {} · {} × {}", item.x, item.y, width, height)
            }
            _ => "Sin selección".into(),
        };
        div()
            .min_h(px(39.0))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(8.0))
            .child(Self::toolbar_zoom_out_control(cx))
            .child(self.toolbar_zoom_label(cx))
            .child(Self::toolbar_zoom_in_control(cx))
            .when_some(self.resolution_choice.clone(), |row, choice| {
                row.child(choice)
            })
            .child(
                orbit::mono_text(selection, 11.0, orbit::ink_2(cx), cx)
                    .min_w_0()
                    .whitespace_nowrap()
                    .overflow_hidden()
                    .text_ellipsis(),
            )
            .child(div().flex_1())
            .child(text("Telemetría · — Hz", 11.0, 500, orbit::ink_3(cx), cx))
    }
    fn scenario_controls(&self, cx: &mut Context<Self>) -> gpui::Div {
        let kind = self
            .editor
            .selected()
            .map_or(Kind::Standings, |item| item.settings.kind());
        let snapshot = self.preview_snapshot(kind);
        let lap = snapshot
            .state
            .player_car()
            .and_then(|car| car.laps.current());
        let total = snapshot.state.session.laps_total.current();
        let laps = match (lap, total) {
            (Some(lap), Some(total)) => format!("Vuelta {lap} de {total}"),
            (Some(lap), None) => format!("Vuelta {lap}"),
            _ => "Vuelta —".into(),
        };
        let mut row = div()
            .flex()
            .flex_wrap()
            .items_center()
            .gap(px(6.0))
            .min_w_0()
            .child(text("Probar con", 11.0, 500, orbit::ink_3(cx), cx));
        for (index, scenario) in scenes::Scenario::ALL.into_iter().enumerate() {
            let label = scenario.label();
            let first = self
                .photos
                .iter()
                .position(|p| scenario.matches(&p.snapshot));
            row = if let Some(first) = first {
                let active = self.example
                    && self
                        .real_photo
                        .is_some_and(|i| scenario.matches(&self.photos[i].snapshot));
                row.child(
                    orbit::ghost_button(("studio-scenario", index), label, cx)
                        .h(px(30.0))
                        .px(px(8.0))
                        .flex_none()
                        .aria_selected(active)
                        .when(active, |b| orbit::nav_active(b, cx))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.cancel_drag(cx);
                            this.example = true;
                            this.real_photo = Some(
                                this.photo_choice
                                    .as_ref()
                                    .and_then(|c| c.read(cx).state.selected)
                                    .filter(|i| scenario.matches(&this.photos[*i].snapshot))
                                    .unwrap_or(first),
                            );
                            this.rebuild(cx);
                        })),
                )
            } else {
                row.child(unavailable_scenario(index, label, scenario.reason(), cx))
            };
        }
        if self.example
            && self.real_photo.is_some()
            && let Some(choice) = &self.photo_choice
        {
            row = row.child(div().w(px(150.0)).flex_none().child(choice.clone()));
        }
        row.child(div().flex_1()).child(
            orbit::mono_text(laps, 10.0, orbit::ink_3(cx), cx)
                .whitespace_nowrap()
                .min_w_0()
                .overflow_hidden()
                .text_ellipsis(),
        )
    }
    fn widget_strip(&self, cx: &mut Context<Self>) -> gpui::Div {
        orbit::neo_card(cx)
            .p(px(10.0))
            .gap(px(8.0))
            .flex_none()
            .child(
                div()
                    .flex()
                    .gap(px(8.0))
                    .min_w_0()
                    .child(
                        div()
                            .id("studio-widget-strip")
                            .flex_1()
                            .min_w_0()
                            .overflow_x_scroll()
                            .child(self.widget_list(cx)),
                    )
                    .child(self.widget_actions(cx)),
            )
            .child(self.scenario_controls(cx))
    }

    fn editor_workspace(&mut self, window: &mut Window, cx: &mut Context<Self>) -> gpui::Div {
        self.init_controls(window, cx);
        let stage = self.preview_stage(cx);
        let resolution = self.canvas_resolution();
        let studio = cx.entity().downgrade();
        let drag_target = studio.clone();
        let measure = gpui::canvas(
            move |bounds, _, cx| {
                if let Some(scale) = fitted_scale(
                    bounds.size.width.into(),
                    bounds.size.height.into(),
                    resolution,
                ) {
                    // La entidad aún participa en el prepaint: actualizar al terminar
                    // el frame permite medir también los cambios del inspector.
                    cx.defer(move |cx| {
                        let _ = studio.update(cx, |this, cx| {
                            let size = (bounds.size.width.into(), bounds.size.height.into());
                            this.measure_canvas(size, scale, cx);
                        });
                    });
                }
            },
            move |_, (), window, _| {
                let studio = drag_target.clone();
                let release_target = studio.clone();
                window.on_mouse_event(move |_: &gpui::MouseUpEvent, phase, _, cx| {
                    if phase == gpui::DispatchPhase::Capture {
                        let _ = release_target.update(cx, Studio::finish_nudge);
                    }
                });
                window.on_mouse_event(move |event: &MouseMoveEvent, phase, _, cx| {
                    if phase == gpui::DispatchPhase::Capture {
                        // El gesto sigue aunque el puntero salga del hitbox de Studio.
                        // Una entidad cerrada ya no conserva ningún gesto.
                        let _ = studio.update(cx, |this, cx| this.move_drag(event, cx));
                    }
                });
            },
        )
        .absolute()
        .top_0()
        .left_0()
        .size_full();
        // Sin panel alrededor: solo preview_stage dibuja el marco del propio lienzo (R10.3).
        let canvas = div()
            .id("studio-canvas")
            .flex_1()
            .min_w_0()
            .min_h_0()
            .relative()
            .flex()
            .overflow_scroll()
            .on_scroll_wheel(cx.listener(|this, _, _, cx| this.cancel_drag(cx)))
            .child(measure)
            .child(stage);
        div()
            .flex_1()
            .min_w_0()
            .min_h_0()
            .flex()
            .flex_col()
            .gap(px(self.adapt.gap()))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_h_0()
                    .child(canvas)
                    .child(self.preview_footer(cx)),
            )
            .child(self.widget_strip(cx))
    }
}

impl Render for Studio {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let workspace = self.editor_workspace(window, cx);
        div()
            .id("studio")
            .h_full()
            .min_h_0()
            .flex_1()
            .track_focus(&self.focus)
            .tab_group()
            .min_w_0()
            .flex()
            .flex_col()
            .overflow_hidden()
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, event: &gpui::MouseUpEvent, _, cx| {
                    this.finish_drag(event.position, cx);
                }),
            )
            .on_mouse_up_out(
                MouseButton::Left,
                cx.listener(|this, event: &gpui::MouseUpEvent, _, cx| {
                    this.finish_drag(event.position, cx);
                }),
            )
            .on_key_down(cx.listener(Self::handle_key))
            .on_key_up(cx.listener(|this, event: &gpui::KeyUpEvent, _, cx| {
                if matches!(
                    event.keystroke.key.as_str(),
                    "left" | "right" | "up" | "down"
                ) {
                    this.finish_nudge(cx);
                    cx.stop_propagation();
                }
            }))
            .child(workspace)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn document_shortcuts_use_exact_modifiers() {
        for (stroke, expected) in [
            ("ctrl-z", Some(DocumentKey::History(false))),
            ("ctrl-shift-z", Some(DocumentKey::History(true))),
            ("ctrl-y", Some(DocumentKey::History(true))),
            ("cmd-z", Some(DocumentKey::History(false))),
            ("ctrl-d", Some(DocumentKey::Duplicate)),
            ("ctrl-s", Some(DocumentKey::Save)),
            ("delete", Some(DocumentKey::Remove)),
            ("ctrl-alt-z", None),
            ("ctrl-alt-d", None),
            ("ctrl-shift-d", None),
            ("shift-delete", None),
            ("ctrl-delete", None),
            ("backspace", None),
            ("d", None),
        ] {
            assert_eq!(
                document_key(&gpui::Keystroke::parse(stroke).expect("tecla")),
                expected,
                "{stroke}"
            );
        }
    }
    fn prepared_widget(path: PathBuf) -> Prepared {
        let mut prepared = Prepared::load(path).expect("preparar Studio");
        prepared.editor.add(Kind::Standings).expect("widget");
        prepared
    }
    fn start_preview(studio: &mut Studio, cx: &mut Context<Studio>) {
        let frame = studio.frames[0].1.clone();
        frame.update(cx, |frame, _| {
            frame.drag = Some(Drag {
                pointer: (100.0, 200.0),
                origin: (frame.item.x, frame.item.y),
                preview: (frame.item.x + 80.0, frame.item.y + 40.0),
                scale: frame.preview_scale,
            });
        });
        studio.drag = Some(frame);
    }
    #[test]
    fn real_scene_and_photo_selection_use_same_snapshot_for_all_widgets_without_editing_layout() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
            studio.update(cx, |studio, cx| {
                let layout = studio.editor.layout().clone();
                for index in [0, 11, 12] {
                    studio.real_photo = Some(index);
                    studio.example = true;
                    studio.rebuild(cx);
                    for kind in Kind::ALL {
                        assert!(std::ptr::eq(
                            studio.preview_snapshot(*kind),
                            std::ptr::from_ref(&studio.photos[index].snapshot)
                        ));
                    }
                }
                assert_eq!(studio.editor.layout(), &layout);
                studio.example = false;
                assert!(std::ptr::eq(
                    studio.preview_snapshot(Kind::Standings),
                    std::ptr::from_ref(&studio.snapshot)
                ));
                assert_eq!(
                    Editor::open(file.path.clone()).expect("disk").layout(),
                    &layout
                );
            });
            cx.quit();
        });
    }
    #[test]
    fn resize_preview_freezes_document_and_commit_roundtrips_with_one_undo() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
            studio.update(cx, |studio, cx| {
                let original = studio.editor.layout().clone();
                let frame = studio.frames[0].1.clone();
                let size = frame
                    .read(cx)
                    .item
                    .geometry
                    .resolved(frame.read(cx).renderer.read(cx).wanted_size());
                frame.update(cx, |frame, _| {
                    frame.resize = Some(Resize {
                        pointer: (100.0, 100.0),
                        origin: (frame.item.x, frame.item.y),
                        size,
                        preview: ((frame.item.x, frame.item.y), size),
                        scale: 0.5,
                        handle: vantare_ui::geometry::Handle(-1, -1),
                        locked: true,
                    });
                });
                studio.drag = Some(frame.clone());
                studio.move_drag(
                    &MouseMoveEvent {
                        position: gpui::point(px(130.0), px(120.0)),
                        pressed_button: Some(MouseButton::Left),
                        ..Default::default()
                    },
                    cx,
                );
                let preview = frame.read(cx).resize.as_ref().expect("resize").preview;
                assert_eq!(studio.editor.layout(), &original);
                assert_eq!(
                    Editor::open(file.path.clone())
                        .expect("disk during")
                        .layout(),
                    &original
                );
                assert!(
                    (preview.0.0 + preview.1.width - original.instances[0].x - size.width).abs()
                        < 0.001
                );
                assert!(
                    (preview.0.1 + preview.1.height - original.instances[0].y - size.height).abs()
                        < 0.001
                );
                studio.finish_drag(gpui::point(px(130.0), px(120.0)), cx);
                let next = studio.editor.layout().clone();
                assert_eq!(next.instances[0].geometry.size, Some(preview.1));
                assert_eq!(
                    studio.frames[0].1.read(cx).renderer.read(cx).frame_size(),
                    preview.1.tuple()
                );
                assert_eq!(
                    Editor::open(file.path.clone()).expect("reopen").layout(),
                    &next
                );
                studio.history(false, cx);
                assert_eq!(studio.editor.layout(), &original);
                studio.history(true, cx);
                assert_eq!(studio.editor.layout(), &next);
                studio.history(false, cx);
                studio.history(false, cx);
                assert!(
                    studio.editor.layout().instances.is_empty(),
                    "no history during preview"
                );
            });
            cx.quit();
        });
    }
    #[test]
    fn geometry_edits_keep_dimension_control_identity_and_sync_both_axes() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
            studio.update(cx, |studio, cx| {
                let size = studio.selected_size(cx).expect("size");
                for (title, value, min, max) in [
                    ("Ancho", size.0, 64.0, 3840.0),
                    ("Alto", size.1, 32.0, 2160.0),
                ] {
                    studio.instance_number(
                        title,
                        Tab::Layout,
                        f64::from(value),
                        min,
                        max,
                        1.0,
                        |_, _| {},
                        cx,
                    );
                }
                let controls = studio.size_fields.clone();
                studio.edit(
                    |editor| {
                        editor.edit_selected(|item| {
                            item.geometry.size = Some(vantare_ui::geometry::Size {
                                width: 500.0,
                                height: 700.0,
                            });
                        })
                    },
                    cx,
                );
                assert_eq!(studio.size_fields, controls, "focus-bearing entity remains");
                assert!((controls[0].1.read(cx).range.value - 500.0).abs() < 0.001);
                assert!((controls[1].1.read(cx).range.value - 700.0).abs() < 0.001);
                studio.editor.undo().expect("undo");
                studio.rebuild(cx);
                assert_eq!(studio.size_fields, controls);
                assert!((controls[0].1.read(cx).range.value - f64::from(size.0)).abs() < 0.001);
            });
            cx.quit();
        });
    }
    #[test]
    fn clicking_resize_handle_without_motion_does_not_write_geometry_or_history() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
            studio.update(cx, |studio, cx| {
                let layout = studio.editor.layout().clone();
                let frame = studio.frames[0].1.clone();
                let size = frame
                    .read(cx)
                    .item
                    .geometry
                    .resolved(frame.read(cx).renderer.read(cx).wanted_size());
                frame.update(cx, |frame, _| {
                    frame.resize = Some(Resize {
                        pointer: (100.0, 100.0),
                        origin: (frame.item.x, frame.item.y),
                        size,
                        preview: ((frame.item.x, frame.item.y), size),
                        scale: 1.0,
                        handle: vantare_ui::geometry::Handle(1, 1),
                        locked: true,
                    });
                });
                studio.drag = Some(frame);
                studio.finish_drag(gpui::point(px(100.0), px(100.0)), cx);
                assert_eq!(studio.editor.layout(), &layout);
                studio.editor.undo().expect("undo adding");
                assert!(studio.editor.layout().instances.is_empty());
            });
            cx.quit();
        });
    }
    #[test]
    fn resize_cancel_restores_renderer_and_keyboard_resize_keeps_position() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
            studio.update(cx, |studio, cx| {
                let initial = studio.editor.layout().clone();
                let size = studio.selected_size(cx).expect("size");
                studio.resize_nudge((1, 0), false, cx);
                let n = studio.editor.selected().expect("selected");
                assert_eq!((n.x, n.y), (initial.instances[0].x, initial.instances[0].y));
                assert!((n.geometry.size.expect("size").width - size.0 - 1.0).abs() < 0.001);
                studio.resize_nudge((0, 1), true, cx);
                studio.history(false, cx);
                studio.history(false, cx);
                assert_eq!(studio.editor.layout(), &initial);
                let frame = studio.frames[0].1.clone();
                let start = vantare_ui::geometry::Size {
                    width: size.0,
                    height: size.1,
                };
                frame.update(cx, |f, cx| {
                    f.resize = Some(Resize {
                        pointer: (100.0, 100.0),
                        origin: (f.item.x, f.item.y),
                        size: start,
                        preview: ((f.item.x, f.item.y), start),
                        scale: 1.0,
                        handle: vantare_ui::geometry::Handle(1, 1),
                        locked: false,
                    });
                    f.renderer.update(cx, |renderer, cx| {
                        renderer.set_frame_size(Some(vantare_ui::geometry::Size {
                            width: 1000.0,
                            height: 900.0,
                        }));
                        cx.notify();
                    });
                });
                studio.drag = Some(frame);
                studio.cancel_drag(cx);
                assert_eq!(
                    studio.frames[0].1.read(cx).renderer.read(cx).frame_size(),
                    size
                );
                studio.finish_drag(gpui::point(px(500.0), px(500.0)), cx);
                assert_eq!(studio.editor.layout(), &initial);
            });
            cx.quit();
        });
    }
    #[test]
    fn geometry_changes_cancel_manual_and_fitted_gestures_without_a_document_edit() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            for step in [0, 3, 5] {
                for rail_change in [false, true] {
                    let file = crate::document::tests::File::new();
                    let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
                    studio.update(cx, |studio, cx| {
                        studio.zoom_step = step;
                        let original = studio.editor.layout().clone();
                        start_preview(studio, cx);
                        if rail_change {
                            studio.set_adapt(orbit::Adapt::new(1280.0, 720.0, None, false), cx);
                        } else {
                            studio.measure_canvas((640.0, 360.0), 1.0 / 3.0, cx);
                        }
                        assert!(studio.drag.is_none());
                        assert!(studio.frames[0].1.read(cx).drag.is_none());
                        studio.finish_drag(gpui::point(px(900.0), px(800.0)), cx);
                        assert_eq!(studio.editor.layout(), &original);
                        assert_eq!(
                            Editor::open(file.path.clone()).expect("reabrir").layout(),
                            &original
                        );
                        studio.editor.undo().expect("solo se deshace añadir");
                        assert!(studio.editor.layout().instances.is_empty());
                    });
                }
            }
            cx.quit();
        });
    }
    #[test]
    fn selection_frame_stays_opaque_and_keeps_its_size_when_content_becomes_transparent() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
            let frame = studio.read(cx).frames[0].1.clone();
            let mut sizes = vec![];
            for opacity in [0.0, 0.25, 1.0] {
                frame.update(cx, |frame, cx| {
                    frame.item.opacity = opacity;
                    frame.selected = true;
                    let mut host = frame.element(cx);
                    assert_eq!(host.style().opacity, None);
                    assert_eq!(host.style().border_widths.left, None);
                    let mut outline = CanvasFrame::selection_outline(cx);
                    assert_eq!(outline.style().opacity, None);
                    assert_eq!(outline.style().position, Some(gpui::Position::Absolute));
                    assert_eq!(outline.style().border_widths.left, Some(px(1.0).into()));
                    sizes.push(host.style().size.clone());
                });
            }
            assert!(sizes.windows(2).all(|pair| pair[0] == pair[1]));
            cx.quit();
        });
    }
    #[test]
    fn live_starts_empty_and_uses_only_received_photos_even_during_a_gesture() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
            studio.update(cx, |studio, cx| {
                studio.example = false;
                assert_eq!(studio.snapshot, Snapshot::default());
                for &kind in Kind::ALL {
                    assert_eq!(studio.preview_snapshot(kind), &Snapshot::default());
                }
                let photo = studio.examples[0].1.clone();
                studio.ingest(&photo, cx);
                start_preview(studio, cx);
                let mut newest = photo.clone();
                newest.sequence += 1;
                studio.ingest(&newest, cx);
                assert!(studio.drag.is_some(), "telemetría no cancela el gesto");
                studio.cancel_drag(cx);
                for &kind in Kind::ALL {
                    assert_eq!(studio.preview_snapshot(kind), &newest);
                }
                studio.example = true;
                assert_eq!(studio.preview_snapshot(Kind::Standings), &photo);
            });
            cx.quit();
        });
    }
    #[test]
    fn unavailable_scenarios_explain_their_state_without_offering_button_actions() {
        use gpui::Element;
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            for (index, label) in ["Salida", "Boxes", "Lluvia", "Noche"]
                .into_iter()
                .enumerate()
            {
                let control =
                    unavailable_scenario(index, label, scenes::Scenario::ALL[index].reason(), cx);
                assert_eq!(control.a11y_role(), Some(gpui::Role::Group));
                let mut node = gpui::accesskit::Node::new(gpui::Role::Group);
                control.write_a11y_info(&mut node);
                assert_eq!(
                    node.label(),
                    Some(format!("{label} · Próximamente").as_str())
                );
                assert!(!node.supports_action(gpui::AccessibleAction::Click));
                assert!(!node.supports_action(gpui::AccessibleAction::Focus));
            }
            cx.quit();
        });
    }
    #[test]
    fn keyboard_movement_persists_logical_pixels_and_undo_restores_each_step() {
        let file = crate::document::tests::File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor");
        editor.add(Kind::Standings).expect("widget");
        let original = editor.layout().clone();
        for (stroke, expected) in [("right", (21.0, 20.0)), ("shift-down", (21.0, 28.0))] {
            let key = gpui::Keystroke::parse(stroke).expect("tecla");
            let (direction, shift) = keyboard_nudge(&key).expect("flecha espacial");
            editor
                .edit_selected(|item| {
                    (item.x, item.y) =
                        inspector::nudged_position((item.x, item.y), direction, shift);
                })
                .expect("mover");
            let reopened = Editor::open(file.path.clone()).expect("reabrir");
            let item = &reopened.layout().instances[0];
            assert_eq!((item.x, item.y), expected);
        }
        editor.undo().expect("deshacer 8 px");
        assert_eq!(
            editor.selected().map(|item| (item.x, item.y)),
            Some((21.0, 20.0))
        );
        editor.undo().expect("deshacer 1 px");
        assert_eq!(editor.layout(), &original);
    }
    #[test]
    fn keyboard_movement_does_not_claim_modified_navigation_or_other_keys() {
        for stroke in ["ctrl-right", "alt-left", "super-up", "a", "escape", "tab"] {
            let key = gpui::Keystroke::parse(stroke).expect("tecla");
            assert_eq!(keyboard_nudge(&key), None, "{stroke}");
        }
        for (stroke, direction) in [("left", (-1, 0)), ("up", (0, -1)), ("down", (0, 1))] {
            assert_eq!(
                keyboard_nudge(&gpui::Keystroke::parse(stroke).expect("tecla")),
                Some((direction, false))
            );
        }
    }
    #[test]
    fn fitted_canvas_is_maximal_and_centered_at_four_aspects_and_all_seven_sizes() {
        for resolution in &CANVAS_PRESETS[..4] {
            let resolution = *resolution;
            for (width, height) in [
                (1920.0, 1080.0),
                (1680.0, 1050.0),
                (1512.0, 900.0),
                (1440.0, 900.0),
                (1366.0, 768.0),
                (1280.0, 720.0),
                (2048.0, 1152.0),
            ] {
                for rail_open in [false, true] {
                    let adapt = orbit::Adapt::new(width, height, None, rail_open);
                    let (top, horizontal_padding, bottom) = adapt.padding();
                    let available = (
                        adapt.center_width() - horizontal_padding * 2.0,
                        height - 52.0 - top - bottom - 44.0 - 39.0 - 108.0 - adapt.gap() * 2.0,
                    );
                    let scale = fitted_scale(available.0, available.1, resolution)
                        .expect("cabe en la ventana");
                    let size = (resolution.width * scale, resolution.height * scale);
                    let origin = preview_origin(available.0, available.1, scale, resolution);
                    assert!(
                        (size.0 / size.1 - resolution.width / resolution.height).abs() < 0.000_01
                    );
                    assert!(size.0 <= available.0 + 0.001 && size.1 <= available.1 + 0.001);
                    assert!(
                        (size.0 - available.0).abs() < 0.001
                            || (size.1 - available.1).abs() < 0.001
                    );
                    assert!((origin.0 - (available.0 - size.0) / 2.0).abs() < 0.001);
                    assert!((origin.1 - (available.1 - size.1) / 2.0).abs() < 0.001);
                }
            }
        }
        assert_eq!(fitted_scale(3840.0, 2160.0, CANVAS_PRESETS[0]), Some(2.0));
        assert_eq!(
            preview_origin(800.0, 400.0, 1.0, CANVAS_PRESETS[0]),
            (0.0, 0.0)
        );
    }
    #[test]
    fn default_canvas_follows_overlay_monitor_with_global_positions_unchanged() {
        let secondary = (-2560.0, 0.0, 2560.0, 1600.0);
        let primary = (0.0, 0.0, 1920.0, 1080.0);
        let file = crate::document::tests::File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor");
        editor.add(Kind::Radar).expect("radar");
        editor
            .edit_selected(|item| {
                item.x = -2400.0;
                item.y = 100.0;
            })
            .expect("posición global");
        let previous = editor.layout().clone();
        assert_eq!(
            overlay_monitor(editor.layout(), &[primary, secondary], primary),
            secondary
        );
        assert_eq!(editor.layout(), &previous);
        assert_eq!(
            overlay_monitor(&Layout::default(), &[secondary, primary], primary),
            primary
        );
        editor
            .edit_selected(|item| item.visible = false)
            .expect("ocultar");
        assert_eq!(
            overlay_monitor(editor.layout(), &[primary, secondary], primary),
            primary
        );
    }
    #[test]
    fn selection_caption_stays_inside_canvas_at_ultrawide_fit_without_moving_frame() {
        for y in [0.0, 62.0, 300.0] {
            for scale in [0.1, 0.25, 0.5, 1.0, 1.5] {
                let frame_top = y * scale;
                let caption_top = selection_caption_top(y, scale);
                assert!(frame_top + caption_top >= 0.0);
                assert!((-22.0..=0.0).contains(&caption_top));
                if frame_top >= 22.0 {
                    assert!((caption_top + 22.0).abs() < f32::EPSILON);
                }
            }
        }
    }
    #[test]
    fn canvas_resolution_changes_preview_and_anchors_without_moving_widgets() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
            studio.update(cx, |studio, cx| {
                let instances = studio.editor.layout().instances.clone();
                studio.measure_canvas(
                    (850.0, 500.0),
                    fitted_scale(850.0, 500.0, studio.canvas_resolution()).expect("fit"),
                    cx,
                );
                for resolution in &CANVAS_PRESETS[..4] {
                    studio.set_canvas_resolution(Some(*resolution), cx);
                    assert_eq!(studio.canvas_resolution(), *resolution);
                    assert_eq!(studio.editor.layout().instances, instances);
                    let mut stage = studio.preview_stage(cx);
                    assert_eq!(
                        stage.style().size.width,
                        Some(px(resolution.width * studio.preview_scale()).into())
                    );
                    assert_eq!(
                        stage.style().size.height,
                        Some(px(resolution.height * studio.preview_scale()).into())
                    );
                    let anchored = studio
                        .anchored_position((400.0, 200.0), 2, 2)
                        .expect("anclar");
                    assert_eq!(
                        anchored,
                        (
                            studio.monitor.0 + resolution.width - 400.0,
                            studio.monitor.1 + resolution.height - 200.0
                        )
                    );
                    assert_eq!(studio.frames[0].1.read(cx).item, instances[0]);
                }
            });
            cx.quit();
        });
    }
    #[test]
    fn general_examples_remain_explicit_design_samples_for_every_widget() {
        for (_, snapshot) in example_snapshots().expect("ejemplos") {
            assert_eq!(
                snapshot.state.session.kind.current(),
                Some(&vantare_domain::SessionKind::Race)
            );
        }
    }
    #[test]
    fn launch_catalog_shows_disabled_pro_entries_and_preserves_free_widgets() {
        use crate::shell::navigation::Access;
        use vantare_ipc::control::CatalogAccess;
        for catalog in [
            CatalogAccess::Free,
            CatalogAccess::LaunchV1,
            CatalogAccess::Pro,
        ] {
            let access = Access {
                verified: true,
                catalog,
                ..Access::default()
            };
            let options = catalog_options(Some(access));
            assert_eq!(options.len(), Kind::ALL.len());
            for (&kind, option) in Kind::ALL.iter().zip(&options) {
                assert_eq!(option.enabled, catalog.allows_widget(kind.name()));
                assert_eq!(option.lock_reason, widget_lock(Some(access), kind));
                if !option.enabled {
                    assert_eq!(option.lock_reason, Some("Incluida en Pro"));
                }
            }
            let mut choice = orbit::ChoiceState::new(options, Some(0));
            let radar = Kind::ALL
                .iter()
                .position(|kind| *kind == Kind::Radar)
                .expect("Radar");
            if catalog != CatalogAccess::Pro {
                assert!(!choice.choose(radar), "el ratón no selecciona lo bloqueado");
                choice.open();
                choice.active = Some(radar);
                assert!(
                    !choice.key("enter", false),
                    "el teclado no selecciona lo bloqueado"
                );
                assert_eq!(choice.selected, Some(0));
            }
        }
        assert!(
            catalog_options(Some(Access::default()))
                .iter()
                .all(|option| !option.enabled)
        );
        assert!(catalog_options(None).iter().all(|option| option.enabled));
    }
    #[test]
    fn examples_cover_all_widgets_and_live_never_uses_a_sample() {
        let examples = example_snapshots().expect("muestras incrustadas válidas");
        let live = Snapshot::default();
        assert_eq!(examples.len(), Kind::ALL.len());
        for &kind in Kind::ALL {
            let sample = preview_snapshot(true, &examples, &live, kind);
            assert_ne!(sample, &live, "{kind:?}: muestra vacía");
            if matches!(
                kind,
                Kind::Standings | Kind::Delta | Kind::Relative | Kind::FuelStrategy
            ) {
                assert!(
                    sample.state.player.is_some(),
                    "{kind:?}: ejemplo sin piloto"
                );
            }
            assert!(std::ptr::eq(
                preview_snapshot(false, &examples, &live, kind),
                &raw const live
            ));
            assert!(!std::ptr::eq(sample, &raw const live));
        }
        let fuel = preview_snapshot(true, &examples, &live, Kind::FuelStrategy);
        assert_eq!(
            vantare_domain::fuel_strategy::project(fuel, Preferences::default()).status,
            None
        );
        let delta = preview_snapshot(true, &examples, &live, Kind::Delta);
        assert_eq!(
            vantare_domain::delta::project(delta, Preferences::default()).status,
            vantare_domain::delta::Status::Ready
        );
    }
    #[test]
    fn added_head_to_head_uses_the_renderer_size_and_stays_inside_canvas() {
        let file = crate::document::tests::File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor");
        editor.add(Kind::HeadToHead).expect("añadir H2H");
        let item = editor.layout().instances.last().expect("instancia");
        let renderer = Overlay::configured(&item.settings, Preferences::default());
        assert_eq!(renderer.wanted_size(), (388.0, 158.0));
        assert!(item.x >= 0.0 && item.y >= 0.0);
        assert!(item.x + renderer.wanted_size().0 <= 1920.0);
        assert!(item.y + renderer.wanted_size().1 <= 1080.0);
    }

    #[test]
    fn capture_scene_keeps_every_product_widget_inside_the_canvas() {
        assert_eq!(DEMO_ITEMS[0].0, Kind::Standings);
        for (kind, x, y) in DEMO_ITEMS {
            let overlay = Overlay::configured(&capture_settings(kind), Preferences::default());
            let (width, height) = overlay.wanted_size();
            let scale = demo_content_scale(kind, width);
            assert!(x >= 0.0 && y >= 0.0);
            assert!(x + width * scale <= 1920.0, "{kind:?}: recorte horizontal");
            assert!(y + height * scale <= 1080.0, "{kind:?}: recorte vertical");
        }
    }
    #[test]
    fn demo_delta_keeps_its_document_width_and_aspect_at_each_zoom() {
        let overlay = Overlay::new(Kind::Delta, Preferences::default());
        let (width, height) = overlay.wanted_size();
        let content_scale = demo_content_scale(Kind::Delta, width);
        for scale in [STUDIO_PREVIEW_SCALE, 0.5, 0.75, 1.0, 1.5] {
            assert!((width * content_scale * scale - 400.0 * scale).abs() < 0.001);
            assert!(
                ((width * content_scale) / (height * content_scale) - width / height).abs() < 0.001
            );
            assert!((760.0 + width * content_scale) * scale < 1920.0 * scale);
        }
        assert!((demo_content_scale(Kind::Relative, 304.0) - 1.0).abs() < f32::EPSILON);
    }
    #[test]
    fn fit_keeps_the_whole_overlay_inside_wide_and_tall_canvases() {
        for (width, height) in [(744.0, 731.0), (444.0, 731.0), (1044.0, 300.0)] {
            let scale = fitted_scale(width, height, CANVAS_PRESETS[0]).expect("canvas medido");
            assert!(1920.0 * scale <= width);
            assert!(1080.0 * scale <= height);
            // Standings llega al borde derecho sin salirse del viewport.
            let overlay = Overlay::configured(&demo_standings_settings(), Preferences::default());
            assert_eq!(overlay.wanted_size(), (338.0, 424.0));
            assert!((1560.0 + overlay.wanted_size().0) * scale <= 1920.0 * scale);
        }
        assert_eq!(
            fitted_scale(744.0, 731.0, CANVAS_PRESETS[0]),
            Some(744.0 / 1920.0)
        );
        for (width, height) in [
            (0.0, 10.0),
            (-1.0, 44.0),
            (f32::NAN, 900.0),
            (800.0, f32::INFINITY),
        ] {
            assert_eq!(fitted_scale(width, height, CANVAS_PRESETS[0]), None);
        }
    }
    #[test]
    fn visibility_is_persisted_and_undoable_without_changing_selection() {
        let file = crate::document::tests::File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor");
        editor.add(Kind::Radar).expect("radar");
        let selected = editor.selected.clone();
        editor.add(Kind::Standings).expect("standings");
        let id = editor.selected.clone().expect("instancia añadida");
        editor.selected = selected.clone();
        let previous = editor.layout().clone();
        toggle_visibility(&mut editor, &id).expect("ocultar");
        assert_eq!(editor.selected, selected);
        let reopened = Editor::open(file.path.clone()).expect("reabrir");
        assert!(
            reopened
                .layout()
                .instances
                .iter()
                .any(|item| item.id == id && !item.visible)
        );
        assert!(toggle_visibility(&mut editor, "inexistente").is_err());
        assert_eq!(editor.selected, selected);
        editor.undo().expect("deshacer visibilidad");
        assert_eq!(editor.layout(), &previous);
    }

    #[test]
    fn drag_preview_does_not_jump_and_commit_is_one_undoable_edit() {
        let file = crate::document::tests::File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor");
        editor.add(Kind::Radar).expect("añadir");
        let original = editor.layout().clone();
        let mut drag = Drag {
            pointer: (100.0, 200.0),
            origin: (20.0, 20.0),
            preview: (20.0, 20.0),
            scale: 1.0,
        };
        assert!(!drag.update((100.0, 200.0)));
        assert_eq!(drag.preview, (20.0, 20.0));
        assert!(drag.update((150.0, 260.0)));
        assert_eq!(editor.layout(), &original);
        assert!(!drag.update((f32::NAN, 0.0)));
        editor
            .edit_selected(|item| {
                item.x = drag.preview.0;
                item.y = drag.preview.1;
            })
            .expect("mover");
        assert_eq!(
            editor.selected().map(|item| (item.x, item.y)),
            Some((70.0, 80.0))
        );
        editor.undo().expect("deshacer");
        assert_eq!(editor.layout(), &original);
    }
    #[test]
    fn held_arrows_repeat_accelerate_and_commit_once_on_release() {
        // Las distancias enteras son exactas en f32: comparar sus bits conserva esa garantía.
        for (ms, shift, expected) in [
            (0, false, 1.0_f32),
            (299, false, 1.0),
            (330, false, 2.0),
            (930, false, 25.0),
            (1830, false, 149.0),
            (330, true, 16.0),
        ] {
            assert_eq!(
                held_nudge_distance(Duration::from_millis(ms), shift).to_bits(),
                expected.to_bits()
            );
        }
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
            studio.update(cx, |studio, cx| {
                let original = studio.editor.layout().clone();
                let frame = studio.frames[0].1.clone();
                let origin = (frame.read(cx).item.x, frame.read(cx).item.y);
                let renderer = frame.read(cx).renderer.clone();
                studio.held_nudge = Some(HeldNudge {
                    frame: frame.clone(),
                    origin,
                    direction: (1, 0),
                    shift: false,
                    started: Instant::now(),
                });
                for ms in [0, 330, 930, 1830] {
                    studio.tick_nudge(Duration::from_millis(ms), cx);
                    assert_eq!(studio.editor.layout(), &original);
                    assert_eq!(
                        Editor::open(file.path.clone()).expect("disco").layout(),
                        &original
                    );
                    assert_eq!(frame.read(cx).renderer, renderer);
                }
                studio.finish_nudge(cx);
                assert_eq!(
                    studio.editor.selected().expect("selección").x.to_bits(),
                    (origin.0 + 149.0).to_bits()
                );
                studio.finish_nudge(cx); // La liberación también puede llegar desde el marco.
                studio.history(false, cx);
                assert_eq!(studio.editor.layout(), &original);
                studio.editor.undo().expect("añadir");
                assert!(studio.editor.layout().instances.is_empty());
            });
            cx.quit();
        });
    }
    #[test]
    fn opacity_preview_keeps_renderers_and_disk_then_commits_one_undoable_edit() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
            studio.update(cx, |studio, cx| {
                let original = studio.editor.layout().clone();
                let id = studio.editor.selected.clone().expect("selección");
                let frame = studio.frames[0].1.clone();
                let renderer = frame.read(cx).renderer.clone();
                for value in [0.9, 0.5, 0.25, 0.0] {
                    studio.preview_opacity(&id, value, cx);
                    assert_eq!(studio.editor.layout(), &original);
                    assert_eq!(
                        Editor::open(file.path.clone()).expect("disco").layout(),
                        &original
                    );
                    assert_eq!(frame.read(cx).renderer, renderer);
                    assert_eq!(frame.read(cx).opacity_preview, Some(value));
                }
                studio.finish_opacity(cx);
                assert_eq!(studio.frames[0].1, frame);
                assert_eq!(frame.read(cx).renderer, renderer);
                assert_eq!(
                    studio
                        .editor
                        .selected()
                        .expect("selección")
                        .opacity
                        .to_bits(),
                    0.0_f32.to_bits()
                );
                assert_eq!(
                    Editor::open(file.path.clone()).expect("disco").layout(),
                    studio.editor.layout()
                );
                studio.history(false, cx);
                assert_eq!(studio.editor.layout(), &original);
                studio.editor.undo().expect("añadir");
                assert!(studio.editor.layout().instances.is_empty());
            });
            cx.quit();
        });
    }
    #[test]
    fn interrupted_opacity_preview_is_discarded() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
            studio.update(cx, |studio, cx| {
                let original = studio.editor.layout().clone();
                let id = studio.editor.selected.clone().expect("selección");
                studio.preview_opacity(&id, 0.1, cx);
                studio.cancel_drag(cx);
                studio.finish_opacity(cx);
                assert_eq!(studio.editor.layout(), &original);
                assert!(studio.frames[0].1.read(cx).opacity_preview.is_none());
            });
            cx.quit();
        });
    }
    #[test]
    fn click_and_pointer_noise_leave_position_disk_and_history_unchanged() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let studio = cx.new(|cx| Studio::new(prepared_widget(file.path.clone()), cx));
            studio.update(cx, |studio, cx| {
                let original = studio.editor.layout().clone();
                for scale in [0.25, 0.5, 1.0, 1.5] {
                    let frame = studio.frames[0].1.clone();
                    frame.update(cx, |frame, _| {
                        frame.drag = Some(Drag {
                            pointer: (100.0, 100.0),
                            origin: (frame.item.x, frame.item.y),
                            preview: (frame.item.x, frame.item.y),
                            scale,
                        });
                    });
                    studio.drag = Some(frame);
                    studio.finish_drag(gpui::point(px(101.0), px(102.0)), cx);
                    assert_eq!(studio.editor.layout(), &original);
                    assert_eq!(
                        Editor::open(file.path.clone()).expect("disco").layout(),
                        &original
                    );
                }
                studio.editor.undo().expect("solo deshace añadir");
                assert!(studio.editor.layout().instances.is_empty());
            });
            cx.quit();
        });
    }
    #[test]
    fn preview_accepts_negative_positions_rejects_invalid_input_and_bounds_coordinates() {
        let mut drag = Drag {
            pointer: (12.0, 8.0),
            origin: (-200.0, 20.0),
            preview: (-200.0, 20.0),
            scale: 1.0,
        };
        assert!(drag.update((-20.0, 40.0)));
        assert_eq!(drag.preview, (-232.0, 52.0));
        let valid = drag.preview;
        assert!(!drag.update((f32::INFINITY, 0.0)));
        assert!(!drag.update((0.0, f32::NAN)));
        assert_eq!(drag.preview, valid);
        assert!(drag.update((1_000_000.0, -1_000_000.0)));
        assert_eq!(drag.preview, (100_000.0, -100_000.0));
    }

    #[test]
    fn responsive_canvas_drag_persists_and_reloads_at_all_review_sizes() {
        for (width, height) in [(650.0, 540.0), (1000.0, 760.0), (1420.0, 1100.0)] {
            let file = crate::document::tests::File::new();
            let mut editor = Editor::open(file.path.clone()).expect("editor");
            editor.add(Kind::Standings).expect("widget");
            let original = editor.layout().clone();
            let scale = fitted_scale(width, height, CANVAS_PRESETS[0]).expect("canvas");
            let mut drag = Drag {
                pointer: (100.0, 100.0),
                origin: (20.0, 20.0),
                preview: (20.0, 20.0),
                scale,
            };
            assert!(drag.update((100.0 + 48.0 * scale, 100.0 + 62.0 * scale)));
            editor
                .edit_selected(|item| {
                    item.x = drag.preview.0;
                    item.y = drag.preview.1;
                })
                .expect("commit");
            let reopened = Editor::open(file.path.clone()).expect("reload");
            assert_eq!(reopened.layout(), editor.layout());
            let item = &reopened.layout().instances[0];
            assert!((item.x - 68.0).abs() < 0.001);
            assert!((item.y - 82.0).abs() < 0.001);
            editor.undo().expect("undo");
            assert_eq!(editor.layout(), &original);
        }
    }
    #[test]
    fn fitted_canvas_drag_maps_pointer_deltas_to_document_space() {
        let mut drag = Drag {
            pointer: (20.0, 20.0),
            origin: (760.0, 40.0),
            preview: (760.0, 40.0),
            scale: 0.5,
        };
        assert!(drag.update((30.0, 25.0)));
        assert_eq!(drag.preview, (780.0, 50.0));
    }
    #[test]
    fn hidden_capture_without_selection_is_an_explicit_noop() {
        let file = crate::document::tests::File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor vacío");
        assert!(editor.selected.is_none());
        hide_selected_for_capture(&mut editor).expect("no-op sin selección");
        assert!(editor.layout().instances.is_empty());
        editor.add(Kind::Standings).expect("widget");
        hide_selected_for_capture(&mut editor).expect("ocultar");
        assert!(!editor.layout().instances[0].visible);
    }
}

#[cfg(test)]
mod toolbar_status_tests {
    use super::*;
    #[test]
    fn long_save_errors_use_the_same_flexible_clipped_region_as_success() {
        for status in [
            AUTO_SAVED.to_owned(),
            "No se pudo guardar el documento: ".repeat(40),
        ] {
            let mut host = save_status_host(&status, div().child(status.clone()).truncate());
            assert_eq!(host.style().min_size.width, Some(px(0.0).into()));
            assert_eq!(host.style().flex_grow, Some(1.0));
            assert_eq!(host.style().overflow.x, Some(gpui::Overflow::Hidden));
        }
    }
}
