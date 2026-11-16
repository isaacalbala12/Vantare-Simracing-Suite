//! Operations used by the retained painter registry; no window or data ownership.
use rune::{El, Tx};
use vantare_domain::{Snapshot, format::Preferences, geometry::Size, widget_settings::Settings};

#[derive(Default)]
pub(crate) struct Update {
    pub build: bool,
    pub pixels: bool,
}

pub(crate) trait Widget {
    #[allow(clippy::new_ret_no_self)] // The approved registry constructor returns the erased widget.
    fn new(
        settings: &Settings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Option<Box<dyn Widget>>
    where
        Self: Sized;
    fn configured(&self, settings: &Settings, prefs: Preferences) -> bool;
    fn size(&self) -> Size;
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size;
    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update;
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update;
    fn animate(&mut self, clock: f64) -> Update;
    fn schedule(&self, clock: f64, tx: &mut Tx);
    fn view(&self) -> El;
}
