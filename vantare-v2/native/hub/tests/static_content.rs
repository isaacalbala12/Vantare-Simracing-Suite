mod support;
use gpui::Element;
use gpui::prelude::*;
use vantare_hub::orbit;

#[test]
fn pending_faces_describe_value_and_reason_without_click_or_focus() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let reason = "Próximamente. Usa captura de ventana en OBS";
        for (control, label, value) in [
            (
                orbit::pending_button("pending", "Publicar en OBS", reason, cx),
                "Publicar en OBS",
                None,
            ),
            (
                orbit::pending_icon_button("icon", "v-camera", "OBS", 36.0, reason, cx),
                "OBS",
                None,
            ),
            (
                orbit::pending_play_button("play", "Mostrar en pista", 44.0, reason, cx),
                "Mostrar en pista",
                None,
            ),
            (
                orbit::pending_select("select", "Layout activo", "Layout local", 180.0, reason, cx),
                "Layout activo: Layout local",
                Some("Layout local"),
            ),
        ] {
            assert_eq!(control.a11y_role(), Some(gpui::Role::Group));
            let mut node = gpui::accesskit::Node::new(gpui::Role::Group);
            control.write_a11y_info(&mut node);
            assert_eq!(node.label(), Some(label));
            assert_eq!(node.value(), value);
            assert_eq!(node.description(), Some(reason));
            assert!(!node.supports_action(gpui::AccessibleAction::Click));
            assert!(!node.supports_action(gpui::AccessibleAction::Focus));
        }
        // Los activos siguen siendo accionables aunque compartan la misma cara.
        for button in [
            orbit::button("active", "Editar", cx),
            orbit::carmine_button("primary", "Enviar", cx),
            orbit::icon_button("active-icon", "v-camera", "Capturar", 36.0, cx),
            orbit::play_button("active-play", "Lanzar", 44.0, false, cx),
        ] {
            let button = button.on_click(|_, _, _| {});
            assert_eq!(button.a11y_role(), Some(gpui::Role::Button));
            let mut node = gpui::accesskit::Node::new(gpui::Role::Button);
            button.write_a11y_info(&mut node);
            assert!(node.supports_action(gpui::AccessibleAction::Click));
            assert!(node.supports_action(gpui::AccessibleAction::Focus));
        }
        support::quit_headless_test(cx);
    });
}

#[test]
fn track_toggle_button_states_text_aria_and_icon_in_both_directions() {
    assert_eq!(orbit::track_toggle_text(false), "Mostrar en pista");
    assert_eq!(orbit::track_toggle_text(true), "Dejar de mostrar");
    assert_eq!(orbit::track_toggle_icon(false), "play");
    assert_eq!(orbit::track_toggle_icon(true), "stop");
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        for showing in [false, true] {
            let label = orbit::track_toggle_text(showing);
            let button = orbit::track_toggle_button("track", label, showing, 44.0, cx)
                .on_click(|_, _, _| {});
            assert_eq!(button.a11y_role(), Some(gpui::Role::Button));
            let mut node = gpui::accesskit::Node::new(gpui::Role::Button);
            button.write_a11y_info(&mut node);
            assert_eq!(node.label(), Some(label));
            assert!(node.supports_action(gpui::AccessibleAction::Click));
            assert!(node.supports_action(gpui::AccessibleAction::Focus));
        }
        // Compacta: sin texto visible, pero el aria conserva el estado real.
        let compact =
            orbit::track_toggle_button("track", "", true, 44.0, cx).on_click(|_, _, _| {});
        let mut node = gpui::accesskit::Node::new(gpui::Role::Button);
        compact.write_a11y_info(&mut node);
        assert_eq!(node.label(), Some("Dejar de mostrar"));
        support::quit_headless_test(cx);
    });
}

#[test]
fn summary_accessibility_describes_content_without_button_actions() {
    // Construye los elementos productivos sin abrir ventanas ni usar GPU.
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let summary = orbit::summary_row("Beta para testers", "Acceso gratuito", "key", cx);
        assert_eq!(summary.a11y_role(), Some(gpui::Role::Group));
        let mut node = gpui::accesskit::Node::new(gpui::Role::Group);
        summary.write_a11y_info(&mut node);
        assert_eq!(node.label(), Some("Beta para testers"));
        assert_eq!(node.is_selected(), None);
        assert!(!node.supports_action(gpui::AccessibleAction::Click));
        assert!(!node.supports_action(gpui::AccessibleAction::Focus));
        // Compartir la cara visual no debe retirar la semántica de filas de acción.
        let button = orbit::list_row("profile", "Perfil", "Lanzar", true, true, cx);
        assert_eq!(button.a11y_role(), Some(gpui::Role::Button));
        let mut node = gpui::accesskit::Node::new(gpui::Role::Button);
        button.write_a11y_info(&mut node);
        assert_eq!(node.label(), Some("Perfil"));
        assert_eq!(node.is_selected(), Some(true));
        support::quit_headless_test(cx);
    });
}
