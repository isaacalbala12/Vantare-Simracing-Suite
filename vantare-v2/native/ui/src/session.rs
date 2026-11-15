pub use vantare_domain::widget_session::*;
#[cfg(test)]
mod tests {
    #[test]
    fn session_filter_requests_the_type_even_for_a_widget_without_session_data() {
        let mut layout: crate::layout::Layout = serde_json::from_value(serde_json::json!({
            "version": crate::layout::VERSION,
            "instances": [{"id":"pedals", "x":10, "y":20, "settings":{"kind":"pedals"}}]
        }))
        .unwrap();
        let original = layout.demand();
        assert!(!original.contains(vantare_ipc::Signal::SessionInfo));
        layout.instances[0].show_in.practice = false;
        let filtered = layout.demand();
        assert!(filtered.contains(vantare_ipc::Signal::SessionInfo));
        assert!(
            filtered.covers(&original),
            "other signals stay requested even when hidden by session"
        );
        layout.instances[0].visible = false;
        assert!(!layout.demand().contains(vantare_ipc::Signal::SessionInfo));
    }
}
