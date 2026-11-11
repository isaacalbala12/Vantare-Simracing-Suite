//! UI-only operations over the pure persisted widget settings.

pub trait SettingsDemand {
    fn demand(&self) -> vantare_ipc::Demand;
}
pub(crate) trait WorkshopSettings: Sized {
    fn workshop_defaults(look: crate::look::Look) -> Self;
}
