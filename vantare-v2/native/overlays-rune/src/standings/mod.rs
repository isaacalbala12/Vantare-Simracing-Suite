//! Standings: one canonical projection/selection, one painter, no I/O or timer.
mod layout;
mod motion;
mod paint;
mod scene;
#[cfg(test)]
mod effects_tests;
#[cfg(test)]
mod tests;

use rune::El;
use std::sync::Arc;
use vantare_domain::{
    Snapshot, SourceState,
    format::Preferences,
    geometry::Size,
    standings::{self, Board, Plan},
    widget_settings::{Settings as AnySettings, look::Look, standings::Settings},
};

/// Retained visible output. A sequence or a hidden field is not a paint cause.
#[derive(Clone)]
pub struct Standings {
    settings: Settings,
    prefs: Preferences,
    board: Arc<Board>,

    plan: Plan,
    scene: scene::Scene,
    motion: motion::Motion,
    visual: motion::Visual,
    /// Hay que recomponer aunque la escena no cambie (una fila que salta).
    repaint: bool,
    paused: bool,
    live: bool,
}

fn identity(snapshot: &Snapshot) -> String {
    format!("{}:{}", snapshot.epoch, snapshot.state.session.id.0)
}

impl Standings {
    pub fn new(settings: &Settings, prefs: Preferences) -> Self {
        Self::build(settings, prefs, false, 0.0)
    }

    pub fn build(settings: &Settings, prefs: Preferences, reduced: bool, clock: f64) -> Self {
        let settings = settings.normalized();
        let columns = layout::columns(&settings, None);
        let board = standings::project_cached(
            &Snapshot::default(),
            prefs,
            &layout::content(&settings, &columns),
            None,
        );
        let plan = Plan::new(board.clone(), identity(&Snapshot::default()), 0);
        let layout = layout::Layout::new(&settings, &columns, &plan);
        let display = scene::Display::new(&settings, prefs, &plan, &layout, false);
        let mut motion = motion::Motion::new();
        motion.policy(reduced);
        let visual = motion.sample(clock);
        Self {
            settings,
            prefs,
            board,
            plan,
            scene: scene::Scene { display, layout },
            motion,
            visual,
            repaint: false,
            paused: false,
            live: false,
        }
    }

    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }

    pub fn size(&self) -> Size {
        Size {
            width: self.scene.layout.width,
            height: self.scene.layout.height,
        }
    }

    /// Predict dynamic bands/session columns before monitor overlap. No side effects.
    pub fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        let Some(snapshot) = snapshot else {
            return self.size();
        };
        let mut preview = self.clone();
        preview.apply(snapshot, 0.0);
        preview.size()
    }

    /// Called only with the instance's photo already accepted by the host Cadence.
    /// The host owns rates, permissions, demand, visibility and source cancellation.
    pub(crate) fn update(&mut self, snapshot: &Snapshot, clock: f64) -> crate::widget::Update {
        let changed = self.apply(snapshot, clock);
        if changed {
            let rows: Vec<(&scene::Row, f32)> = self
                .scene
                .display
                .rows
                .iter()
                .zip(&self.scene.layout.rows)
                .map(|(row, y)| (row, *y))
                .collect();
            self.motion.update(&rows, clock);
        }
        self.repaint |= changed;
        crate::widget::Update {
            build: changed,
            pixels: false,
        }
    }

    /// Movimiento del instante; solo pide recomponer si cambió algo visible.
    pub(crate) fn animate(&mut self, clock: f64) -> crate::widget::Update {
        let visual = self.motion.sample(clock);
        let mut build = visual != self.visual;
        if build {
            self.visual = visual;
        }
        build |= std::mem::take(&mut self.repaint);
        crate::widget::Update {
            build,
            pixels: false,
        }
    }

    /// Con movimiento reducido las filas saltan y no queda reloj.
    pub(crate) fn policy(&mut self, reduced: bool, _hz: u16, clock: f64) -> crate::widget::Update {
        if !self.motion.policy(reduced) {
            return crate::widget::Update::default();
        }
        self.animate(clock)
    }

    pub(crate) fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if let Some(due) = self.motion.next_wake(clock) {
            tx.wake_at(due);
        }
    }

    /// Recompone la escena visible; el movimiento se sincroniza en update.
    fn apply(&mut self, snapshot: &Snapshot, clock: f64) -> bool {
        let paused = snapshot.state.source_state == SourceState::Paused;
        if paused && self.paused && self.live {
            return false;
        }
        if paused && self.live {
            self.paused = true;
            self.scene.layout.height += 22.0;
            self.scene.display.paused = true;
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
        // La foto y su sequence no deciden la escena; la identidad y la secuencia
        // solo alimentan la continuidad del movimiento, como en GPUI.
        let plan = Plan::new(
            board.clone(),
            identity(snapshot),
            snapshot.sequence,
        );
        let mut layout = layout::Layout::new(&self.settings, &columns, &plan);
        if paused {
            layout.height += 22.0;
        }
        let display = scene::Display::new(&self.settings, self.prefs, &plan, &layout, paused);
        let next = scene::Scene { display, layout };
        let changed = next != self.scene;
        if changed {
            self.motion.events(&self.plan, &plan, clock);
        }
        self.board = board;
        self.plan = plan;
        self.scene = next;
        self.paused = paused;
        self.live = vantare_domain::freshness::shows_last_live(snapshot);
        changed
    }

    pub fn view(&self) -> El {
        paint::view(self)
    }
}

/// Looks migrados del widget; el brazo del `match` de `constructor()` decide.
fn supported(look: Look) -> bool {
    look == Look::Vantare
}

impl crate::widget::Widget for Standings {
    fn new(
        settings: &AnySettings,
        prefs: Preferences,
        reduced: bool,
        _hz: u16,
        clock: f64,
    ) -> Option<Box<dyn crate::widget::Widget>> {
        let AnySettings::Standings(settings) = settings else {
            return None;
        };
        if !supported(settings.design_system) {
            return None;
        }
        Some(Box::new(Standings::build(settings, prefs, reduced, clock)))
    }
    fn configured(&self, settings: &AnySettings, prefs: Preferences) -> bool {
        let AnySettings::Standings(settings) = settings else {
            return false;
        };
        supported(settings.design_system) && Standings::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        Standings::size(self)
    }
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        Standings::size_for(self, snapshot)
    }
    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> crate::widget::Update {
        Standings::policy(self, reduced, hz, clock)
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> crate::widget::Update {
        Standings::update(self, snapshot, clock)
    }
    fn animate(&mut self, clock: f64) -> crate::widget::Update {
        Standings::animate(self, clock)
    }
    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        Standings::schedule(self, clock, tx);
    }
    fn view(&self) -> El {
        Standings::view(self)
    }
}

