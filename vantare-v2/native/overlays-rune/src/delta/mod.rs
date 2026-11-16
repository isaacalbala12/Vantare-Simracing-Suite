//! Delta Vantare: domain projects the board; the scene decides layout and texts
//! and the painter draws it. La barra se desliza y el récord destella con reloj
//! finito; al terminar no queda ningún despertar.
/// Common `Widget` armazón for both looks: one look check and plain delegations.
macro_rules! delta_widget {
    ($t:ty, $look:expr) => {
        impl crate::widget::Widget for $t {
            fn new(
                settings: &WidgetSettings,
                prefs: Preferences,
                reduced: bool,
                _hz: u16,
                clock: f64,
            ) -> Option<Box<dyn crate::widget::Widget>> {
                let WidgetSettings::Delta(settings) = settings else {
                    return None;
                };
                if settings.design_system != $look {
                    return None;
                }
                Some(Box::new(<$t>::new(settings, prefs, reduced, clock)))
            }
            fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
                let WidgetSettings::Delta(settings) = settings else {
                    return false;
                };
                <$t>::configured(self, settings, prefs)
            }
            fn size(&self) -> Size {
                <$t>::size(self)
            }
            fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
                <$t>::size_for(self, snapshot)
            }
            fn policy(&mut self, reduced: bool, _hz: u16, clock: f64) -> Update {
                <$t>::policy(self, reduced, clock)
            }
            fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
                <$t>::update(self, snapshot, clock)
            }
            fn animate(&mut self, clock: f64) -> Update {
                <$t>::animate(self, clock)
            }
            fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
                <$t>::schedule(self, clock, tx);
            }
            fn view(&self) -> El {
                <$t>::view(self)
            }
        }
    };
}

pub(crate) mod eficiencia;
mod motion;
mod paint;
mod scene;
#[cfg(test)]
mod tests;

use crate::widget::Update;
use motion::Motion;
use paint::Painter;
use rune::El;
use vantare_domain::{
    Snapshot,
    delta::{self, Board, Reference},
    format::Preferences,
    geometry::Size,
    widget_settings::{Settings as WidgetSettings, delta::Settings, look::Look},
};

pub(crate) struct Delta {
    settings: Settings,
    prefs: Preferences,
    /// Escena base de la foto; solo cambian `bar` y `flash` por frame.
    base: scene::Scene,
    scene: scene::Scene,
    painter: Painter,
    motion: Motion,
    last: Option<Board>,
    reduced: bool,
}

impl Delta {
    pub fn new(settings: &Settings, prefs: Preferences, reduced: bool, clock: f64) -> Self {
        let settings = settings.normalized();
        let style = crate::vantare::Style::compiled();
        let motion = Motion::new(style.delta.ease_ms, style.motion.flash_ms);
        let board = project(&settings, &Snapshot::default(), prefs);
        let base = sample(&board, &settings, prefs);
        let mut initial = base.clone();
        if !reduced && initial.live {
            initial.bar = motion.bar(clock);
            initial.flash = motion.flash(clock);
        }
        let painter = Painter::new(prefs, &initial);
        Self {
            settings,
            prefs,
            base,
            scene: initial,
            painter,
            motion,
            last: None,
            reduced,
        }
    }
    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }
    pub fn size(&self) -> Size {
        Size {
            width: self.scene.width,
            height: self.scene.height,
        }
    }
    /// La caja solo depende de los ajustes: la pausa es un estado de la escena.
    pub fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        self.size()
    }
    pub fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let board = project(&self.settings, snapshot, self.prefs);
        if self.last.as_ref() == Some(&board) {
            return Update::default();
        }
        let target = scene::bar_target(
            board.delta_s,
            board.phase,
            crate::vantare::Style::compiled().delta.range_s,
        );
        self.motion.ingest(
            self.last.as_ref(),
            &board,
            target,
            motion::fill_geometry(board.progress),
            clock,
            self.reduced,
        );
        self.base = sample(&board, &self.settings, self.prefs);
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
        if !self.reduced && self.motion.next_wake(clock).is_some() {
            tx.wake_after(std::time::Duration::ZERO);
        }
    }
    /// Escena base con la barra y el destello del instante `clock`.
    fn frame(&self, clock: f64) -> scene::Scene {
        let mut scene = self.base.clone();
        if !self.reduced && scene.live {
            scene.bar = self.motion.bar(clock);
            scene.flash = self.motion.flash(clock);
        }
        scene
    }
    fn present(&mut self, scene: scene::Scene) -> Update {
        if scene == self.scene {
            return Update::default();
        }
        let update = self.painter.sync(&scene, self.prefs);
        self.scene = scene;
        update
    }
    pub fn view(&self) -> El {
        self.painter.view()
    }
}

pub(crate) fn project(
    settings: &Settings,
    snapshot: &Snapshot,
    prefs: Preferences,
) -> delta::Board {
    delta::project_reference(snapshot, prefs, reference(settings))
}

pub(crate) fn reference(settings: &Settings) -> Reference {
    scene::reference(settings)
}

fn sample(board: &Board, settings: &Settings, prefs: Preferences) -> scene::Scene {
    scene::sample(board, settings, prefs, &crate::vantare::Style::compiled())
}

delta_widget!(Delta, Look::Vantare);
