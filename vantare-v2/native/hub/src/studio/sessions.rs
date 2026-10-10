//! Widgets por tipo de sesión (#1564): pestañas de columnas de Standings y
//! «Mostrar en» de cualquier instancia.
use super::{Studio, Tab};
use crate::orbit::{self, Checkbox, Checked, button};
use gpui::{Context, div, prelude::*, px};
use vantare_ui::{Settings, layout::Instance, session::Session};

impl Studio {
    /// Tres interruptores en Comportamiento, todos activos de serie.
    pub(super) fn push_show_in_fields(&mut self, item: &Instance, cx: &mut Context<Self>) {
        for (session, title) in [
            (Session::Practice, "Mostrar en práctica"),
            (Session::Qualifying, "Mostrar en qualy"),
            (Session::Race, "Mostrar en carrera"),
        ] {
            let control = cx.new(|cx| Checkbox::switch(title, *item.show_in.get(session), cx));
            let id = item.id.clone();
            cx.subscribe(&control, move |this, _, event: &Checked, cx| {
                if this.editor.selected.as_ref() == Some(&id) {
                    this.edit(
                        |editor| {
                            editor.edit_selected(|item| *item.show_in.get_mut(session) = event.0)
                        },
                        cx,
                    );
                }
            })
            .detach();
            self.fields
                .push((Tab::Behavior, title, control.into(), false));
        }
    }

    /// Pestañas Práctica / Qualy / Carrera y «Restablecer preset» de Standings.
    pub(super) fn session_tabs(
        item: &Instance,
        session: Session,
        cx: &mut Context<Self>,
    ) -> Option<gpui::Div> {
        if !matches!(item.settings, Settings::Standings(_)) {
            return None;
        }
        let mut tabs = div().flex().items_center().gap(px(6.0));
        for (index, tab) in Session::ALL.into_iter().enumerate() {
            let active = tab == session;
            tabs = tabs.child(
                orbit::ghost_button(("studio-session", index), tab.label(), cx)
                    .h(px(30.0))
                    .px(px(8.0))
                    .flex_none()
                    .aria_selected(active)
                    .when(active, |b| orbit::nav_active(b, cx))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if this.session_tab != tab {
                            this.cancel_drag(cx);
                            this.session_tab = tab;
                            this.rebuild(cx);
                        }
                    })),
            );
        }
        let selected = item.id.clone();
        let reset = button("studio-session-reset", "Restablecer preset", cx).on_click(cx.listener(
            move |this, _, _, cx| {
                if this.editor.selected.as_ref() != Some(&selected) {
                    return;
                }
                this.reset_fields();
                this.edit(
                    |editor| {
                        editor.edit_selected(|item| {
                            if let Settings::Standings(settings) = &mut item.settings {
                                *settings.session_columns_mut(session) =
                                    vantare_ui::standings::session_preset(session);
                            }
                        })
                    },
                    cx,
                );
            },
        ));
        Some(
            div()
                .flex()
                .flex_col()
                .gap(px(8.0))
                .child(orbit::eyebrow("Columnas por sesión", cx))
                .child(tabs)
                .child(reset),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::super::Prepared;
    use super::*;
    use vantare_domain::Quality;
    use vantare_ui::standings::session_preset;

    #[test]
    fn new_standings_get_presets_and_each_tab_previews_its_session() {
        gpui_platform::headless().run(|cx| {
            cx.set_global(orbit::theme::Theme::default());
            let file = crate::document::tests::File::new();
            let mut prepared = Prepared::load(file.path.clone()).expect("preparar Studio");
            prepared
                .editor
                .add(vantare_ui::Kind::Standings)
                .expect("widget");
            let studio = cx.new(|cx| Studio::new(prepared, cx));
            studio.update(cx, |studio, cx| {
                let item = studio.editor.layout().instances[0].clone();
                let Settings::Standings(settings) = &item.settings else {
                    panic!("standings")
                };
                for session in Session::ALL {
                    assert_eq!(
                        settings.session_columns(session),
                        Some(&session_preset(session))
                    );
                    studio.session_tab = session;
                    studio.rebuild(cx);
                    assert_eq!(
                        studio.settings_snapshot(&item.settings).state.session.kind,
                        Quality::Reliable(session.kind())
                    );
                }
                studio.real_photo = Some(0);
                let real = studio.photos[0].snapshot.state.session.kind.clone();
                assert_eq!(
                    studio.settings_snapshot(&item.settings).state.session.kind,
                    real,
                    "las fotos reales conservan su sesión"
                );
                studio
                    .editor
                    .edit_selected(|item| {
                        crate::inspector::columns_mut(&mut item.settings, Session::Qualifying)
                            .expect("columnas")[0]
                            .enabled = false;
                    })
                    .expect("editar qualy");
                let Settings::Standings(edited) = &studio.editor.layout().instances[0].settings
                else {
                    panic!("standings")
                };
                assert_eq!(
                    edited.session_columns(Session::Race),
                    Some(&session_preset(Session::Race)),
                    "editar una pestaña no toca las otras"
                );
            });
            crate::quit_headless_test(cx);
        });
    }
}
