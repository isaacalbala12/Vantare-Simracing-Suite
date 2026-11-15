//! UI-only operations over the pure persisted widget settings.

pub use vantare_ipc::widget_demand::SettingsDemand;
pub(crate) trait WorkshopSettings: Sized {
    fn workshop_defaults(look: crate::look::Look) -> Self;
}
