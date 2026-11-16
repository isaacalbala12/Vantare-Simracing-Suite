//! Delta Eficiencia: the shared board feeds labels, the fill interpolates for
//! 140 ms and the notices live and expire without leaving a clock behind.
mod paint;
mod scene;
#[cfg(test)]
mod tests;

use super::{motion, project};
use crate::widget::{Update, Widget};
use motion::Motion;
use rune::El;
use vantare_domain::{
    Snapshot,
    delta::Board,
    format::Preferences,
    geometry::Size,
    widget_settings::{Settings as WidgetSettings, delta::Settings, look::Look},
};

const WIDTH: f32 = 280.0;
const HEIGHT: f32 = 96.0;

pub(crate) struct DeltaEficiencia {
    settings: Settings,
    prefs: Preferences,
    base: scene::Scene,
    scene: scene::Scene,
    motion: Motion,
    last: Option<Board>,
    reduced: bool,
    capsule: bool,
}

impl DeltaEficiencia {
    pub fn new(settings: &Settings, prefs: Preferences, reduced: bool, clock: f64) -> Self {
        let settings = settings.normalized();
        let style = crate::vantare::Style::compiled();
        let motion = Motion::new(style.delta.ease_ms, style.motion.flash_ms);
        let board = project(&settings, &Snapshot::default(), prefs);
        let capsule =
            settings.template_id == vantare_domain::widget_settings::delta::DELTA_TEMPLATE_CAPSULE;
        let base = scene::sample(&board, prefs, capsule);
        let mut initial = base.clone();
        if reduced {
            let (event, cross) = motion.reduced_frame(clock);
            initial.event = event;
            initial.cross = cross;
            initial.notice_alpha = if event.is_some() { 1.0 } else { 0.0 };
            initial.cross_alpha = if cross.is_some() { 1.0 } else { 0.0 };
        }
        Self {
            settings,
            prefs,
            base,
            scene: initial,
            motion,
            last: None,
            reduced,
            capsule,
        }
    }
    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }
    pub fn size(&self) -> Size {
        Size {
            width: WIDTH,
            height: HEIGHT,
        }
    }
    pub fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        self.size()
    }
    pub fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let board = project(&self.settings, snapshot, self.prefs);
        if self.last.as_ref() == Some(&board) {
            return Update::default();
        }
        self.motion.ingest(
            self.last.as_ref(),
            &board,
            0.0,
            motion::fill_geometry(board.progress),
            clock,
            self.reduced,
        );
        self.base = scene::sample(&board, self.prefs, self.capsule);
        self.last = Some(board);
        self.present(self.frame(clock))
    }
    pub fn policy(&mut self, reduced: bool, clock: f64) -> Update {
        if self.reduced == reduced {
            return Update::default();
        }
        self.reduced = reduced;
        if reduced {
            self.motion.settle();
        }
        self.present(self.frame(clock))
    }
    pub fn animate(&mut self, clock: f64) -> Update {
        self.present(self.frame(clock))
    }
    pub fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if self.reduced {
            if let Some(due) = self.motion.reduced_deadline(clock) {
                if due <= clock {
                    tx.wake_after(std::time::Duration::ZERO);
                } else {
                    tx.wake_at(due);
                }
            }
            return;
        }
        if self.motion.next_wake_full(clock).is_some() {
            tx.wake_after(std::time::Duration::ZERO);
        }
    }
    fn frame(&self, clock: f64) -> scene::Scene {
        let mut scene = self.base.clone();
        if self.reduced {
            let (event, cross) = self.motion.reduced_frame(clock);
            scene.event = event;
            scene.notice_alpha = if event.is_some() { 1.0 } else { 0.0 };
            scene.cross = cross;
            scene.cross_alpha = if cross.is_some() { 1.0 } else { 0.0 };
            return scene;
        }
        scene.fill = self.motion.fill(clock);
        scene.event = self.motion.event(clock);
        scene.notice_alpha = self.motion.notice_alpha(clock);
        let (cross, alpha) = self.motion.cross(clock);
        scene.cross = cross;
        scene.cross_alpha = alpha;
        scene
    }
    fn present(&mut self, scene: scene::Scene) -> Update {
        if scene == self.scene {
            return Update::default();
        }
        self.scene = scene;
        Update {
            build: true,
            pixels: false,
        }
    }
    pub fn view(&self) -> El {
        paint::view(&self.scene)
    }
}

impl Widget for DeltaEficiencia {
    fn new(
        settings: &WidgetSettings,
        prefs: Preferences,
        reduced: bool,
        _hz: u16,
        clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let WidgetSettings::Delta(settings) = settings else {
            return None;
        };
        if settings.design_system != Look::Eficiencia {
            return None;
        }
        Some(Box::new(DeltaEficiencia::new(
            settings, prefs, reduced, clock,
        )))
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        let WidgetSettings::Delta(settings) = settings else {
            return false;
        };
        DeltaEficiencia::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        DeltaEficiencia::size(self)
    }
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        DeltaEficiencia::size_for(self, snapshot)
    }
    fn policy(&mut self, reduced: bool, _hz: u16, clock: f64) -> Update {
        DeltaEficiencia::policy(self, reduced, clock)
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        DeltaEficiencia::update(self, snapshot, clock)
    }
    fn animate(&mut self, clock: f64) -> Update {
        DeltaEficiencia::animate(self, clock)
    }
    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        DeltaEficiencia::schedule(self, clock, tx);
    }
    fn view(&self) -> El {
        DeltaEficiencia::view(self)
    }
}
