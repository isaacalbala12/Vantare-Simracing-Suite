//! Common Vantare look data and primitives. Canonical inputs remain in native/ui.
pub mod generated;
pub mod paint;
pub use generated::{Style, StylesNeo as Variant};
use std::sync::{Arc, OnceLock};

impl Style {
    pub fn compiled() -> Arc<Self> {
        static STYLE: OnceLock<Arc<Style>> = OnceLock::new();
        STYLE
            .get_or_init(|| Arc::new(generated::compiled()))
            .clone()
    }
    pub fn class(&self, name: &str) -> &generated::ClassesItem {
        let name = name.to_lowercase();
        self.classes
            .iter()
            .find(|class| name.contains(class.matches))
            .expect("canonical fallback class")
    }
}
pub fn alpha(color: rune::Color, opacity: f32) -> rune::Color {
    let a = color.a * opacity;
    if a <= 0.0 {
        rune::Color {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            a: 0.0,
        }
    } else {
        rune::Color { a, ..color }
    }
}
pub(crate) fn waiting(facts: Option<(vantare_domain::SourceState, bool)>) -> bool {
    facts.is_none_or(|(source, player_present)| {
        !player_present
            || matches!(
                source,
                vantare_domain::SourceState::Waiting | vantare_domain::SourceState::Lost
            )
    })
}
pub const FONTS: &[&[u8]] = &[
    include_bytes!("../../../ui/assets/fonts/Inter-400.ttf"),
    include_bytes!("../../../ui/assets/fonts/Inter-500.ttf"),
    include_bytes!("../../../ui/assets/fonts/Inter-600.ttf"),
    include_bytes!("../../../ui/assets/fonts/Inter-650.ttf"),
    include_bytes!("../../../ui/assets/fonts/Inter-700.ttf"),
    include_bytes!("../../../ui/assets/fonts/Inter-750.ttf"),
    include_bytes!("../../../ui/assets/fonts/Inter-800.ttf"),
    include_bytes!("../../../ui/assets/fonts/Rajdhani.ttf"),
    include_bytes!("../../../ui/assets/fonts/SpaceMono.ttf"),
];
