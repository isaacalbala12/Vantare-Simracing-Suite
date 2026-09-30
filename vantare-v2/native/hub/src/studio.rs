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
    Context, Entity, EventEmitter, FocusHandle, IntoElement, MouseButton, MouseMoveEvent, Pixels,
    Point, Render, Window, div, prelude::*, px, rgb,
};
use std::path::PathBuf;
use vantare_domain::{Snapshot, format::Preferences};
use vantare_ui::{Kind, Overlay, Settings, layout::Instance};

pub struct Prepared {
    editor: Editor,
}
impl Prepared {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        Ok(Self {
            editor: Editor::open(path)?,
        })
    }
}
pub struct Studio {
    editor: Editor,
    sidebar: Entity<StudioSidebar>,
    frames: Vec<(String, Entity<CanvasFrame>)>,
    snapshot: Snapshot,
    pub status: String,
    drag: Option<Entity<CanvasFrame>>,
    focus: FocusHandle,
    tabs: Option<Entity<Choice>>,
    catalog: Option<Entity<Choice>>,
    search: Entity<orbit::Input>,
    color: Option<Entity<orbit::Input>>,
    inspector_selection: Option<String>,
    fields: Vec<(Tab, &'static str, gpui::AnyView)>,
    active_tab: Tab,
    inspector_open: bool,
}
/// La shell enlaza esta columna; Studio conserva el documento y sus interacciones.
pub(crate) struct StudioSidebar {
    studio: gpui::WeakEntity<Studio>,
}
impl Render for StudioSidebar {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        match self.studio.update(cx, |studio, cx| {
            studio.init_navigation_controls(window, cx);
            orbit::column("Overlays Studio", env!("CARGO_PKG_VERSION"))
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
            Err(_) => orbit::empty_state("Studio no disponible", "El editor se ha cerrado."),
        }
    }
}
struct Drag {
    pointer: (f32, f32),
    origin: (f32, f32),
    preview: (f32, f32),
}
impl Drag {
    fn update(&mut self, pointer: (f32, f32)) -> bool {
        if !pointer.0.is_finite() || !pointer.1.is_finite() {
            return false;
        }
        self.preview = (
            (self.origin.0 + pointer.0 - self.pointer.0).clamp(-100_000.0, 100_000.0),
            (self.origin.1 + pointer.1 - self.pointer.1).clamp(-100_000.0, 100_000.0),
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
            .left(px(x))
            .top(px(y))
            .w(px(dimensions.0))
            .h(px(dimensions.1))
            .opacity(self.item.opacity)
            .when(self.selected, |s| {
                s.border_1().border_color(rgb(orbit::CARMINE))
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
        self.editor.set_preferences(prefs)?;
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
        let mut studio = Self {
            editor: prepared.editor,
            sidebar,
            frames: vec![],
            snapshot,
            status: "Sin cambios".into(),
            drag: None,
            focus: cx.focus_handle(),
            tabs: None,
            catalog: None,
            search,
            color: None,
            inspector_selection: None,
            fields: vec![],
            active_tab: Tab::Layout,
            inspector_open: true,
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
            let renderer = cx.new(|cx| {
                let mut overlay = Overlay::configured(&item.settings, self.preferences());
                overlay.ingest(&self.snapshot, cx);
                overlay
            });
            let frame = cx.new(|_| CanvasFrame {
                item: item.clone(),
                renderer,
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
        match edit(&mut self.editor) {
            Ok(()) => {
                self.status = "Guardado automáticamente".into();
                self.rebuild(cx);
            }
            Err(error) => {
                self.status = error;
                self.reset_fields();
                self.rebuild(cx);
            }
        }
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
        let mut list = orbit::card_body()
            .child(orbit::eyebrow(format!(
                "Widgets · {}",
                self.editor.layout().instances.len()
            )))
            .child(self.search.clone());
        for (index, item) in self.editor.layout().instances.iter().enumerate() {
            if !format!("{} {}", item.id, item.settings.kind().name())
                .to_lowercase()
                .contains(&query)
            {
                continue;
            }
            matches += 1;
            let id = item.id.clone();
            list = list.child(
                orbit::list_row(
                    ("studio-instance", index),
                    item.settings.kind().name(),
                    &format!(
                        "{} · {} · Eficiencia",
                        item.id,
                        if item.visible { "activo" } else { "oculto" }
                    ),
                    self.editor.selected.as_ref() == Some(&item.id),
                    true,
                )
                .on_click(cx.listener(move |this, _, _, cx| this.select(id.clone(), cx))),
            );
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
            ));
        }
        list
    }
    fn widget_actions(&self, cx: &mut Context<Self>) -> gpui::Div {
        orbit::card_body()
            .when_some(self.catalog.clone(), gpui::ParentElement::child)
            .child(
                button("add-widget", "Añadir widget").on_click(cx.listener(|this, _, _, cx| {
                    let kind = this
                        .catalog
                        .as_ref()
                        .and_then(|catalog| catalog.read(cx).state.selected)
                        .and_then(|index| Kind::ALL.get(index))
                        .copied();
                    if let Some(kind) = kind {
                        this.reset_fields();
                        this.edit(|editor| editor.add(kind), cx);
                    }
                })),
            )
    }
    fn toolbar(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_wrap()
            .items_center()
            .gap(px(orbit::RADIUS_CHIP))
            .child(
                button("undo", "Deshacer")
                    .tab_stop(self.editor.can_undo())
                    .when(!self.editor.can_undo(), |s| s.opacity(orbit::DISABLED))
                    .on_click(cx.listener(|this, _, _, cx| this.history(false, cx))),
            )
            .child(
                button("redo", "Rehacer")
                    .tab_stop(self.editor.can_redo())
                    .when(!self.editor.can_redo(), |s| s.opacity(orbit::DISABLED))
                    .on_click(cx.listener(|this, _, _, cx| this.history(true, cx))),
            )
            .child(
                button("studio-reload", "Recargar").on_click(cx.listener(|this, _, _, cx| {
                    this.reset_fields();
                    this.edit(Editor::reload, cx);
                })),
            )
            .child(
                button("studio-inspector", "Inspector")
                    .aria_selected(self.inspector_open)
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.inspector_open = !this.inspector_open;
                        cx.notify();
                    })),
            )
            .child(orbit::chip("Ajustar · pendiente", orbit::Tone::Neutral))
    }
    fn color_settings(&self, mut panel: gpui::Div, cx: &mut Context<Self>) -> gpui::Div {
        if self.active_tab == Tab::Appearance
            && let Some(color) = &self.color
        {
            let selected = self.editor.selected.clone();
            panel = panel
                .child(orbit::eyebrow("Color del texto"))
                .child(color.clone())
                .child(button("apply-color", "Aplicar color").on_click(cx.listener(
                    move |this, _, _, cx| {
                        if this.editor.selected != selected {
                            return;
                        }
                        let Some(color) = &this.color else {
                            return;
                        };
                        let value = color.read(cx).value.clone();
                        if !inspector::valid_color(&value) {
                            this.status = "Color inválido: usa #RRGGBB".into();
                            cx.notify();
                            return;
                        }
                        this.edit(
                            |editor| {
                                editor.edit_selected(|item| {
                                    if let Settings::RacingFlags(settings) = &mut item.settings {
                                        settings.text_color = value.to_ascii_lowercase();
                                    }
                                })
                            },
                            cx,
                        );
                    },
                )));
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
            panel = panel.child(orbit::eyebrow("Columnas"));
            for (index, column) in columns.iter().enumerate() {
                let selected = item.id.clone();
                panel = panel.child(orbit::setting_row(
                    &column.metric_id,
                    &column.id,
                    orbit::toggle("column-visible", "Mostrar columna", column.enabled, true)
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
                    panel = panel.child(orbit::text(
                        format!("Ancho {w:.0} · Alto {h:.0}"),
                        orbit::SECONDARY,
                        400,
                        orbit::INK_3,
                    ));
                }
                panel = panel
                    .child(orbit::list_row(
                        "resize-pending",
                        "Redimensionar · pendiente",
                        "El documento nativo todavía no guarda dimensiones.",
                        false,
                        false,
                    ))
                    .child(
                        button("front", "Traer al frente")
                            .on_click(cx.listener(|this, _, _, cx| this.edit(Editor::front, cx))),
                    )
                    .child(
                        button("back", "Enviar al fondo")
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
                    ));
                }
            }
        }
        panel
    }
    fn inspector(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut panel = orbit::card_body();
        if let Some(item) = self.editor.selected() {
            panel = panel
                .child(orbit::eyebrow(format!(
                    "{} · {}",
                    item.settings.kind().name(),
                    item.id
                )))
                .when_some(self.tabs.clone(), gpui::ParentElement::child);
            for (tab, title, control) in &self.fields {
                if *tab == self.active_tab {
                    panel = panel.child(orbit::eyebrow(*title)).child(control.clone());
                }
            }
            panel = self.tab_settings(item, panel, cx);
            panel = panel
                .child(
                    button("duplicate", "Duplicar").on_click(cx.listener(|this, _, _, cx| {
                        this.reset_fields();
                        this.edit(Editor::duplicate, cx);
                    })),
                )
                .child(button("remove-widget", "Eliminar").on_click(cx.listener(
                    |this, _, _, cx| {
                        this.reset_fields();
                        this.edit(Editor::remove, cx);
                    },
                )))
                .child(button("deselect", "Deseleccionar").on_click(cx.listener(
                    |this, _, _, cx| {
                        this.cancel_drag(cx);
                        this.editor.selected = None;
                        this.reset_fields();
                        this.rebuild(cx);
                    },
                )));
        } else {
            panel = panel.child(orbit::empty_state(
                "Selecciona un widget",
                "Selecciona un widget para editar sus propiedades.",
            ));
        }
        panel.child(orbit::eyebrow("OBS"))
            .child(orbit::text("Pega esta URL en una fuente «Navegador» de OBS Studio para emitir el overlay que estás editando.", orbit::SECONDARY, 400, orbit::INK_3))
            .child(orbit::list_row("obs-pending", "Copiar URL · pendiente", "El servicio de salida OBS no tiene contrato nativo.", false, false))
    }
}
impl Render for Studio {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.init_controls(window, cx);
        let mut stage = div()
            .relative()
            .w(px(1920.0))
            .h(px(1080.0))
            .bg(rgb(orbit::CANVAS));
        for (_, frame) in &self.frames {
            if frame.read(cx).item.visible {
                stage = stage.child(frame.clone());
            }
        }
        div()
            .id("studio")
            .track_focus(&self.focus)
            .tab_group()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(orbit::RADIUS_CHIP))
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
                if event.keystroke.key == "escape" && this.drag.is_some() {
                    this.cancel_drag(cx);
                    cx.stop_propagation();
                }
            }))
            .child(self.toolbar(cx))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(orbit::RADIUS_CHIP))
                    .child(orbit::chip(&self.status, orbit::Tone::Neutral))
                    .child(orbit::chip("Mock / Live · pendiente", orbit::Tone::Neutral)),
            )
            .child(
                div()
                    .flex()
                    .min_w_0()
                    .gap(px(orbit::RADIUS_CHIP))
                    .child(
                        orbit::card("Lienzo · 1920×1080")
                            .flex_1()
                            .min_w_0()
                            .child(
                                div()
                                    .id("studio-canvas")
                                    .h(px(470.0))
                                    .overflow_scroll()
                                    .child(stage),
                            )
                            .child(orbit::card_body().child(orbit::text(
                                format!(
                                    "{} widgets · {} seleccionado",
                                    self.editor.layout().instances.len(),
                                    usize::from(self.editor.selected().is_some())
                                ),
                                orbit::SECONDARY,
                                400,
                                orbit::INK_3,
                            ))),
                    )
                    .when(self.inspector_open, |body| {
                        body.child(
                            orbit::card("Inspector")
                                .w(px(if self.editor.selected().is_some() {
                                    orbit::COLUMN_W + orbit::FIELD_W
                                } else {
                                    orbit::COLUMN_W
                                }))
                                .flex_shrink_0()
                                .child(
                                    div()
                                        .id("studio-inspector-scroll")
                                        .h(px(540.0))
                                        .overflow_y_scroll()
                                        .child(self.inspector(cx)),
                                ),
                        )
                    }),
            )
    }
}
#[cfg(test)]
mod tests {
    use super::*;
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
}
