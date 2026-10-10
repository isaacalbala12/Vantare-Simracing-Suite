mod support;
use gpui::{Element, ParentElement};
use vantare_hub::orbit;

#[test]
fn sidebar_avatar_leaves_the_account_row_as_the_only_accessible_button() {
    gpui_platform::headless().run(|cx| {
        cx.set_global(orbit::theme::Theme::default());
        let avatar = orbit::avatar("IA", cx);
        assert_eq!(avatar.a11y_role(), None);
        assert_eq!(avatar.id(), None);
        let account = orbit::action_row("sidebar-account", "Cuenta", cx).child(avatar);
        assert_eq!(account.a11y_role(), Some(gpui::Role::Button));
        let mut node = gpui::accesskit::Node::new(gpui::Role::Button);
        account.write_a11y_info(&mut node);
        assert_eq!(node.label(), Some("Cuenta"));
        support::quit_headless_test(cx);
    });
}
