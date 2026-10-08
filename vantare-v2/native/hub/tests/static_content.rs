use gpui::Element;
use vantare_hub::orbit;

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
        cx.quit();
    });
}
