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
    Context, Entity, EventEmitter, FocusHandle, FontWeight, IntoElement, MouseButton,
    MouseMoveEvent, PathBuilder, Pixels, Point, Render, SharedString, Window, div,
    linear_color_stop, linear_gradient, prelude::*, px, rgb,
};
use std::path::PathBuf;
use vantare_domain::{Snapshot, format::Preferences};
use vantare_ui::{Kind, Overlay, Settings, layout::Instance};

const STUDIO_PREVIEW_SCALE: f32 = 700.0 / 1920.0;
const PREVIEW_PADDING: f32 = 22.0;
const ZOOM_STEPS: [Option<u16>; 6] = [None, Some(50), Some(75), Some(100), Some(125), Some(150)];
const HUB_CONTENT_MIN_HEIGHT: f32 = 830.0;
const SHELL_HEADER_OVERLAP: f32 = 167.0;
const AUTO_SAVED: &str = "Guardado automáticamente";

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

// El peso ya está en las fuentes Inter estáticas del kit.
fn text(
    content: impl Into<SharedString>,
    size: f32,
    weight: u16,
    color: u32,
    cx: &gpui::App,
) -> gpui::Div {
    orbit::text(content, size, weight.min(800), color, cx).font_weight(FontWeight::NORMAL)
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

fn grip_icon() -> impl IntoElement {
    gpui::canvas(
        |_, _, _| (),
        |bounds, (), window, cx| {
            for x in [3.0, 7.0] {
                for y in [3.2, 7.0, 10.8] {
                    window.paint_quad(gpui::quad(
                        gpui::Bounds::new(
                            bounds.origin + gpui::point(px(x - 0.8), px(y - 0.8)),
                            gpui::size(px(1.6), px(1.6)),
                        ),
                        gpui::Corners::all(px(0.8)),
                        rgb(orbit::ink_muted(cx)),
                        gpui::Edges::default(),
                        gpui::transparent_black(),
                        gpui::BorderStyle::default(),
                    ));
                }
            }
        },
    )
    .size(px(14.0))
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
        .aria_description("No disponible: falta el contrato nativo.")
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

fn stage_highlight(wrap: bool) -> impl IntoElement {
    gpui::canvas(
        |_, _, _| (),
        move |bounds, (), window, cx| {
            // Elipse radial de `overlay-studio-v3.css`: GPUI solo ofrece gradientes lineales.
            const STEPS: u16 = 48;
            const KAPPA: f32 = 0.552_284_8;
            let width = f32::from(bounds.size.width);
            let height = f32::from(bounds.size.height);
            let (radius_x, radius_y, center_x, center_y, opacity) = if wrap {
                // orbit-studio.css: circle at 50% -10%, carmín .1, transparente al 40%.
                let radius = (width * 0.5).hypot(height * 1.1) * 0.4;
                (radius, radius, width * 0.5, -height * 0.1, 0.1)
            } else {
                (
                    width * 0.85 * 0.70,
                    height * 0.75 * 0.70,
                    width * 0.14,
                    height * 0.13,
                    0.23,
                )
            };
            // Bandas sin superposición: el alfa pequeño de 48 elipses apiladas se
            // cuantiza en el atlas de GPUI y altera el color de la referencia CSS.
            for step in 1..=STEPS {
                let outer = f32::from(step) / f32::from(STEPS);
                let inner = f32::from(step - 1) / f32::from(STEPS);
                let alpha = opacity * (1.0 - (outer + inner) * 0.5);
                let mut ring = PathBuilder::fill();
                ring.style = gpui::PathStyle::Fill(
                    gpui::FillOptions::default().with_fill_rule(gpui::FillRule::EvenOdd),
                );
                for fraction in [outer, inner] {
                    if fraction == 0.0 {
                        continue;
                    }
                    let rx = radius_x * fraction;
                    let ry = radius_y * fraction;
                    let at = |x, y| {
                        gpui::point(
                            bounds.origin.x + px(center_x + x),
                            bounds.origin.y + px(center_y + y),
                        )
                    };
                    ring.move_to(at(rx, 0.0));
                    ring.cubic_bezier_to(at(0.0, ry), at(rx, KAPPA * ry), at(KAPPA * rx, ry));
                    ring.cubic_bezier_to(at(-rx, 0.0), at(-KAPPA * rx, ry), at(-rx, KAPPA * ry));
                    ring.cubic_bezier_to(at(0.0, -ry), at(-rx, -KAPPA * ry), at(-KAPPA * rx, -ry));
                    ring.cubic_bezier_to(at(rx, 0.0), at(KAPPA * rx, -ry), at(rx, -KAPPA * ry));
                    ring.close();
                }
                if let Ok(ring) = ring.build() {
                    window.paint_path(
                        ring,
                        rgb(if wrap {
                            orbit::carmine(cx)
                        } else {
                            orbit::stage(cx).accent
                        })
                        .opacity(alpha),
                    );
                }
            }
        },
    )
    .absolute()
    .size_full()
    .top_0()
    .right_0()
    .bottom_0()
    .left_0()
}

// Trazos locales de los SVG de StudioOrbitToolbar y StudioWallpaperPicker.
fn disabled_toolbar_control(id: &'static str, label: &'static str) -> gpui::Stateful<gpui::Div> {
    let icon = gpui::canvas(
        |_, _, _| (),
        move |bounds, (), window, cx| {
            let at = |x, y| gpui::point(bounds.origin.x + px(x), bounds.origin.y + px(y));
            let mut path = PathBuilder::stroke(px(1.4));
            if id == "studio-fullscreen" {
                for (x, y, dx, dy) in [
                    (2.5, 2.5, 1.0, 1.0),
                    (13.5, 2.5, -1.0, 1.0),
                    (13.5, 13.5, -1.0, -1.0),
                    (2.5, 13.5, 1.0, -1.0),
                ] {
                    path.move_to(at(x, y + dy * 2.5));
                    path.line_to(at(x, y + dy));
                    path.curve_to(at(x + dx, y), at(x, y));
                    path.line_to(at(x + dx * 2.5, y));
                }
            } else {
                window.paint_quad(gpui::quad(
                    gpui::Bounds::new(at(1.8, 3.0), gpui::size(px(12.4), px(10.0))),
                    gpui::Corners::all(px(1.6)),
                    gpui::transparent_black(),
                    gpui::Edges::all(px(1.4)),
                    rgb(orbit::ink_4(cx)),
                    gpui::BorderStyle::default(),
                ));
                if id == "studio-background-image" {
                    path.move_to(at(1.8, 10.4));
                    for (x, y) in [(5.3, 7.3), (7.9, 9.6), (10.2, 7.7), (14.2, 11.0)] {
                        path.line_to(at(x, y));
                    }
                    window.paint_quad(gpui::quad(
                        gpui::Bounds::new(at(4.6, 5.0), gpui::size(px(2.0), px(2.0))),
                        gpui::Corners::all(px(1.0)),
                        rgb(orbit::ink_4(cx)),
                        gpui::Edges::default(),
                        gpui::transparent_black(),
                        gpui::BorderStyle::default(),
                    ));
                } else {
                    path.move_to(at(1.8, 6.0));
                    path.line_to(at(14.2, 6.0));
                }
            }
            if let Ok(path) = path.build() {
                window.paint_path(path, rgb(orbit::ink_4(cx)));
            }
        },
    )
    .size(px(16.0));
    div()
        .id(id)
        .role(gpui::Role::Button)
        .aria_label(label)
        .tab_stop(false)
        .size(px(39.0))
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(10.0))
        .child(icon)
}

pub struct Prepared {
    editor: Editor,
}
impl Prepared {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        #[cfg(feature = "parity-capture")]
        let mut editor = Editor::open(path)?;
        #[cfg(not(feature = "parity-capture"))]
        let editor = Editor::open(path)?;
        #[cfg(feature = "parity-capture")]
        if studio_demo_capture() && editor.layout().instances.is_empty() {
            // Mismo documento por defecto que `hub-profile-mock-state.ts`; usa los Settings y Overlay nativos.
            for (kind, x, y) in [
                (Kind::Delta, 760.0, 40.0),
                (Kind::Relative, 40.0, 600.0),
                (Kind::Standings, 1560.0, 40.0),
            ] {
                editor.add(kind)?;
                editor.edit_selected(|item| {
                    item.x = x;
                    item.y = y;
                    if kind == Kind::Standings {
                        item.settings = demo_standings_settings();
                    }
                })?;
            }
            editor.selected = None;
        }
        Ok(Self { editor })
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
    topbar: Entity<StudioTopbar>,
    frames: Vec<(String, Entity<CanvasFrame>)>,
    snapshot: Snapshot,
    status: Result<(), String>,
    drag: Option<Entity<CanvasFrame>>,
    focus: FocusHandle,
    tabs: Option<Entity<Choice>>,
    catalog: Option<Entity<Choice>>,
    catalog_open: bool,
    search: Entity<orbit::Input>,
    color: Option<Entity<orbit::Input>>,
    inspector_selection: Option<String>,
    fields: Vec<(Tab, &'static str, gpui::AnyView)>,
    active_tab: Tab,
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
            studio.init_navigation_controls(window, cx);
            orbit::column(
                "Overlays Studio",
                if studio.demo_profile.is_some() {
                    "v0.3.9"
                } else {
                    env!("CARGO_PKG_VERSION")
                },
                cx,
            )
            .child(
                div()
                    .id("studio-widget-list")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .child(studio.widget_list(cx)),
            )
            .child(studio.widget_actions(cx))
        }) {
            Ok(column) => column,
            Err(_) => orbit::empty_state("Studio no disponible", "El editor se ha cerrado.", cx),
        }
    }
}
/// Observa Studio para que el guardado se repinte también fuera del contenido.
pub(crate) struct StudioTopbar {
    studio: gpui::WeakEntity<Studio>,
}
impl Render for StudioTopbar {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        match self
            .studio
            .update(cx, |studio, cx| studio.topbar_actions(cx))
        {
            Ok(actions) => actions,
            Err(_) => div(),
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
    }
}
impl Studio {
    pub(crate) fn topbar_controls(&self) -> Entity<StudioTopbar> {
        self.topbar.clone()
    }

    fn topbar_actions(&self, cx: &gpui::App) -> gpui::Div {
        let demo = self.demo_profile.is_some();
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
            .flex_none()
            .ml(px(-45.0))
            .child(disabled_topbar_select(
                "studio-profile",
                "Perfil activo",
                profile,
                260.0,
                cx,
            ))
            .child(disabled_topbar_select(
                "studio-performance",
                "Rendimiento del perfil",
                "Heredar de la aplicación",
                210.0,
                cx,
            ))
            .child(
                orbit::chip(
                    if demo {
                        "NIVEL EFECTIVO: EQUILIBRADO"
                    } else {
                        "NIVEL EFECTIVO: NO DISPONIBLE"
                    },
                    orbit::Tone::Reference,
                    cx,
                )
                .w(px(190.0)),
            )
            .child(
                div()
                    .id("studio-save-status")
                    .role(gpui::Role::Status)
                    .aria_label(status.to_owned())
                    .h(px(39.0))
                    .px(px(16.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .rounded(px(12.0))
                    .bg(rgb(if self.status.is_ok() {
                        orbit::ink(cx)
                    } else {
                        orbit::surface_2(cx)
                    }))
                    .opacity(if self.status.is_ok() { 0.55 } else { 1.0 })
                    .when(self.status.is_ok(), |row| {
                        row.child(text("✓", 13.0, 600, orbit::green(cx), cx))
                    })
                    .child(text(
                        status.to_owned(),
                        13.0,
                        850,
                        if self.status.is_ok() {
                            orbit::ink_4(cx)
                        } else {
                            orbit::red(cx)
                        },
                        cx,
                    )),
            )
    }
    pub(crate) fn context_column(&self) -> Entity<StudioSidebar> {
        self.sidebar.clone()
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
    pub fn new(prepared: Prepared, snapshot: Snapshot, cx: &mut Context<Self>) -> Self {
        let search = cx.new(|cx| orbit::Input::new(String::new(), "Buscar widget…", cx));
        cx.observe(&search, |_, _, cx| cx.notify()).detach();
        let parent = cx.entity();
        let sidebar = cx.new(|cx| {
            cx.observe(&parent, |_, _, cx| cx.notify()).detach();
            StudioSidebar {
                studio: parent.downgrade(),
            }
        });
        let topbar = cx.new(|cx| {
            cx.observe(&parent, |_, _, cx| cx.notify()).detach();
            StudioTopbar {
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
            topbar,
            frames: vec![],
            snapshot,
            status: Ok(()),
            drag: None,
            focus: cx.focus_handle(),
            tabs: None,
            catalog: None,
            catalog_open: false,
            search,
            color: None,
            inspector_selection: None,
            fields: vec![],
            active_tab: Tab::Layout,
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
                overlay.ingest(&self.snapshot, cx);
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
        if self.drag.is_some() {
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
                frame
                    .read(cx)
                    .renderer
                    .clone()
                    .update(cx, |renderer, cx| renderer.ingest(&self.snapshot, cx));
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
    fn init_navigation_controls(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.tabs.is_none() {
            cx.observe_window_activation(window, |this, window, cx| {
                if !window.is_window_active() {
                    this.cancel_drag(cx);
                }
            })
            .detach();
            let tabs = cx.new(|cx| {
                Choice::new(
                    "Inspector",
                    ChoiceKind::Tabs,
                    Tab::ALL
                        .iter()
                        .map(|tab| OptionItem::new(tab.label()))
                        .collect(),
                    Some(0),
                    window,
                    cx,
                )
            });
            cx.subscribe(&tabs, |this, _, event: &ChoiceChanged, cx| {
                if let Some(tab) = Tab::ALL.get(event.0) {
                    this.active_tab = *tab;
                    cx.notify();
                }
            })
            .detach();
            self.tabs = Some(tabs);
        }
        if self.catalog.is_none() {
            let catalog = cx.new(|cx| {
                Choice::new(
                    "Tipo de widget",
                    ChoiceKind::Dropdown,
                    Kind::ALL
                        .iter()
                        .map(|kind| OptionItem::new(kind.name()))
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
            f64::from(item.opacity),
            0.0,
            1.0,
            0.05,
            |item, v| item.opacity = v as f32,
            cx,
        );
        let visible = cx.new(|cx| Checkbox::new("Visible", item.visible, cx));
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
        self.fields.push((Tab::Behavior, "Visible", visible.into()));
        for field in inspector::fields(&item.settings) {
            let (tab, title) = (field.tab, field.title);
            let view = Self::setting_control(item.id.clone(), field, window, cx);
            self.fields.push((tab, title, view));
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
                let control = cx.new(|cx| Checkbox::new(field.title, value, cx));
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
                NumberKind::Stepper,
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
        self.fields.push((tab, title, control.into()));
    }
    fn widget_list(&self, cx: &mut Context<Self>) -> gpui::Div {
        let query = self.search.read(cx).value.to_lowercase();
        let mut matches = 0;
        let mut list = div()
            .flex()
            .flex_col()
            .py(px(12.0))
            .child(
                orbit::eyebrow(
                    format!("Widgets  {}", self.editor.layout().instances.len()),
                    cx,
                )
                .pl(px(4.0)),
            )
            .child(
                div()
                    .relative()
                    .h(px(28.0))
                    .flex()
                    .flex_col()
                    .mt(px(8.0))
                    .mb(px(8.0))
                    .child(self.search.clone())
                    .when(query.is_empty(), |search| {
                        search.child(
                            text("Buscar widget...", 12.5, 400, orbit::ink_muted(cx), cx)
                                .absolute()
                                .left(px(14.0))
                                .top(px(5.0)),
                        )
                    }),
            );
        for (index, item) in self.editor.layout().instances.iter().enumerate() {
            if !format!("{} {}", item.id, item.settings.kind().name())
                .to_lowercase()
                .contains(&query)
            {
                continue;
            }
            matches += 1;
            list = list.child(self.widget_row(index, item, cx));
        }
        if matches == 0 {
            list = list.child(orbit::empty_state(
                if query.is_empty() {
                    "Sin widgets"
                } else {
                    "Sin resultados"
                },
                if query.is_empty() {
                    "Añade un widget para empezar."
                } else {
                    "Prueba otra búsqueda."
                },
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
        // El harness Wails deja el cursor sobre relative sin seleccionarlo.
        let demo_hover = self.demo_profile.is_some() && item.settings.kind() == Kind::Relative;
        let hover_group: SharedString = format!("studio-widget-row-{index}").into();
        div()
            .id(("studio-instance", index))
            .role(gpui::Role::Button)
            .aria_label(item.settings.kind().name())
            .tab_index(0)
            .h(px(51.0))
            .mb(px(2.0))
            .px(px(12.0))
            .rounded(px(12.0))
            .group(hover_group.clone())
            .flex()
            .items_center()
            .gap(px(6.0))
            .when(selected || demo_hover, |row| {
                row.bg(gpui::rgba(crate::orbit::legacy_rgba(0xffff_ff06, cx)))
            })
            .hover(|row| row.bg(gpui::rgba(crate::orbit::legacy_rgba(0xffff_ff06, cx))))
            .child(
                div()
                    .w(px(14.0))
                    .flex_none()
                    .child(grip_icon())
                    .opacity(if selected || demo_hover { 0.9 } else { 0.0 })
                    .group_hover(hover_group, |grip| grip.opacity(1.0)),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(text(
                        item.settings.kind().name(),
                        13.0,
                        650,
                        orbit::ink(cx),
                        cx,
                    ))
                    .child(
                        text(
                            format!(
                                "{} · Eficiencia",
                                if item.visible { "activo" } else { "oculto" }
                            ),
                            11.0,
                            400,
                            orbit::ink_3(cx),
                            cx,
                        )
                        .mt(px(3.0)),
                    ),
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
            .on_click(cx.listener(move |this, _, _, cx| this.select(id.clone(), cx)))
    }
    fn widget_actions(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_col()
            .pt(px(13.0))
            .border_t_1()
            .border_color(gpui::rgba(orbit::line(cx)))
            .when(self.catalog_open, |body| {
                body.when_some(self.catalog.clone(), gpui::ParentElement::child)
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
    fn toolbar_background_control(cx: &gpui::App) -> gpui::Stateful<gpui::Div> {
        div()
            .id("studio-background")
            .role(gpui::Role::Button)
            .aria_label("Tema actual · pendiente")
            .tab_stop(false)
            .h(px(32.0))
            .w(px(158.0))
            .px(px(10.0))
            .flex()
            .items_center()
            .justify_between()
            .rounded(px(10.0))
            .border_1()
            .border_color(gpui::rgba(orbit::line_strong(cx)))
            .bg(rgb(orbit::surface_2(cx)))
            .child(text("Tema actual", 12.0, 500, orbit::ink(cx), cx))
            .child(
                gpui::canvas(
                    |_, _, _| (),
                    |bounds, (), window, cx| {
                        let at =
                            |x, y| gpui::point(bounds.origin.x + px(x), bounds.origin.y + px(y));
                        let mut chevron = PathBuilder::stroke(px(1.4));
                        chevron.move_to(at(3.0, 5.0));
                        chevron.line_to(at(7.0, 9.0));
                        chevron.line_to(at(11.0, 5.0));
                        if let Ok(path) = chevron.build() {
                            window.paint_path(path, rgb(orbit::ink_2(cx)));
                        }
                    },
                )
                .size(px(14.0)),
            )
    }

    fn toolbar_preview_mode(cx: &gpui::App) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .gap(px(2.5))
            .p(px(4.0))
            .rounded(px(12.0))
            .border_1()
            .border_color(gpui::rgba(orbit::line(cx)))
            .bg(gpui::rgba(crate::orbit::legacy_rgba(0xffff_ff05, cx)))
            .child(
                div()
                    .h(px(29.0))
                    .px(px(10.0))
                    .flex()
                    .items_center()
                    .rounded(px(8.0))
                    .bg(gpui::rgba(crate::orbit::legacy_rgba(0xd52f_4929, cx)))
                    .border_1()
                    .border_color(gpui::rgba(crate::orbit::legacy_rgba(0xf047_5538, cx)))
                    .child(text("Mock", 11.0, 600, orbit::ink(cx), cx)),
            )
            .child(
                div()
                    .h(px(29.0))
                    .px(px(10.0))
                    .flex()
                    .items_center()
                    .child(text("Live", 11.0, 600, orbit::ink_3(cx), cx)),
            )
    }

    fn toolbar_inspector_button(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        div()
            .id("studio-inspector")
            .role(gpui::Role::Button)
            .aria_label("Inspector")
            .aria_selected(self.inspector_open)
            .tab_stop(false)
            .size(px(39.0))
            .px(px(0.0))
            .flex()
            .items_center()
            .justify_center()
            .rounded(px(8.0))
            .when(self.inspector_open, |button| {
                button
                    .bg(gpui::rgba(crate::orbit::legacy_rgba(0xd52f_4924, cx)))
                    .border_1()
                    .border_color(gpui::rgba(crate::orbit::legacy_rgba(0xf047_5538, cx)))
            })
            .child(orbit::icon("i-panel", 16.0, orbit::ink(cx)))
            .on_click(cx.listener(|this, _, _, cx| {
                this.inspector_open = !this.inspector_open;
                cx.notify();
            }))
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
        let label = ZOOM_STEPS[self.zoom_step]
            .map_or_else(|| "Ajustar".to_owned(), |percent| format!("{percent}%"));
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

    fn toolbar(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .h(px(60.0))
            .flex_none()
            .px(px(12.0))
            .flex()
            .items_center()
            .gap(px(8.0))
            .border_b_1()
            .border_color(gpui::rgba(orbit::line(cx)))
            .child(Self::toolbar_background_control(cx))
            .child(disabled_toolbar_control(
                "studio-background-image",
                "Imagen de fondo · pendiente",
            ))
            .child(Self::toolbar_preview_mode(cx))
            .child(disabled_toolbar_control(
                "studio-fullscreen",
                "Pantalla completa · pendiente",
            ))
            .child(
                disabled_toolbar_control("studio-view", "Vista · pendiente")
                    .w(px(34.0))
                    .h(px(31.0))
                    .border_1()
                    .border_color(gpui::rgba(orbit::line(cx)))
                    .bg(gpui::rgba(crate::orbit::legacy_rgba(0xffff_ff06, cx))),
            )
            .child(div().flex_1())
            .child(self.toolbar_inspector_button(cx))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(2.5))
                    .child(Self::toolbar_zoom_out_control(cx))
                    .child(self.toolbar_zoom_label(cx))
                    .child(Self::toolbar_zoom_in_control(cx)),
            )
    }
    fn color_settings(&self, mut panel: gpui::Div, cx: &mut Context<Self>) -> gpui::Div {
        if self.active_tab == Tab::Appearance
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
        &self,
        item: &Instance,
        mut panel: gpui::Div,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        if self.active_tab == Tab::Content
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
        mut panel: gpui::Div,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        match self.active_tab {
            Tab::Layout => {
                let size = self
                    .frames
                    .iter()
                    .find(|(id, _)| *id == item.id)
                    .map(|(_, frame)| frame.read(cx).renderer.read(cx).wanted_size());
                if let Some((w, h)) = size {
                    panel = panel.child(text(
                        format!("Ancho {w:.0} · Alto {h:.0}"),
                        orbit::SECONDARY,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ));
                }
                panel = panel
                    .child(orbit::list_row(
                        "resize-pending",
                        "Redimensionar · pendiente",
                        "El documento nativo todavía no guarda dimensiones.",
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
                panel = panel.child(orbit::list_row(
                    "visibility-rules-pending",
                    "Reglas de visibilidad · pendiente",
                    "Por sesión, foco del juego y condiciones.",
                    false,
                    false,
                    cx,
                ));
            }
            Tab::Content | Tab::Appearance => {
                panel = self.color_settings(panel, cx);
                panel = self.column_settings(item, panel, cx);

                for (index, pending) in inspector::pending(&item.settings).into_iter().enumerate() {
                    panel = panel.child(orbit::list_row(
                        ("pending-setting", index),
                        &pending,
                        "",
                        false,
                        false,
                        cx,
                    ));
                }
                if self
                    .fields
                    .iter()
                    .all(|(tab, _, _)| *tab != self.active_tab)
                {
                    panel = panel.child(orbit::empty_state(
                        "Sin ajustes disponibles",
                        "El widget conserva su configuración nativa.",
                        cx,
                    ));
                }
            }
        }
        panel
    }
    fn inspector(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut panel = div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .px(px(16.0))
            .py(px(20.0));
        if let Some(item) = self.editor.selected() {
            panel = panel
                .child(orbit::eyebrow(
                    format!("{} · {}", item.settings.kind().name(), item.id),
                    cx,
                ))
                .when_some(self.tabs.clone(), gpui::ParentElement::child);
            for (tab, title, control) in &self.fields {
                if *tab == self.active_tab {
                    panel = panel
                        .child(orbit::eyebrow(*title, cx))
                        .child(control.clone());
                }
            }
            panel = self.tab_settings(item, panel, cx);
            panel = panel
                .child(button("duplicate", "Duplicar", cx).on_click(cx.listener(
                    |this, _, _, cx| {
                        this.reset_fields();
                        this.edit(Editor::duplicate, cx);
                    },
                )))
                .child(
                    button("remove-widget", "Eliminar", cx).on_click(cx.listener(
                        |this, _, _, cx| {
                            this.reset_fields();
                            this.edit(Editor::remove, cx);
                        },
                    )),
                )
                .child(
                    button("deselect", "Deseleccionar", cx).on_click(cx.listener(
                        |this, _, _, cx| {
                            this.cancel_drag(cx);
                            this.editor.selected = None;
                            this.reset_fields();
                            this.rebuild(cx);
                        },
                    )),
                );
        } else {
            panel = div().h(px(77.0)).p(px(18.0)).child(
                text(
                    "Selecciona un widget para editar sus propiedades.",
                    13.5,
                    400,
                    orbit::ink_4(cx),
                    cx,
                )
                .line_height(px(20.25))
                .relative()
                .top(px(-1.0)),
            );
        }
        let url = self
            .demo_profile
            .as_ref()
            .map_or("No disponible · usa captura de ventana", |profile| {
                profile.obs_browser_source_url.as_str()
            });
        div().child(panel).child(div().flex().flex_col().gap(px(8.0))
            .border_t_1().border_color(gpui::rgba(orbit::line(cx)))
            .pt(px(10.0)).pb(px(14.0)).px(px(16.0))
            .child(orbit::eyebrow("OBS", cx))
            .child(text("Pega esta URL en una fuente «Navegador» de OBS Studio para emitir el overlay que estás editando.",
                11.5, 400, orbit::ink_4(cx), cx).line_height(px(16.1)))
            .child(div().h(px(39.0)).px(px(12.0)).flex().items_center().overflow_hidden()
                .rounded(px(orbit::RADIUS_CONTROL)).border_1().border_color(gpui::rgba(orbit::line(cx)))
                .bg(rgb(orbit::surface_2(cx))).child(orbit::mono_text(url, 11.0, orbit::ink_2(cx), cx).whitespace_nowrap()))
            .child(div().flex().flex_wrap().gap(px(8.0))
                .child(orbit::primary_button("copy-obs-url", "", cx).aria_label("Copiar URL · pendiente")
                    .w(px(96.0)).h(px(35.0)).px(px(12.0)).tab_stop(false).cursor_default()
                    .child(text("Copiar URL", 12.0, 600, cx.global::<crate::orbit::theme::Theme>().primary_ink, cx)))
                .child(button("copy-obs-instructions", "", cx).aria_label("Copiar instrucciones · pendiente")
                    .w(px(153.0)).h(px(35.0)).px(px(12.0)).tab_stop(false).cursor_default()
                    .child(text("Copiar instrucciones", 12.0, 600, orbit::ink_3(cx), cx)))))
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
        stage = stage.child(stage_highlight(false));
        for (_, frame) in &self.frames {
            if frame.read(cx).item.visible {
                stage = stage.child(frame.clone());
            }
        }
        stage.child(
            text("1920 × 1080", 10.0, 500, orbit::ink_3(cx), cx)
                .absolute()
                .top(px(14.0))
                .right(px(14.0)),
        )
    }

    fn preview_footer(&self, cx: &gpui::App) -> gpui::Div {
        let count = self.editor.layout().instances.len();
        div()
            .h(px(39.0))
            .flex_none()
            .px(px(40.0))
            .flex()
            .items_center()
            .justify_between()
            .border_t_1()
            .border_color(gpui::rgba(orbit::line(cx)))
            .child(
                text("Lienzo · 1920×1080", 11.0, 500, orbit::ink_muted(cx), cx)
                    .font_family(crate::orbit::mono_family(cx)),
            )
            .child(
                text(
                    format!(
                        "{count} widgets · {} seleccionado",
                        usize::from(self.editor.selected().is_some())
                    ),
                    11.0,
                    500,
                    orbit::ink_muted(cx),
                    cx,
                )
                .font_family(crate::orbit::mono_family(cx)),
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
            .bg(rgb(orbit::canvas(cx)))
            .child(stage_highlight(true))
            .child(measure)
            .child(stage);
        let left = div()
            .flex_1()
            .min_w_0()
            .min_h_0()
            .flex()
            .flex_col()
            .child(self.toolbar(cx))
            .child(canvas)
            .child(self.preview_footer(cx));
        let mut workspace = div()
            .flex_1()
            .min_w_0()
            .min_h_0()
            .flex()
            .bg(rgb(orbit::canvas(cx)))
            .child(left);
        if self.inspector_open {
            workspace = workspace.child(
                div()
                    .w(px(320.0))
                    .h_full()
                    .flex_none()
                    .flex()
                    .flex_col()
                    .bg(rgb(orbit::column_bg(cx)))
                    .border_l_1()
                    .border_color(gpui::rgba(orbit::line(cx)))
                    .child(
                        div()
                            .id("studio-inspector-scroll")
                            .flex_1()
                            .min_h_0()
                            .overflow_y_scroll()
                            .child(self.inspector(cx)),
                    ),
            );
        }
        workspace
    }
}

impl Render for Studio {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let workspace = self.editor_workspace(window, cx);
        div()
            .id("studio")
            .min_h(px(HUB_CONTENT_MIN_HEIGHT))
            .mt(px(-SHELL_HEADER_OVERLAP))
            .mx(px(-32.0))
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
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                let key = &event.keystroke;
                if key.key == "escape" && this.drag.is_some() {
                    this.cancel_drag(cx);
                    cx.stop_propagation();
                } else if key.modifiers.control || key.modifiers.platform {
                    if key.key.eq_ignore_ascii_case("z") {
                        this.history(key.modifiers.shift, cx);
                        cx.stop_propagation();
                    } else if key.key.eq_ignore_ascii_case("y") {
                        this.history(true, cx);
                        cx.stop_propagation();
                    }
                }
            }))
            .child(workspace)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
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
