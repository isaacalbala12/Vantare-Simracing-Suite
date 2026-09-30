//! Canvas e inspector sobre el renderer y el documento compartidos.
use crate::{
    document::Editor,
    inspector::{self, Control},
    shell::button,
};
use gpui::{
    Context, Entity, IntoElement, MouseButton, MouseMoveEvent, Pixels, Point, Render, Window, div,
    prelude::*, px, rgb,
};
use std::path::PathBuf;
use vantare_domain::{Snapshot, format::Preferences};
use vantare_ui::{Kind, Overlay, efficiency::tokens, layout::Instance};

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
    renderers: Vec<(String, Entity<Overlay>)>,
    snapshot: Snapshot,
    add_kind: usize,
    pub status: String,
    drag: Option<Drag>,
}
struct Drag {
    id: String,
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
impl Studio {
    pub fn preferences(&self) -> Preferences {
        self.editor.layout().preferences
    }

    pub fn set_preferences(
        &mut self,
        prefs: Preferences,
        cx: &mut Context<Self>,
    ) -> Result<(), String> {
        self.editor.set_preferences(prefs)?;
        self.rebuild(cx);
        Ok(())
    }
    pub fn new(prepared: Prepared, snapshot: Snapshot, cx: &mut Context<Self>) -> Self {
        let mut studio = Self {
            editor: prepared.editor,
            renderers: vec![],
            snapshot,
            add_kind: 0,
            status: "Cada edición confirmada guarda el layout común; overlays vigila el archivo."
                .into(),
            drag: None,
        };
        studio.rebuild(cx);
        studio
    }
    fn rebuild(&mut self, cx: &mut Context<Self>) {
        self.drag = None;
        self.renderers.clear();
        for item in &self.editor.layout().instances {
            let renderer = cx.new(|cx| {
                let mut overlay = Overlay::configured(&item.settings, self.preferences());
                overlay.ingest(&self.snapshot, cx);
                overlay
            });
            self.renderers.push((item.id.clone(), renderer));
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
                self.status = "Documento común actualizado; overlays vigila layout.json.".into();
                self.rebuild(cx);
            }
            Err(error) => {
                self.status = error;
                cx.notify();
            }
        }
    }
    fn begin_drag(&mut self, id: String, pointer: Point<Pixels>, cx: &mut Context<Self>) {
        self.editor.selected = Some(id.clone());
        self.drag = self.editor.selected().map(|item| Drag {
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
    fn finish_drag(&mut self, pointer: Point<Pixels>, cx: &mut Context<Self>) {
        if let Some(mut drag) = self.drag.take() {
            if !drag.update((pointer.x.into(), pointer.y.into())) {
                return;
            }
            self.editor.selected = Some(drag.id);
            self.edit(
                |editor| {
                    editor.edit_selected(|item| {
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
            .child(
                button("studio-reload", "Recargar layout").on_click(cx.listener(
                    |this, _, _, cx| {
                        this.edit(Editor::reload, cx);
                    },
                )),
            )
            .child(
                button("undo", "Deshacer")
                    .on_click(cx.listener(|this, _, _, cx| this.edit(Editor::undo, cx))),
            )
            .child(
                button("redo", "Rehacer")
                    .on_click(cx.listener(|this, _, _, cx| this.edit(Editor::redo, cx))),
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
        edit: fn(&mut Instance),
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        button(id, label).on_click(
            cx.listener(move |this, _, _, cx| this.edit(|editor| editor.edit_selected(edit), cx)),
        )
    }
    fn canvas_controls(&self, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .flex_wrap()
            .gap_2()
            .child(self.editor.selected().map_or_else(
                || "Canvas: selecciona una instancia".into(),
                |item| format!("Canvas · {} · x {} y {}", item.id, item.x, item.y),
            ))
            .child(Self::property("left", "X −10", |item| item.x -= 10.0, cx))
            .child(Self::property("right", "X +10", |item| item.x += 10.0, cx))
            .child(Self::property("up", "Y −10", |item| item.y -= 10.0, cx))
            .child(Self::property("down", "Y +10", |item| item.y += 10.0, cx))
    }
    fn inspector(&self, cx: &mut Context<Self>) -> gpui::Div {
        let Some(item) = self.editor.selected() else {
            return div().child("Inspector: selecciona una instancia");
        };
        let mut options = div()
            .flex()
            .flex_col()
            .gap_2()
            .child(format!(
                "{} · {} · visible {} · opacidad {:.0} %",
                item.id,
                item.settings.kind().name(),
                item.visible,
                item.opacity * 100.0
            ))
            .child(Self::property(
                "visible",
                "Mostrar / ocultar",
                |item| item.visible = !item.visible,
                cx,
            ))
            .child(Self::property(
                "opacity-minus",
                "Opacidad −10",
                |item| item.opacity = (item.opacity - 0.1).max(0.0),
                cx,
            ))
            .child(Self::property(
                "opacity-plus",
                "Opacidad +10",
                |item| item.opacity = (item.opacity + 0.1).min(1.0),
                cx,
            ))
            .child(
                button("front", "Traer al frente")
                    .on_click(cx.listener(|this, _, _, cx| this.edit(Editor::front, cx))),
            )
            .child(
                button("remove-widget", "Eliminar instancia")
                    .on_click(cx.listener(|this, _, _, cx| this.edit(Editor::remove, cx))),
            );
        for (control, value) in Control::rows(&item.settings) {
            options = options.child(div().flex().gap_2().child(value).child(
                button(control.label(), control.label()).on_click(cx.listener(
                    move |this, _, _, cx| {
                        this.edit(
                            |editor| editor.edit_selected(|item| control.apply(&mut item.settings)),
                            cx,
                        );
                    },
                )),
            ));
        }
        for pending in inspector::pending(&item.settings) {
            options = options.child(div().opacity(0.5).child(pending));
        }
        options
    }
}
impl Render for Studio {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mut list = div().flex().flex_wrap().gap_2();
        let mut stage = div()
            .relative()
            .w(px(1920.0))
            .h(px(1080.0))
            .bg(rgb(tokens::PANEL));
        for (index, item) in self.editor.layout().instances.iter().enumerate() {
            let id = item.id.clone();
            list = list.child(
                div()
                    .id(("instance", index))
                    .role(gpui::Role::Button)
                    .tab_index(0)
                    .border_1()
                    .border_color(rgb(tokens::MUTED))
                    .px_2()
                    .py_1()
                    .cursor_pointer()
                    .child(format!(
                        "{}{}",
                        id,
                        if item.visible { "" } else { " · oculto" }
                    ))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.editor.selected = Some(id.clone());
                        cx.notify();
                    })),
            );
            if !item.visible {
                continue;
            }
            if let Some((_, renderer)) = self.renderers.iter().find(|(key, _)| *key == item.id) {
                let dimensions = renderer.read(cx).wanted_size();
                let (x, y) = self
                    .drag
                    .as_ref()
                    .filter(|drag| drag.id == item.id)
                    .map_or((item.x, item.y), |drag| drag.preview);
                let id = item.id.clone();
                stage = stage.child(
                    div()
                        .id(("canvas-widget", index))
                        .absolute()
                        .left(px(x))
                        .top(px(y))
                        .w(px(dimensions.0))
                        .h(px(dimensions.1))
                        .opacity(item.opacity)
                        .when(self.editor.selected.as_ref() == Some(&item.id), |item| {
                            item.border_1().border_color(rgb(tokens::MUTED))
                        })
                        .on_mouse_down(
                            MouseButton::Left,
                            cx.listener(move |this, event: &gpui::MouseDownEvent, _, cx| {
                                this.begin_drag(id.clone(), event.position, cx);
                            }),
                        )
                        .child(renderer.clone()),
                );
            }
        }
        div().size_full().flex().flex_col().gap_2()
            .on_mouse_move(cx.listener(|this, event, _, cx| this.move_drag(event, cx)))
            .on_mouse_up(MouseButton::Left, cx.listener(|this, event: &gpui::MouseUpEvent, _, cx| this.finish_drag(event.position, cx)))
            .on_mouse_up_out(MouseButton::Left, cx.listener(|this, event: &gpui::MouseUpEvent, _, cx| this.finish_drag(event.position, cx)))
            .child(self.controls(cx)).child(self.status.clone()).child(list)
            .child(div().flex().flex_1().min_h_0().gap_2()
                .child(div().flex().flex_col().flex_1().min_w_0().gap_2()
                    .child(self.canvas_controls(cx))
                    .child("Canvas 1920 × 1080. Admite coordenadas negativas; otros monitores fuera de esta preview.")
                    .child(div().id("studio-canvas").flex_1().overflow_scroll().child(stage)))
                .child(div().id("studio-inspector").w(px(360.0)).flex_shrink_0().overflow_y_scroll().child(self.inspector(cx))))
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
            id: "widget-1".into(),
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
}
