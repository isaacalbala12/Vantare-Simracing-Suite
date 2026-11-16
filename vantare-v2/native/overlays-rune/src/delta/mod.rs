//! Delta Vantare: domain projects the board; the scene decides layout and texts
//! and the painter draws it. No clock and no motion in this part.
mod paint;
mod scene;
#[cfg(test)]
mod tests;

use crate::widget::{Update, Widget};
use paint::Painter;
use rune::El;
use vantare_domain::{
    Snapshot,
    delta::{self, Reference},
    format::Preferences,
    geometry::Size,
    widget_settings::{Settings as WidgetSettings, delta::Settings, look::Look},
};

pub(crate) struct Delta {
    settings: Settings,
    prefs: Preferences,
    scene: scene::Scene,
    painter: Painter,
}

impl Delta {
    pub fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let board = project(&settings, &Snapshot::default(), prefs);
        let scene = sample(&board, &settings, prefs);
        let painter = Painter::new(prefs, &scene);
        Self {
            settings,
            prefs,
            scene,
            painter,
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
    pub fn update(&mut self, snapshot: &Snapshot, _clock: f64) -> Update {
        let scene = sample(
            &project(&self.settings, snapshot, self.prefs),
            &self.settings,
            self.prefs,
        );
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

fn sample(board: &delta::Board, settings: &Settings, prefs: Preferences) -> scene::Scene {
    scene::sample(board, settings, prefs, &crate::vantare::Style::compiled())
}

impl Widget for Delta {
    fn new(
        settings: &WidgetSettings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn Widget>> {
        let WidgetSettings::Delta(settings) = settings else {
            return None;
        };
        if settings.design_system != Look::Vantare {
            return None;
        }
        Some(Box::new(Delta::new(settings, prefs)))
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        let WidgetSettings::Delta(settings) = settings else {
            return false;
        };
        Delta::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        Delta::size(self)
    }
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        Delta::size_for(self, snapshot)
    }
    fn policy(&mut self, _reduced: bool, _hz: u16, _clock: f64) -> Update {
        Update::default()
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        Delta::update(self, snapshot, clock)
    }
    fn animate(&mut self, _clock: f64) -> Update {
        Update::default()
    }
    fn schedule(&self, _clock: f64, _tx: &mut rune::Tx) {}
    fn view(&self) -> El {
        Delta::view(self)
    }
}
