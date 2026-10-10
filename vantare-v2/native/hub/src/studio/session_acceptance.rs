
    use super::{Prepared, Studio};
    use crate::orbit;
use vantare_ui::{Settings, session::Session};
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
                    let before = studio.editor.layout().instances[0].clone();
                    studio.session_tab = session;
                    studio.rebuild(cx);
                    assert_eq!(studio.editor.layout().instances[0], before, "preview preserves anchor and document");
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
