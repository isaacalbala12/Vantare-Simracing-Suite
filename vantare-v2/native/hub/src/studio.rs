//! Editor espacial sobre el documento y el renderer compartidos.
use crate::{
    document::Editor,
    inspector::{self, Control, Tab},
    orbit::{
        self, Checkbox, Checked, Choice, ChoiceChanged, ChoiceKind, NumberChanged, NumberControl,
        NumberKind, NumberRange, OptionItem, button,
    },
};
use gpui::{
    Context, Entity, EventEmitter, FocusHandle, IntoElement, MouseButton, MouseMoveEvent,
    PathBuilder, Pixels, Point, Render, SharedString, Window, div, linear_color_stop,
    linear_gradient, prelude::*, px, rgb,
};
use std::path::PathBuf;
use vantare_domain::{Snapshot, format::Preferences};
use vantare_ui::{Kind, Overlay, Settings, layout::Instance};

const STUDIO_PREVIEW_SCALE: f32 = 700.0 / 1920.0;
const PREVIEW_PADDING: f32 = 22.0;
const ZOOM_STEPS: [Option<u16>; 6] = [None, Some(50), Some(75), Some(100), Some(125), Some(150)];
const AUTO_SAVED: &str = "Guardado";

fn fitted_scale(width: f32, height: f32) -> Option<f32> {
    if !width.is_finite() || !height.is_finite() {
        return None;
    }
    let scale = ((width - PREVIEW_PADDING * 2.0) / 1920.0)
        .min((height - PREVIEW_PADDING * 2.0) / 1080.0)
        .min(1.0);
    (scale > 0.0).then_some(scale)
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
        ..StandingsSettings::default()
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

fn disabled_topbar_select(
    id: &'static str,
    label: &'static str,
    value: &str,
    width: f32,
    cx: &gpui::App,
) -> impl IntoElement {
    div()
        .id(id)
        .role(gpui::Role::ComboBox)
        .aria_label(label)
        .aria_value(value.to_owned())
        .aria_description("Solo está disponible el diseño guardado en este equipo.")
        .tab_stop(false)
        .cursor_default()
        .w(px(width))
        .h(px(39.0))
        .flex_none()
        .px(px(13.0))
        .flex()
        .items_center()
        .justify_between()
        .rounded(px(12.0))
        .border_1()
        .border_color(gpui::rgba(orbit::line(cx)))
        .bg(rgb(orbit::column_bg(cx)))
        .child(text(value.to_owned(), 13.5, 600, orbit::ink_2(cx), cx))
        .child(
            orbit::icon("i-chevron", 12.0, orbit::ink_3(cx)).with_transformation(
                gpui::Transformation::rotate(gpui::radians(std::f32::consts::FRAC_PI_2)),
            ),
        )
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
        vantare_ipc::snapshot_from_json(text)
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
    editor: Editor,
    examples: Vec<(Kind, Snapshot)>,
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
        Ok(Self {
            editor,
            examples: example_snapshots()?,
        })
    }
}

#[cfg(feature = "parity-capture")]
fn studio_demo_capture() -> bool {
    let args: Vec<_> = std::env::args().collect();
    args.iter().any(|arg| arg == "--demo")
        && args
            .windows(2)
            .any(|pair| pair[0] == "--capture" && pair[1] == "studio-base")
}
pub struct Studio {
    editor: Editor,
    sidebar: Entity<StudioSidebar>,
    frames: Vec<(String, Entity<CanvasFrame>)>,
    snapshot: Snapshot,
    examples: Vec<(Kind, Snapshot)>,
    example: bool,
    status: Result<(), String>,
    drag: Option<Entity<CanvasFrame>>,
    focus: FocusHandle,
    catalog: Option<Entity<Choice>>,
    catalog_open: bool,
    search: Entity<orbit::Input>,
    color: Option<Entity<orbit::Input>>,
    inspector_selection: Option<String>,
    fields: Vec<(Tab, &'static str, gpui::AnyView, bool)>,
    inspector_open: bool,
    demo_profile: Option<crate::demo::DemoProfile>,
    fit_scale: f32,
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
                .p(px(32.0))
                .pt(px(0.0))
                .pl(px(0.0))
                .gap(px(12.0))
                .on_key_down(cx.listener(|this, event, _, cx| this.handle_key(event, cx)))
                .child(orbit::scroll_fade(
                    div()
                        .id("studio-inspector-scroll")
                        .flex_1()
                        .min_h_0()
                        .overflow_y_scroll()
                        .child(studio.inspector(cx)),
                    orbit::canvas(cx),
                ))
                .child(
                    orbit::neo_card(cx)
                        .flex_none()
                        .p(px(16.0))
                        .child(Studio::obs_settings(cx)),
                )
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
        self.preview = (
            (self.origin.0 + (pointer.0 - self.pointer.0) / self.scale)
                .clamp(-100_000.0, 100_000.0),
            (self.origin.1 + (pointer.1 - self.pointer.1) / self.scale)
                .clamp(-100_000.0, 100_000.0),
        );
        true
    }
}
struct Started(Point<Pixels>);
/// En GPUI la preview pertenece a una entidad de marco, no al documento ni al widget.
/// Mover invalida solo esta entidad; Overlay conserva su renderer y su foto durante el gesto.
struct CanvasFrame {
    item: Instance,
    renderer: Entity<Overlay>,
    preview_scale: f32,
    content_scale: f32,
    selected: bool,
    focus: FocusHandle,
    drag: Option<Drag>,
}
impl EventEmitter<Started> for CanvasFrame {}
impl Render for CanvasFrame {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let (x, y) = self
            .drag
            .as_ref()
            .map_or((self.item.x, self.item.y), |drag| drag.preview);
        let dimensions = self.renderer.read(cx).wanted_size();
        div()
            .id("widget-frame")
            .absolute()
            .left(px(x * self.preview_scale))
            .top(px(y * self.preview_scale))
            .w(px(dimensions.0 * self.preview_scale * self.content_scale))
            .h(px(dimensions.1 * self.preview_scale * self.content_scale))
            .opacity(self.item.opacity)
            .when(self.selected, |s| {
                s.border_1().border_color(rgb(orbit::carmine(cx)))
            })
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &gpui::MouseDownEvent, window, cx| {
                    this.focus.focus(window, cx);
                    cx.emit(Started(event.position));
                }),
            )
            .child(self.renderer.clone())
            .when(self.selected, |frame| {
                frame.child(
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
                    .top(px(-22.0))
                    .left_0()
                    .px(px(5.0))
                    .bg(rgb(orbit::carmine(cx))),
                )
            })
    }
}
impl Studio {
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
        div()
            .flex()
            .items_center()
            .gap(px(10.0))
            .flex_wrap()
            .min_h(px(44.0))
            .child(disabled_topbar_select(
                "studio-profile",
                "Layout activo",
                profile,
                180.0,
                cx,
            ))
            .child(self.toolbar_preview_mode(cx))
            .child(div().flex_1())
            .child(
                orbit::ghost_button("studio-inspector", "", cx)
                    .aria_label("Mostrar u ocultar inspector")
                    .child(orbit::icon("v-sliders", 18.0, orbit::ink_2(cx)))
                    .when(self.inspector_open, |button| {
                        button.bg(rgb(orbit::surface_3(cx)))
                    })
                    .aria_selected(self.inspector_open)
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.inspector_open = !this.inspector_open;
                        cx.notify();
                    })),
            )
            .child(
                div()
                    .id("studio-save-status")
                    .role(gpui::Role::Status)
                    .aria_label(status.to_owned())
                    .child(text(
                        status.to_owned(),
                        12.0,
                        500,
                        if self.status.is_ok() {
                            orbit::green(cx)
                        } else {
                            orbit::red(cx)
                        },
                        cx,
                    )),
            )
            .child(orbit::disabled(
                button("publish-obs", "Publicar en OBS", cx),
                "Próximamente. Usa captura de ventana en OBS",
            ))
            .child(orbit::disabled(
                orbit::play_button("studio-show-track", "Mostrar en pista", 40.0, false, cx),
                "Próximamente",
            ))
    }
    pub(crate) fn inspector_visible(&self) -> bool {
        self.inspector_open
    }
    pub(crate) fn context_column(&self) -> Entity<StudioSidebar> {
        self.sidebar.clone()
    }
    /// Documento productivo para el resumen de Inicio; no implica ejecución en Desktop.
    pub(crate) fn home_layout(&self) -> &vantare_ui::layout::Layout {
        self.editor.layout()
    }
    pub(crate) fn home_track(&self) -> Option<&str> {
        self.snapshot.state.session.track_name.current().map(String::as_str)
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
    pub fn new(mut prepared: Prepared, snapshot: Snapshot, cx: &mut Context<Self>) -> Self {
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
        let mut studio = Self {
            editor: prepared.editor,
            sidebar,
            frames: vec![],
            snapshot,
            examples: prepared.examples,
            example: true,
            status,
            drag: None,
            focus: cx.focus_handle(),
            catalog: None,
            catalog_open: false,
            search,
            color: None,
            inspector_selection: None,
            fields: vec![],
            inspector_open: true,
            demo_profile,
            fit_scale: STUDIO_PREVIEW_SCALE,
            zoom_step: 0,
        };
        studio.rebuild(cx);
        studio
    }
    fn reset_fields(&mut self) {
        self.inspector_selection = None;
        self.fields.clear();
    }
    fn rebuild(&mut self, cx: &mut Context<Self>) {
        self.drag = None;
        self.frames.clear();
        for item in &self.editor.layout().instances {
            let mut overlay = Overlay::configured(&item.settings, self.preferences());
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
                overlay.ingest(self.preview_snapshot(item.settings.kind()), cx);
                overlay
            });
            let frame = cx.new(|_| CanvasFrame {
                item: item.clone(),
                renderer,
                preview_scale: self.preview_scale(),
                content_scale,
                focus: self.focus.clone(),
                selected: self.editor.selected.as_ref() == Some(&item.id),
                drag: None,
            });
            let id = item.id.clone();
            cx.subscribe(&frame, move |this, frame, event: &Started, cx| {
                this.select(id.clone(), cx);
                frame.update(cx, |frame, cx| {
                    frame.drag = Some(Drag {
                        pointer: (event.0.x.into(), event.0.y.into()),
                        origin: (frame.item.x, frame.item.y),
                        preview: (frame.item.x, frame.item.y),
                        scale: frame.preview_scale,
                    });
                    cx.notify();
                });
                this.drag = Some(frame);
                cx.notify();
            })
            .detach();
            self.frames.push((item.id.clone(), frame));
        }
        cx.notify();
    }
    fn preview_snapshot(&self, kind: Kind) -> &Snapshot {
        preview_snapshot(self.example, &self.examples, &self.snapshot, kind)
    }
    fn preview_scale(&self) -> f32 {
        ZOOM_STEPS[self.zoom_step].map_or(self.fit_scale, |percent| f32::from(percent) / 100.0)
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
        if let Some(frame) = self.drag.take() {
            frame.update(cx, |frame, cx| {
                frame.drag = None;
                cx.notify();
            });
            // Durante el gesto se congelaron todos: restaurar también los no arrastrados.
            for (_, frame) in &self.frames {
                let kind = frame.read(cx).item.settings.kind();
                frame.read(cx).renderer.clone().update(cx, |renderer, cx| {
                    renderer.ingest(self.preview_snapshot(kind), cx);
                });
            }
        }
    }
    fn move_drag(&mut self, event: &MouseMoveEvent, cx: &mut Context<Self>) {
        if let Some(frame) = self.drag.clone() {
            if !event.dragging() {
                self.cancel_drag(cx);
                return;
            }
            frame.update(cx, |frame, cx| {
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
            let mut drag = frame.drag.take()?;
            cx.notify();
            drag.update((pointer.x.into(), pointer.y.into()))
                .then_some((frame.item.id.clone(), drag.preview))
        });
        if let Some((id, (x, y))) = next {
            self.editor.selected = Some(id);
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
        } else {
            self.rebuild(cx);
        }
    }
    fn handle_key(&mut self, event: &gpui::KeyDownEvent, cx: &mut Context<Self>) {
        let key = &event.keystroke;
        if key.key == "escape" && self.drag.is_some() {
            self.cancel_drag(cx);
            cx.stop_propagation();
        } else if key.modifiers.control || key.modifiers.platform {
            if key.key.eq_ignore_ascii_case("z") {
                self.history(key.modifiers.shift, cx);
                cx.stop_propagation();
            } else if key.key.eq_ignore_ascii_case("y") {
                self.history(true, cx);
                cx.stop_propagation();
            }
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
                    Kind::ALL
                        .iter()
                        .map(|kind| OptionItem::new(kind.label()))
                        .collect(),
                    Some(0),
                    window,
                    cx,
                )
            });
            self.catalog = Some(catalog);
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
        self.inspector_selection = Some(item.id.clone());
        self.color = if let Settings::RacingFlags(settings) = &item.settings {
            Some(cx.new(|cx| {
                orbit::Input::new(settings.text_color.clone(), "Color del texto (#RRGGBB)", cx)
            }))
        } else {
            None
        };
        self.instance_number(
            "X",
            Tab::Layout,
            f64::from(item.x),
            -100_000.0,
            100_000.0,
            1.0,
            |item, v| item.x = v as f32,
            cx,
        );
        self.instance_number(
            "Y",
            Tab::Layout,
            f64::from(item.y),
            -100_000.0,
            100_000.0,
            1.0,
            |item, v| item.y = v as f32,
            cx,
        );
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
        set: fn(&mut Instance, f64),
        cx: &mut Context<Self>,
    ) {
        let control = cx.new(|cx| {
            NumberControl::new(
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
            )
        });
        let id = self.editor.selected.clone();
        cx.subscribe(&control, move |this, _, event: &NumberChanged, cx| {
            if this.editor.selected == id {
                this.edit(|editor| editor.edit_selected(|item| set(item, event.0)), cx);
            }
        })
        .detach();
        self.fields.push((tab, title, control.into(), true));
    }
    fn widget_list(&self, cx: &mut Context<Self>) -> gpui::Div {
        let query = self.search.read(cx).value.to_lowercase();
        let mut list = div().flex().flex_wrap().gap(px(6.0));
        let mut matches = 0;
        for (index, item) in self.editor.layout().instances.iter().enumerate() {
            if format!("{} {}", item.id, item.settings.kind().label())
                .to_lowercase()
                .contains(&query)
            {
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
        list
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
        div()
            .id(("studio-instance", index))
            .role(gpui::Role::Button)
            .aria_label(item.settings.kind().label())
            .tab_index(0)
            .h(px(42.0))
            .w(px(146.0))
            .flex_none()
            .border_1()
            .border_color(gpui::rgba(orbit::line(cx)))
            .px(px(8.0))
            .rounded(px(12.0))
            .flex()
            .items_center()
            .gap(px(6.0))
            .when(selected, |row| {
                row.bg(rgb(orbit::surface_3(cx)))
                    .border_color(rgb(orbit::carmine(cx)))
            })
            .hover(|row| row.bg(rgb(orbit::surface_2(cx))))
            .child(orbit::icon("v-studio", 20.0, orbit::ink_2(cx)))
            .child(div().flex_1().min_w_0().child(text(
                item.settings.kind().label(),
                13.0,
                650,
                orbit::ink(cx),
                cx,
            )))
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
            .on_click(cx.listener(move |this, _, _, cx| this.select(id.clone(), cx)))
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
            .rounded_full()
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
                panel = panel.child(orbit::setting_row(
                    &column.metric_id,
                    &column.id,
                    orbit::toggle(
                        "column-visible",
                        "Mostrar columna",
                        column.enabled,
                        true,
                        cx,
                    )
                    .id(("column-visible", index))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if this.editor.selected.as_ref() != Some(&selected) {
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
                    .child(orbit::list_row(
                        "resize-pending",
                        "Tamaño del contenido",
                        "El tamaño lo determina el contenido del widget.",
                        false,
                        false,
                        cx,
                    ))
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
    #[allow(clippy::too_many_lines)] // Compone las cuatro tarjetas con los controles existentes.
    fn inspector(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut panel = div().flex().flex_col().gap(px(12.0));
        if let Some(item) = self.editor.selected() {
            for tab in Tab::ALL {
                let title = tab.label();
                let mut card = orbit::neo_card(cx)
                    .flex_none()
                    .p(px(16.0))
                    .gap(px(8.0))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .gap(px(8.0))
                            .child(orbit::neo_header(
                                title,
                                match tab {
                                    Tab::Layout => "v-studio",
                                    Tab::Content => "v-testing",
                                    Tab::Behavior => "v-gauge",
                                    Tab::Appearance => "v-palette",
                                },
                                cx,
                            ))
                            .when(tab == Tab::Layout, |header| {
                                let size = self.frames.iter().find(|(id, _)| *id == item.id).map(
                                    |(_, frame)| frame.read(cx).renderer.read(cx).wanted_size(),
                                );
                                header.when_some(size, |header, (width, height)| {
                                    header.child(orbit::mono_text(
                                        format!("{width:.0} × {height:.0}"),
                                        11.0,
                                        orbit::ink_3(cx),
                                        cx,
                                    ))
                                })
                            }),
                    );
                if tab == Tab::Content {
                    card = card.child(text(
                        item.settings.kind().label(),
                        22.0,
                        600,
                        orbit::ink(cx),
                        cx,
                    ));
                }
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
                                                control
                                                    .w(px(if *label == "Opacidad" {
                                                        224.0
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
            panel = panel.child(orbit::neo_card(cx).child(orbit::empty_state(
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
            .child(orbit::neo_header("OBS", "v-rec", cx))
            .child(text(
                "Captura la ventana del overlay en OBS Studio.",
                12.0,
                400,
                orbit::ink_2(cx),
                cx,
            ))
            .child(
                orbit::pill("Fuente Navegador · Próximamente", orbit::Tone::Neutral, cx)
                    .self_start(),
            )
    }

    fn preview_stage(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut stage = div()
            .relative()
            .w(px(1920.0 * self.preview_scale()))
            .h(px((1080.0 * self.preview_scale()).ceil() + 1.0))
            .m_auto()
            .flex_none()
            .overflow_hidden()
            .rounded(px(16.0))
            .border_1()
            .border_color(gpui::rgba(orbit::line_strong(cx)))
            .shadow(vec![gpui::BoxShadow {
                color: gpui::rgba(0x0000_008c).into(),
                offset: gpui::point(px(0.0), px(39.0)),
                blur_radius: px(117.0),
                spread_radius: px(0.0),
                inset: false,
            }])
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
            text("1920 × 1080", 10.0, 500, orbit::ink_3(cx), cx)
                .absolute()
                .bottom(px(14.0))
                .right(px(14.0)),
        )
    }

    fn preview_footer(&self, cx: &mut Context<Self>) -> gpui::Div {
        let selection = self.editor.selected().map_or_else(
            || "Sin selección".into(),
            |item| {
                format!(
                    "{} · x {:.0} · y {:.0}",
                    item.settings.kind().label(),
                    item.x,
                    item.y
                )
            },
        );
        div()
            .min_h(px(39.0))
            .flex_none()
            .px(px(16.0))
            .flex()
            .items_center()
            .gap(px(12.0))
            .child(text("Lienzo 1920 × 1080", 11.0, 500, orbit::ink_3(cx), cx))
            .child(text(selection, 11.0, 500, orbit::ink_3(cx), cx))
            .child(div().flex_1())
            .child(Self::toolbar_zoom_out_control(cx))
            .child(self.toolbar_zoom_label(cx))
            .child(Self::toolbar_zoom_in_control(cx))
    }
    fn widget_strip(&self, cx: &mut Context<Self>) -> gpui::Div {
        orbit::neo_card(cx).p(px(10.0)).gap(px(8.0)).flex_none()
            .child(div().flex().gap(px(8.0)).min_w_0()
                .child(div().id("studio-widget-strip").flex_1().min_w_0().overflow_x_scroll().child(self.widget_list(cx)))
                .child(self.widget_actions(cx)))
            .child(div().flex().items_center().gap(px(8.0)).flex_wrap()
                .child(text("Probar con · Próximamente", 12.0, 400, orbit::ink_3(cx), cx))
                .child(div().flex().p(px(4.0)).gap(px(4.0)).rounded_full().bg(rgb(orbit::surface_2(cx)))
                    .children(["Salida", "Carrera", "Boxes", "Lluvia", "Noche"].into_iter().enumerate().map(|(index, label)|
                        orbit::disabled(orbit::ghost_button(("studio-scenario", index), label, cx),
                            "Próximamente: escenarios de prueba; Ejemplo y En vivo controlan la fuente del lienzo"))))
                )
    }

    fn editor_workspace(&mut self, window: &mut Window, cx: &mut Context<Self>) -> gpui::Div {
        self.init_controls(window, cx);
        let stage = self.preview_stage(cx);
        let studio = cx.entity().downgrade();
        let measure = gpui::canvas(
            move |bounds, _, cx| {
                if let Some(scale) =
                    fitted_scale(bounds.size.width.into(), bounds.size.height.into())
                {
                    // La entidad aún participa en el prepaint: actualizar al terminar
                    // el frame permite medir también los cambios del inspector.
                    cx.defer(move |cx| {
                        let _ = studio.update(cx, |this, cx| {
                            if (this.fit_scale - scale).abs() > 0.000_01 {
                                this.fit_scale = scale;
                                if this.zoom_step == 0 {
                                    this.rescale_preview(cx);
                                }
                            }
                        });
                    });
                }
            },
            |_, (), _, _| {},
        )
        .absolute()
        .top_0()
        .left_0()
        .size_full();
        let canvas = div()
            .id("studio-canvas")
            .flex_1()
            .min_w_0()
            .min_h_0()
            .relative()
            .flex()
            .p(px(PREVIEW_PADDING))
            .overflow_scroll()
            .child(measure)
            .child(stage);
        div()
            .flex_1()
            .min_w_0()
            .min_h_0()
            .flex()
            .flex_col()
            .gap(px(14.0))
            .child(
                orbit::neo_card(cx)
                    .p(px(0.0))
                    .gap(px(0.0))
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
            .bg(rgb(orbit::canvas(cx)))
            .on_mouse_move(cx.listener(|this, event, _, cx| this.move_drag(event, cx)))
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
            .on_key_down(cx.listener(|this, event, _, cx| this.handle_key(event, cx)))
            .child(workspace)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
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
            let scale = fitted_scale(width, height).expect("canvas medido");
            assert!(1920.0 * scale <= width - PREVIEW_PADDING * 2.0);
            assert!(1080.0 * scale <= height - PREVIEW_PADDING * 2.0);
            // Standings llega al borde derecho sin salirse del viewport.
            let overlay = Overlay::configured(&demo_standings_settings(), Preferences::default());
            assert_eq!(overlay.wanted_size(), (338.0, 424.0));
            assert!((1560.0 + overlay.wanted_size().0) * scale <= 1920.0 * scale);
        }
        assert_eq!(fitted_scale(744.0, 731.0), Some(STUDIO_PREVIEW_SCALE));
        for (width, height) in [
            (0.0, 10.0),
            (44.0, 44.0),
            (f32::NAN, 900.0),
            (800.0, f32::INFINITY),
        ] {
            assert_eq!(fitted_scale(width, height), None);
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
        assert!(drag.update((100.0, 200.0)));
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
            let scale = fitted_scale(width, height).expect("canvas");
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
}
