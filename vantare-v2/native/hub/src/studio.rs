//! Editor espacial sobre el documento y el renderer compartidos.
mod add_widget;
mod canvas;
mod catalog;
mod examples;
mod inspector_panel;
mod scenes;
mod sessions;
use crate::{
    document::Editor,
    inspector::{self, Control, Tab},
    orbit::{
        self, Checkbox, Checked, Choice, ChoiceChanged, ChoiceKind, NumberChanged, NumberControl,
        NumberFinished, NumberKind, NumberRange, OptionItem, button,
    },
};
use add_widget::widget_icon;
pub(crate) use add_widget::{OpenPlans, PLANS};
use canvas::{CanvasFrame, HeldNudge, client_monitor};
#[cfg(feature = "parity-capture")]
use catalog::{capture_name, capture_session, studio_demo_capture};
use gpui::{
    Context, Entity, EventEmitter, FocusHandle, IntoElement, MouseButton, MouseMoveEvent,
    PathBuilder, Pixels, Point, Render, SharedString, Window, div, linear_color_stop,
    linear_gradient, prelude::*, px, rgb,
};
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime};
use vantare_domain::{Snapshot, format::Preferences};
use vantare_ui::{
    Kind, Overlay, Settings,
    layout::{CanvasResolution, Instance, Layout, Presentation},
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

fn widget_lock(
    access: Option<crate::shell::navigation::Access>,
    kind: Kind,
) -> Option<&'static str> {
    access?.widget_lock(kind) // Workshop y capturas conservan su excepción explícita.
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

pub struct Prepared {
    photos: Vec<scenes::Photo>,
    editor: Editor,
    examples: Vec<(Kind, Snapshot)>,
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
    /// Pestaña de columnas de Standings en edición y escena de su vista previa.
    session_tab: vantare_ui::session::Session,
    session_column: String,
    photo_choice: Option<Entity<Choice>>,
    resolution_choice: Option<Entity<Choice>>,
    monitor: (f32, f32, f32, f32),
    status: Result<(), String>,
    drag: Option<Entity<CanvasFrame>>,
    opacity_preview: Option<(String, f32)>,
    held_nudge: Option<HeldNudge>,
    nudge_task: Option<gpui::Task<()>>,
    focus: FocusHandle,
    /// Catálogo del carril (#1569): búsqueda, categoría, miniaturas, foco y arrastre.
    search: Entity<orbit::Input>,
    catalog_category: usize,
    catalog_previews: Vec<add_widget::CatalogPreview>,
    catalog_focus: Vec<FocusHandle>,
    ghost: Option<add_widget::Ghost>,
    toast: Option<add_widget::Toast>,
    toast_task: Option<gpui::Task<()>>,
    color: Option<Entity<orbit::Input>>,
    inspector_selection: Option<String>,
    size_fields: Vec<(&'static str, Entity<NumberControl>)>,
    fields: Vec<(Tab, &'static str, gpui::AnyView, bool)>,
    demo_profile: Option<crate::demo::DemoProfile>,
    fit_scale: f32,
    canvas_size: (f32, f32),
    zoom_step: usize,
    /// Mostrar en pista cacheado: el render sirve este bool sin E/S; el clic
    /// lo actualiza en el acto y un temporizador lo sincroniza con la
    /// bandeja y otros procesos mediante la firma (mtime, len) (#1567).
    track_showing: bool,
    track_showing_sig: Option<(SystemTime, u64)>,
}
/// La shell enlaza esta columna; Studio conserva el documento y sus interacciones.
pub(crate) struct StudioSidebar {
    studio: gpui::WeakEntity<Studio>,
}
impl Render for StudioSidebar {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        match self.studio.update(cx, |studio, cx| {
            studio.init_controls(window, cx);
            if studio.editor.selected.is_none() {
                // Sin selección el carril es el catálogo y ocupa toda su altura.
                return studio
                    .widget_catalog(cx)
                    .on_key_down(cx.listener(Studio::handle_key));
            }
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

    /// Sincroniza la solicitud de pista por firma; el render no toca disco.
    fn watch_track_showing(cx: &mut Context<Self>) {
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor()
                    .timer(Duration::from_millis(500))
                    .await;
                if this
                    .update(cx, |this, cx| {
                        if this.refresh_track_showing() {
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
    }

    /// Solo reparsea show.json al cambiar su firma (mtime, len). El clic
    /// refresca en el acto y el temporizador comprueba cada 500 ms.
    fn refresh_track_showing(&mut self) -> bool {
        let signature = Presentation::signature(self.editor.layout_path());
        if signature == self.track_showing_sig {
            return false;
        }
        self.track_showing_sig = signature;
        let showing = self.editor.is_showing_on_track();
        if showing == self.track_showing {
            return false;
        }
        self.track_showing = showing;
        true
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
        // El render sirve la caché sin E/S; el clic y el temporizador la
        // sincronizan con la firma (mtime, len) (#1567).
        let showing = self.track_showing;
        let show = orbit::track_toggle_button(
            "studio-show-track",
            if compact {
                ""
            } else {
                orbit::track_toggle_text(showing)
            },
            showing,
            44.0,
            cx,
        )
        .on_click(cx.listener(|studio, _, _, cx| {
            studio.status = studio.editor.toggle_on_track();
            studio.refresh_track_showing();
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
    pub(crate) fn hide_off_track(&self) -> bool {
        self.editor.layout().hide_off_track
    }
    pub(crate) fn set_hide_off_track(
        &mut self,
        enabled: bool,
        cx: &mut Context<Self>,
    ) -> Result<(), String> {
        let result = self.editor.set_hide_off_track(enabled);
        self.status.clone_from(&result);
        cx.notify();
        result
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
        let search = cx.new(|cx| {
            orbit::Input::new(String::new(), "Buscar widget", cx)
                .with_height(px(38.0))
                .with_inset(36.0, 40.0)
        });
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
        // La caché de pista se sirve en el render sin E/S; el clic y el
        // temporizador la sincronizan con la firma (mtime, len) (#1567).
        let track_showing_sig = Presentation::signature(prepared.editor.layout_path());
        let track_showing = prepared.editor.is_showing_on_track();
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
            session_tab: vantare_ui::session::Session::Race,
            session_column: "driverName".into(),
            photo_choice: None,
            resolution_choice: None,
            monitor,
            status,
            drag: None,
            opacity_preview: None,
            held_nudge: None,
            nudge_task: None,
            focus: cx.focus_handle(),
            search,
            catalog_category: 0,
            catalog_previews: vec![],
            catalog_focus: add_widget::ORDER
                .iter()
                .map(|_| cx.focus_handle())
                .collect(),
            ghost: None,
            toast: None,
            toast_task: None,
            color: None,
            inspector_selection: None,
            fields: vec![],
            size_fields: vec![],
            demo_profile,
            fit_scale: STUDIO_PREVIEW_SCALE,
            canvas_size: (700.0, 1080.0 * STUDIO_PREVIEW_SCALE),
            zoom_step: 0,
            track_showing,
            track_showing_sig,
        };
        Self::watch_track_showing(cx);
        #[cfg(feature = "parity-capture")]
        match capture_name().as_deref() {
            Some("studio-error-largo" | "studio-error-largo-sin-carril") => studio.status = Err("No se pudo guardar el documento de QA: otra aplicación modificó el archivo en una ruta extensa. Recarga el diseño para revisar los cambios antes de reintentar. ".repeat(3)),
            Some("studio-manual") => studio.zoom_step = 3,
            Some("studio-en-vivo") => studio.example = false,
            _ => {}
        }
        #[cfg(feature = "parity-capture")]
        if let Some(session) = capture_session() {
            studio.session_tab = session;
        }
        studio.rebuild(cx);
        #[cfg(feature = "parity-capture")]
        studio.apply_catalog_capture(cx);
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
        cx.notify();
    }
    /// Las instancias ocultas no se pintan (`preview_stage`) y tampoco deben
    /// proyectarse en cada `ingest`: antes solo se omitían los bloqueos.
    fn ingest_skips_frame(locked: bool, visible: bool) -> bool {
        locked || !visible
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
            let state = frame.read(cx);
            if Self::ingest_skips_frame(state.lock.is_some(), state.item.visible) {
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
        self.toast = None; // «Deshacer» del aviso solo vale para su alta.
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
    fn toggle_visibility_from_strip(&mut self, id: &str, cx: &mut Context<Self>) {
        self.edit(|editor| toggle_visibility(editor, id), cx);
        self.reset_fields();
    }
    pub(crate) fn handle_shell_key(
        &mut self,
        event: &gpui::KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let damage_shortcut = self.editor.selected().is_some_and(|item| {
            matches!(&item.settings, Settings::CarDamageVisual(settings)
                if settings.key_matches(&event.keystroke))
        });
        if document_key(&event.keystroke).is_some() || damage_shortcut {
            self.focus.focus(window, cx);
            self.handle_key(event, window, cx);
        }
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
#[path = "studio/session_acceptance.rs"]
mod session_acceptance;
#[cfg(test)]
mod tests;
