//! Standings: one canonical projection/selection, two painters, no I/O or timer.
pub mod capture;
mod layout;
mod paint;
pub mod tokens;

use rune::El;
use std::sync::Arc;
use vantare_domain::{
    Snapshot, SourceState,
    format::Preferences,
    geometry::Size,
    standings::{self, Board, Plan},
    widget_settings::standings::Settings,
};

/// Retained visible output. A sequence or a hidden field is not a paint cause.
#[derive(Clone)]
pub struct Standings {
    settings: Settings,
    prefs: Preferences,
    board: Arc<Board>,
    layout: layout::Layout,
    display: paint::Display,
    paused: bool,
    live: bool,
}

impl Standings {
    pub fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let columns = layout::columns(&settings, None);
        let board = standings::project_cached(
            &Snapshot::default(),
            prefs,
            &layout::content(&settings, &columns),
            None,
        );
        let plan = Plan::new(board.clone(), String::new(), 0);
        let layout = layout::Layout::new(&settings, &columns, &plan);
        let display = paint::Display::new(&settings, prefs, &plan, &layout, false);
        Self {
            settings,
            prefs,
            board,
            layout,
            display,
            paused: false,
            live: false,
        }
    }

    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }

    pub fn size(&self) -> Size {
        Size {
            width: self.layout.width,
            height: self.layout.height,
        }
    }

    /// Predict dynamic bands/session columns before monitor overlap. No side effects.
    pub fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        let Some(snapshot) = snapshot else {
            return self.size();
        };
        let mut preview = self.clone();
        preview.update(snapshot);
        preview.size()
    }

    /// Called only with the instance's photo already accepted by the host Cadence.
    /// The host owns rates, permissions, demand, visibility and source cancellation.
    pub fn update(&mut self, snapshot: &Snapshot) -> bool {
        let paused = snapshot.state.source_state == SourceState::Paused;
        if paused && self.paused && self.live {
            return false;
        }
        if paused && self.live {
            self.paused = true;
            self.layout.height += 22.0;
            self.display.paused = true;
            return true;
        }
        // Opening a window while paused uses the retained photo, as the existing host.
        let retained;
        let snapshot = if paused {
            retained = {
                let mut s = snapshot.clone();
                s.state.source_state = SourceState::Live;
                s
            };
            &retained
        } else {
            snapshot
        };
        let columns = layout::columns(&self.settings, Some(snapshot));
        let board = standings::project_cached(
            snapshot,
            self.prefs,
            &layout::content(&self.settings, &columns),
            Some(&self.board),
        );
        let plan = Plan::new(board.clone(), String::new(), snapshot.sequence);
        let mut layout = layout::Layout::new(&self.settings, &columns, &plan);
        if paused {
            layout.height += 22.0;
        }
        let display = paint::Display::new(&self.settings, self.prefs, &plan, &layout, paused);
        let changed = display != self.display || layout != self.layout;
        self.board = board;
        self.layout = layout;
        self.display = display;
        self.paused = paused;
        self.live = vantare_domain::freshness::shows_last_live(snapshot);
        changed
    }

    pub fn view(&self) -> El {
        paint::view(self)
    }
}

impl crate::widget::Widget for Standings {
    fn new(
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn crate::widget::Widget>> {
        let vantare_domain::widget_settings::Settings::Standings(settings) = settings else {
            return None;
        };
        Some(Box::new(Standings::new(settings, prefs)))
    }
    fn configured(
        &self,
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
    ) -> bool {
        let vantare_domain::widget_settings::Settings::Standings(settings) = settings else {
            return false;
        };
        Standings::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        Standings::size(self)
    }
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        Standings::size_for(self, snapshot)
    }
    fn policy(&mut self, _reduced: bool, _hz: u16, _clock: f64) -> crate::widget::Update {
        Default::default()
    }
    fn update(&mut self, snapshot: &Snapshot, _clock: f64) -> crate::widget::Update {
        crate::widget::Update {
            build: Standings::update(self, snapshot),
            pixels: false,
        }
    }
    fn animate(&mut self, _clock: f64) -> crate::widget::Update {
        Default::default()
    }
    fn schedule(&self, _clock: f64, _tx: &mut rune::Tx) {}
    fn view(&self) -> El {
        Standings::view(self)
    }
}

#[cfg(test)]
mod tests;
