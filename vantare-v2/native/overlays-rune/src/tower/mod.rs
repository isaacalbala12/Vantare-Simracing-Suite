//! Torre projection/controller; the single Vantare Look paints the sampled scene.
mod render;
pub mod scene;
use crate::widget::Update;
use rune::El;
use scene::Motion;
use std::cell::Cell;
use std::sync::Arc;
use vantare_domain::{
    Snapshot, broadcast_tower, format::Preferences, geometry::Size,
    widget_settings::broadcast_tower::Settings,
};

/// Horizontal places from the approved Eficiencia strip: 1400 × 56.
pub const SIZE: Size = Size {
    width: 1400.0,
    height: 56.0,
};

pub(crate) struct Tower {
    settings: Settings,
    prefs: Preferences,
    motion: Motion,
    painter: render::Painter,
    visual: scene::Scene,
    boundary: Option<(u64, u64)>,
    /// Un cambio de estructura pedido por el pintor y aún no presentado.
    pending: Cell<bool>,
}

impl Tower {
    pub fn new(
        settings: &Settings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Self {
        let settings = settings.normalized();
        let view = Arc::new(broadcast_tower::project_rows(
            &Snapshot::default(),
            prefs,
            settings.row_count,
        ));
        let mut motion = Motion::new(view, prefs, reduced, hz, clock);
        motion.advance(clock);
        let visual = scene::sample(&motion, clock);
        let painter = render::Painter::new(&visual, prefs, settings.show_weather);
        Self {
            settings,
            prefs,
            motion,
            painter,
            visual,
            boundary: None,
            pending: Cell::new(true),
        }
    }
    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }
    pub fn size(&self) -> Size {
        self.painter.size()
    }
    pub fn view(&self) -> El {
        self.pending.set(false);
        self.painter.view()
    }
    pub fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        if self.motion.policy(reduced, hz) {
            self.animate(clock)
        } else {
            Update::default()
        }
    }
    pub fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let projected = Arc::new(broadcast_tower::project_rows(
            snapshot,
            self.prefs,
            self.settings.row_count,
        ));
        // Reuse the retained projection when the photo paints the same strip.
        let view = if *projected == *self.visual.view {
            self.visual.view.clone()
        } else {
            projected
        };
        let boundary = (snapshot.epoch, snapshot.state.session.id.0);
        let snap = self.motion.reduced() || self.boundary != Some(boundary);
        self.motion
            .update(view, self.prefs, self.settings.driver_carousel, snap, clock);
        self.boundary = Some(boundary);
        self.animate(clock)
    }
    pub fn animate(&mut self, clock: f64) -> Update {
        self.motion.advance(clock);
        let visual = scene::sample(&self.motion, clock);
        if Arc::ptr_eq(&self.visual.view, &visual.view)
            && Arc::ptr_eq(&self.visual.labels, &visual.labels)
            && self.visual.rows == visual.rows
        {
            return Update::default();
        }
        let update = self.painter.sync(&visual);
        self.visual = visual;
        self.pending.set(self.pending.get() || update.build);
        Update {
            build: self.pending.get(),
            pixels: update.pixels,
        }
    }
    pub fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if let Some(due) = self.motion.next_wake(clock) {
            tx.wake_at(due);
        }
    }
}

impl crate::widget::Widget for Tower {
    fn new(
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Option<Box<dyn crate::widget::Widget>> {
        let vantare_domain::widget_settings::Settings::BroadcastTower(settings) = settings else {
            return None;
        };
        Some(Box::new(Tower::new(settings, prefs, reduced, hz, clock)))
    }
    fn configured(
        &self,
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
    ) -> bool {
        let vantare_domain::widget_settings::Settings::BroadcastTower(settings) = settings else {
            return false;
        };
        Tower::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        Tower::size(self)
    }
    fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        Tower::size(self)
    }
    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        Tower::policy(self, reduced, hz, clock)
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        Tower::update(self, snapshot, clock)
    }
    fn animate(&mut self, clock: f64) -> Update {
        Tower::animate(self, clock)
    }
    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        Tower::schedule(self, clock, tx);
    }
    fn view(&self) -> El {
        Tower::view(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vantare::paint::Face;
    use vantare_domain::{
        Capability, Car, CarId, Class, ClassId, Driver, Gap, Player, Quality::Reliable,
        SessionKind, SourceState, widget_settings::Settings as AnySettings,
    };

    fn snapshot() -> Snapshot {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.capabilities.positions = Capability::Fresh;
        snapshot.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        snapshot.state.session.kind = Reliable(SessionKind::Race);
        snapshot.state.session.remaining_s = Reliable(522.0);
        snapshot.state.cars = (1..=5)
            .map(|id| Car {
                id: CarId(id),
                position: Reliable(id),
                class: Some(Class {
                    id: ClassId(1),
                    name: "Hypercar".into(),
                }),
                driver: Driver {
                    name: format!("PILOTO {id}"),
                    ..Driver::default()
                },
                gap_leader: Reliable(Gap::Time {
                    seconds: f64::from(id - 1),
                }),
                in_pits: Reliable(false),
                ..Car::default()
            })
            .collect();
        snapshot
    }
    fn tower(settings: &Settings, reduced: bool) -> Tower {
        Tower::new(settings, Preferences::default(), reduced, 5, 0.0)
    }

    #[test]
    fn the_strip_keeps_its_size_and_paints_the_projected_rows() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut tower = tower(&Settings::default(), true);
        assert_eq!(tower.size(), SIZE);
        let update = tower.update(&snapshot(), 0.0);
        assert!(update.build && update.pixels, "primera foto visible");
    }

    #[test]
    fn quiet_data_paints_nothing_and_one_visible_change_paints_once() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut tower = tower(&Settings::default(), false);
        let photo = snapshot();
        tower.update(&photo, 0.0);
        let _presented = tower.view();
        let quiet = tower.update(&photo, 1.0);
        assert!(!quiet.build && !quiet.pixels, "misma foto, nada que pintar");
        assert!(
            tower.motion.next_wake(1.0).is_none(),
            "sin condición, sin reloj"
        );
        let mut changed = photo.clone();
        changed.sequence += 1;
        changed.state.cars[1].gap_leader = Reliable(Gap::Time { seconds: 9.5 });
        let update = tower.update(&changed, 2.0);
        assert!(
            update.pixels && !update.build,
            "el hueco es un LiveText recortado"
        );
    }

    #[test]
    fn a_reorder_animates_the_cards_and_marks_the_cue() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut tower = tower(&Settings::default(), false);
        let photo = snapshot();
        tower.update(&photo, 0.0);
        let mut swapped = photo.clone();
        swapped.sequence += 1;
        swapped.state.cars[0].position = Reliable(2);
        swapped.state.cars[1].position = Reliable(1);
        let update = tower.update(&swapped, 1.0);
        assert!(update.pixels, "las tarjetas se mueven y avisan");
        assert!(tower.animate(1.1).pixels);
        tower.animate(30.0);
        assert!(!tower.animate(30.0).pixels, "el movimiento acaba");
    }

    #[test]
    fn carousel_is_the_only_clock_and_reduced_motion_stops_it() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let carousel = Settings {
            driver_carousel: true,
            ..Settings::default()
        };
        let mut tower = tower(&carousel, false);
        tower.update(&snapshot(), 0.0);
        let _look = tower.view();
        let mut runtime = rune::Runtime::with_text(
            Box::new(tower) as Box<dyn crate::widget::Widget>,
            |state, _| state.view(),
            (SIZE.width, SIZE.height),
            rune::Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(|tower, clock, tx| {
            let update = tower.animate(clock);
            tower.schedule(clock, tx);
            update.build
        });
        runtime.frame(1.0);
        assert!(runtime.find("tower-session").is_some(), "vista construida");
        assert!(runtime.wake_deadline().is_some(), "carrusel con condición");
        runtime.state.policy(true, 5, 1.1);
        runtime.frame(0.3);
        assert_eq!(runtime.wake_deadline(), None, "reducido no late");
    }

    #[test]
    fn display_texts_add_the_baseline_offset() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut tower = tower(&Settings::default(), false);
        tower.update(&snapshot(), 0.0);
        let mut runtime = rune::Runtime::with_text(
            Box::new(tower) as Box<dyn crate::widget::Widget>,
            |state, _| state.view(),
            (SIZE.width, SIZE.height),
            rune::Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(|tower, clock, tx| {
            let update = tower.animate(clock);
            tower.schedule(clock, tx);
            update.build
        });
        runtime.frame(1.0);
        let baseline = crate::vantare::Style::compiled().fonts.display_baseline;
        let at = |key: &str| {
            runtime
                .elements()
                .into_iter()
                .find(|element| element.key.as_deref() == Some(key))
                .expect("elemento")
                .target[1]
        };
        assert_eq!(at("tower-session"), 9.0 + baseline);
        assert_eq!(at("tower-class-0"), 17.0 + baseline);
        assert_eq!(at("tower-place-1-0"), 1.0 + 17.0 + baseline);
        assert_eq!(at("tower-code-1-0"), 1.0 + 17.0 + baseline);
        assert_eq!(at("tower-gap-1-0"), 1.0 + 18.0);
        assert_eq!(at("tower-lap"), 32.0);
    }

    #[test]
    fn fitting_cuts_with_an_ellipsis_and_keeps_short_texts() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let style = crate::vantare::Style::compiled();
        let long = render::fitted(
            &style,
            "+123456789012345678",
            20.0,
            Face::Mono,
            10.0,
            18.0,
            0.0,
        );
        assert!(long.ends_with('\u{2026}'), "{long:?}");
        let short = render::fitted(&style, "+1.000", 200.0, Face::Mono, 10.0, 18.0, 0.0);
        assert_eq!(short, "+1.000");
    }
    #[test]
    fn dispatch_accepts_the_tower_and_rejects_other_settings() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let settings = AnySettings::BroadcastTower(Settings::default());
        let painter =
            <Tower as crate::widget::Widget>::new(&settings, Preferences::default(), true, 15, 0.0)
                .expect("torre");
        assert!(painter.configured(&settings, Preferences::default()));
        assert_eq!(painter.size(), SIZE);
        assert!(
            <Tower as crate::widget::Widget>::new(
                &AnySettings::Pedals(Default::default()),
                Preferences::default(),
                true,
                15,
                0.0
            )
            .is_none()
        );
    }
}
