use super::{Prepared, Studio};
use crate::orbit;
use gpui::AppContext;
use vantare_domain::Quality;
use vantare_ui::standings::session_preset;
use vantare_ui::{Settings, session::Session};

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
            let mut widths = Vec::new();
            let Settings::Standings(settings) = &item.settings else {
                panic!("standings")
            };
            for session in Session::ALL {
                assert_eq!(
                    settings.session_columns(session),
                    Some(&session_preset(session))
                );
                let before = studio.editor.layout().instances[0].clone();
                studio.select_session(session, cx);
                assert_eq!(
                    studio.editor.layout().instances[0],
                    before,
                    "preview preserves anchor and document"
                );
                assert_eq!(
                    studio.settings_snapshot(&item.settings).state.session.kind,
                    Quality::Reliable(session.kind())
                );
                let renderer = &studio.frames[0].1.read(cx).renderer;
                widths.push(renderer.read(cx).wanted_size().0);
            }
            assert_eq!(
                widths[0].to_bits(),
                widths[1].to_bits(),
                "practice and qualy share D7"
            );
            assert!(
                (widths[1] - widths[2]).abs() > 1.0,
                "race adapts its natural width"
            );
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
            let Settings::Standings(edited) = &studio.editor.layout().instances[0].settings else {
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
