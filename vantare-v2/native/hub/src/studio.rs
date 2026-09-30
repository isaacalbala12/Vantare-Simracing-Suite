//! Edición local sobre instancias de Overlay, sin persistencia dentro del renderer.
use std::path::{Path, PathBuf};

use gpui::{
    Context, Entity, IntoElement, MouseButton, MouseMoveEvent, Pixels, Point, Render, Window, div,
    prelude::*, px, rgb,
};
use vantare_domain::Snapshot;
use vantare_ui::{Kind, Overlay, efficiency::tokens};

use crate::{
    document::{Editor, Project},
    files,
    shell::button,
};

pub struct Prepared {
    editor: Editor,
    path: PathBuf,
    saved_bytes: Option<Vec<u8>>,
    saved_project: Project,
}

impl Prepared {
    pub fn load(data_dir: &Path) -> Result<Self, String> {
        let path = data_dir.join("native-layouts.json");
        let saved_bytes = match std::fs::metadata(&path) {
            Ok(_) => Some(files::read(&path, files::MAX_DOCUMENT)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(format!("inspeccionar layouts: {e}")),
        };
        let project = match &saved_bytes {
            Some(data) => {
                serde_json::from_slice(data).map_err(|e| format!("layout inválido: {e}"))?
            }
            None => Project::default(),
        };
        let saved_project = project.clone();
        let editor = Editor::new(project)?;
        Ok(Self {
            editor,
            path,
            saved_bytes,
            saved_project,
        })
    }
}

pub struct Studio {
    editor: Editor,
    path: PathBuf,
    saved_bytes: Option<Vec<u8>>,
    saved_project: Project,
    renderers: Vec<(u64, Entity<Overlay>)>,
    snapshot: Snapshot,
    add_kind: usize,
    pub status: String,
    drag: Option<Drag>,
}

struct Drag {
    id: u64,
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
            (self.origin.0 + pointer.0 - self.pointer.0).clamp(0.0, 16_384.0),
            (self.origin.1 + pointer.1 - self.pointer.1).clamp(0.0, 16_384.0),
        );
        true
    }
}

impl Studio {
    pub fn new(prepared: Prepared, snapshot: Snapshot, cx: &mut Context<Self>) -> Self {
        let Prepared {
            editor,
            path,
            saved_bytes,
            saved_project,
        } = prepared;
        let mut studio = Self {
            editor,
            path,
            saved_bytes,
            saved_project,
            renderers: vec![],
            snapshot,
            add_kind: 0,
            status: "Layout nativo local. No está aplicado a overlays.".into(),
            drag: None,
        };
        studio.rebuild(cx);
        studio
    }

    pub fn persist(&mut self) -> Result<(), String> {
        self.editor.project().validate()?;
        let data = serde_json::to_vec_pretty(self.editor.project()).map_err(|e| e.to_string())?;
        if self.saved_bytes.as_deref() != Some(data.as_slice()) {
            files::save(&self.path, &data, self.saved_bytes.as_deref())?;
        }
        self.saved_bytes = Some(data);
        self.saved_project = self.editor.project().clone();
        self.status = "Layouts guardados localmente; aplicación a overlays pendiente".into();
        Ok(())
    }

    fn rebuild(&mut self, cx: &mut Context<Self>) {
        self.drag = None;
        self.renderers.clear();
        let Some(layout) = self.editor.project().active() else {
            self.status = "layout activo no existe".into();
            cx.notify();
            return;
        };
        for item in &layout.widgets {
            match item.kind() {
                Ok(kind) => {
                    let overlay = cx.new(|cx| {
                        let mut overlay = Overlay::new(kind, item.prefs());
                        overlay.ingest(&self.snapshot, cx);
                        overlay
                    });
                    self.renderers.push((item.id, overlay));
                }
                Err(error) => self.status = error,
            }
        }
        cx.notify();
    }

    pub fn ingest(&mut self, snapshot: &Snapshot, cx: &mut Context<Self>) {
        if self.snapshot == *snapshot {
            return;
        }
        self.snapshot = snapshot.clone();
        for (_, renderer) in &self.renderers {
            renderer.update(cx, |overlay, cx| overlay.ingest(snapshot, cx));
        }
        cx.notify();
    }

    fn edit(
        &mut self,
        edit: impl FnOnce(&mut Editor) -> Result<(), String>,
        cx: &mut Context<Self>,
    ) {
        match edit(&mut self.editor) {
            Ok(()) => {
                self.status = "Cambios locales sin guardar".into();
                self.rebuild(cx);
            }
            Err(error) => {
                self.status = error;
                cx.notify();
            }
        }
    }

    fn reload(&mut self, cx: &mut Context<Self>) {
        if self.editor.project() != &self.saved_project {
            self.status = "Guarda o deshaz los cambios locales antes de cargar".into();
            cx.notify();
            return;
        }
        let result = (|| {
            let data = files::read(&self.path, files::MAX_DOCUMENT)?;
            let project: Project = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
            let editor = Editor::new(project.clone())?;
            self.editor = editor;
            self.saved_project = project;
            self.saved_bytes = Some(data);
            Ok::<(), String>(())
        })();
        match result {
            Ok(()) => {
                self.status = "Layouts cargados".into();
                self.rebuild(cx);
            }
            Err(error) => {
                self.status = error;
                cx.notify();
            }
        }
    }

    fn begin_drag(&mut self, id: u64, pointer: Point<Pixels>, cx: &mut Context<Self>) {
        self.editor.selected = Some(id);
        self.drag = self
            .editor
            .selected()
            .filter(|item| !item.locked)
            .map(|item| Drag {
                id,
                pointer: (pointer.x.into(), pointer.y.into()),
                origin: (item.x, item.y),
                preview: (item.x, item.y),
            });
        cx.notify();
    }

    fn move_drag(&mut self, event: &MouseMoveEvent, cx: &mut Context<Self>) {
        if let Some(drag) = &mut self.drag {
            if event.dragging() {
                if !drag.update((event.position.x.into(), event.position.y.into())) {
                    self.status = "Posición de puntero inválida".into();
                }
            } else {
                self.drag = None;
            }
            cx.notify();
        }
    }

    fn finish_drag(&mut self, cx: &mut Context<Self>) {
        if let Some(drag) = self.drag.take() {
            self.editor.selected = Some(drag.id);
            // Un único cambio documental al soltar; la preview no entra en undo/persistencia.
            self.edit(
                |editor| {
                    editor.edit_selected(true, |item| {
                        item.x = drag.preview.0;
                        item.y = drag.preview.1;
                    })
                },
                cx,
            );
        }
    }

    fn controls(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_wrap()
            .gap_2()
            .child(button("new-layout", "Nuevo layout").on_click(
                cx.listener(|this, _, _, cx| this.edit(|editor| editor.new_layout(false), cx)),
            ))
            .child(button("copy-layout", "Duplicar layout").on_click(
                cx.listener(|this, _, _, cx| this.edit(|editor| editor.new_layout(true), cx)),
            ))
            .child(
                button("next-layout", "Cambiar layout")
                    .on_click(cx.listener(|this, _, _, cx| this.edit(Editor::next_layout, cx))),
            )
            .child(
                button("studio-save", "Guardar layouts").on_click(cx.listener(|this, _, _, cx| {
                    if let Err(error) = this.persist() {
                        this.status = error;
                    }
                    cx.notify();
                })),
            )
            .child(
                button("studio-reload", "Cargar layouts")
                    .on_click(cx.listener(|this, _, _, cx| this.reload(cx))),
            )
            .child(
                button("undo", "Deshacer").on_click(cx.listener(|this, _, _, cx| {
                    this.editor.undo();
                    this.rebuild(cx);
                })),
            )
            .child(
                button("redo", "Rehacer").on_click(cx.listener(|this, _, _, cx| {
                    this.editor.redo();
                    this.rebuild(cx);
                })),
            )
            .child(
                button("next-kind", "Elegir tipo").on_click(cx.listener(|this, _, _, cx| {
                    this.add_kind = (this.add_kind + 1) % Kind::ALL.len();
                    cx.notify();
                })),
            )
            .child(Kind::ALL[self.add_kind].name())
            .child(
                button("add-widget", "Añadir widget").on_click(cx.listener(|this, _, _, cx| {
                    let kind = Kind::ALL[this.add_kind];
                    this.edit(|editor| editor.add(kind), cx);
                })),
            )
    }

    fn property(
        id: &'static str,
        label: &'static str,
        spatial: bool,
        edit: fn(&mut crate::document::Instance),
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        button(id, label).on_click(cx.listener(move |this, _, _, cx| {
            this.edit(|editor| editor.edit_selected(spatial, edit), cx);
        }))
    }

    fn inspector(&self, cx: &mut Context<Self>) -> gpui::Div {
        let selected = self.editor.selected();
        div()
            .flex()
            .flex_wrap()
            .gap_2()
            .child(selected.map_or_else(
                || "Selecciona una instancia".into(),
                |item| {
                    format!(
                        "{} #{} · x {} y {} · opacidad {} % · {:?}",
                        item.widget, item.id, item.x, item.y, item.opacity, item.session
                    )
                },
            ))
            .child(Self::property(
                "left",
                "X −10",
                true,
                |item| item.x = (item.x - 10.0).max(0.0),
                cx,
            ))
            .child(Self::property(
                "right",
                "X +10",
                true,
                |item| item.x += 10.0,
                cx,
            ))
            .child(Self::property(
                "up",
                "Y −10",
                true,
                |item| item.y = (item.y - 10.0).max(0.0),
                cx,
            ))
            .child(Self::property(
                "down",
                "Y +10",
                true,
                |item| item.y += 10.0,
                cx,
            ))
            .child(Self::property(
                "lock",
                "Bloquear / desbloquear",
                false,
                |item| item.locked = !item.locked,
                cx,
            ))
            .child(Self::property(
                "visible",
                "Mostrar / ocultar",
                false,
                |item| item.visible = !item.visible,
                cx,
            ))
            .child(Self::property(
                "opacity-minus",
                "Opacidad −10",
                false,
                |item| item.opacity = item.opacity.saturating_sub(10),
                cx,
            ))
            .child(Self::property(
                "opacity-plus",
                "Opacidad +10",
                false,
                |item| item.opacity = (item.opacity + 10).min(100),
                cx,
            ))
            .child(Self::property(
                "session",
                "Sesión visible",
                false,
                |item| item.session = item.session.next(),
                cx,
            ))
            .child(Self::property(
                "studio-units",
                "Métrico / Imperial",
                false,
                |item| item.imperial = !item.imperial,
                cx,
            ))
            .child(Self::property(
                "studio-language",
                "ES / EN",
                false,
                |item| item.english = !item.english,
                cx,
            ))
            .child(
                button("front", "Traer al frente")
                    .on_click(cx.listener(|this, _, _, cx| this.edit(Editor::front, cx))),
            )
            .child(
                button("remove-widget", "Eliminar instancia")
                    .on_click(cx.listener(|this, _, _, cx| this.edit(Editor::remove, cx))),
            )
    }
}

impl Render for Studio {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let Some(layout) = self.editor.project().active() else {
            return div().child("layout activo no existe");
        };
        let mut list = div().flex().flex_wrap().gap_2();
        let mut stage = div()
            .relative()
            .w(px(f32::from(layout.width)))
            .h(px(f32::from(layout.height)))
            .bg(rgb(tokens::PANEL));
        for item in &layout.widgets {
            let id = item.id;
            list = list.child(
                div()
                    .id(("instance", id))
                    .role(gpui::Role::Button)
                    .tab_index(0)
                    .border_1()
                    .border_color(rgb(tokens::MUTED))
                    .px_2()
                    .py_1()
                    .cursor_pointer()
                    .child(format!(
                        "{} #{}{}{}",
                        item.widget,
                        id,
                        if item.visible { "" } else { " · oculto" },
                        if item.locked { " · bloqueado" } else { "" }
                    ))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.editor.selected = Some(id);
                        cx.notify();
                    })),
            );
            if !item.visible || !item.session.allows(&self.snapshot) {
                continue;
            }
            if let Some((_, renderer)) = self.renderers.iter().find(|(key, _)| *key == id) {
                let dimensions = renderer.read(cx).wanted_size();
                let (x, y) = self
                    .drag
                    .as_ref()
                    .filter(|drag| drag.id == id)
                    .map_or((item.x, item.y), |drag| drag.preview);
                stage = stage.child(
                    div()
                        .id(("canvas-widget", id))
                        .absolute()
                        .left(px(x))
                        .top(px(y))
                        .w(px(dimensions.0))
                        .h(px(dimensions.1))
                        .opacity(f32::from(item.opacity) / 100.0)
                        .when(self.editor.selected == Some(id), |item| {
                            item.border_1().border_color(rgb(tokens::MUTED))
                        })
                        .on_mouse_down(
                            MouseButton::Left,
                            cx.listener(move |this, event: &gpui::MouseDownEvent, _, cx| {
                                this.begin_drag(id, event.position, cx);
                            }),
                        )
                        .child(renderer.clone()),
                );
            }
        }
        div().size_full().flex().flex_col().gap_2()
            .on_mouse_move(cx.listener(|this, event, _, cx| this.move_drag(event, cx)))
            .on_mouse_up(MouseButton::Left, cx.listener(|this, _, _, cx| this.finish_drag(cx)))
            .on_mouse_up_out(MouseButton::Left, cx.listener(|this, _, _, cx| this.finish_drag(cx)))
            .child(format!("{} · {} × {} · {}", layout.name, layout.width, layout.height,
                if self.editor.project() == &self.saved_project { "guardado / nuevo vacío" } else { "sin guardar" }))
            .child(self.controls(cx)).child(self.status.clone()).child(list).child(self.inspector(cx))
            .child("Mismo renderer que overlays. Tamaño intrínseco; contenido por widget, resize y aplicación al núcleo pendientes.")
            .child(div().id("studio-canvas").flex_1().overflow_scroll().child(stage))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn drag_preview_does_not_jump_and_commit_is_one_undoable_edit() {
        let mut editor = Editor::new(Project::default()).expect("proyecto");
        editor.add(Kind::Radar).expect("añadir");
        let original = editor.project().clone();
        let mut drag = Drag {
            id: 1,
            pointer: (100.0, 200.0),
            origin: (20.0, 20.0),
            preview: (20.0, 20.0),
        };
        assert!(drag.update((100.0, 200.0)));
        assert_eq!(drag.preview, (20.0, 20.0));
        assert!(drag.update((150.0, 260.0)));
        assert_eq!(editor.project(), &original);
        assert!(!drag.update((f32::NAN, 0.0)));
        editor
            .edit_selected(true, |item| {
                item.x = drag.preview.0;
                item.y = drag.preview.1;
            })
            .expect("commit");
        assert_eq!(
            editor.selected().map(|item| (item.x, item.y)),
            Some((70.0, 80.0))
        );
        editor.undo();
        assert_eq!(editor.project(), &original);
    }
}
