//! Relative projection/controller. Both Looks consume the same sampled scene.
mod layout;
mod render;
pub mod scene;
use rune::El;
use scene::{Motion, Timing};
use std::sync::Arc;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    geometry::Size,
    relative::{self, Board},
    widget_settings::relative::Settings,
};

const PAUSE_HEIGHT: f32 = 22.0;

#[derive(Default)]
pub(crate) struct Update {
    pub build: bool,
    pub pixels: bool,
}

pub(crate) struct Relative {
    settings: Settings,
    prefs: Preferences,
    board: Arc<Board>,
    motion: Motion,
    painter: render::Painter,
    visual: scene::Scene,
    boundary: Option<(u64, u64, Preferences)>,
    paused: bool,
    live_projection: bool,
}
impl Relative {
    pub fn new(
        settings: &Settings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Self {
        let settings = settings.normalized();
        let style = crate::vantare::Style::compiled();
        let mut motion = Motion::new(
            Timing {
                reorder: f64::from(style.motion.reorder_ms) / 1000.0,
                fade: f64::from(style.motion.fade_ms) / 1000.0,
                flash: f64::from(style.motion.flash_ms) / 1000.0,
                pulse: f64::from(style.relative.pulse_ms) / 1000.0,
            },
            reduced,
            hz,
            clock,
        );
        let board = relative::project_cached(
            &Snapshot::default(),
            prefs,
            Self::content(&settings),
            &settings.footer_slots,
            None,
        );
        motion.advance(&board, clock);
        let initial = scene::sample(board.clone(), &motion, false, clock);
        let painter = render::Painter::new(&settings, prefs, &initial);
        Self {
            settings,
            prefs,
            board,
            motion,
            painter,
            visual: initial,
            boundary: None,
            paused: false,
            live_projection: false,
        }
    }
    fn content(settings: &Settings) -> relative::Content {
        relative::Content {
            range_ahead: settings.range_ahead,
            range_behind: settings.range_behind,
            same_class: settings.class_scope == "sameClass",
            include_player: settings.include_player,
        }
    }
    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }
    pub fn size(&self) -> Size {
        self.painter.size()
    }
    pub fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        let paused = snapshot.map_or(self.paused, |s| {
            s.state.source_state == vantare_domain::SourceState::Paused
        });
        self.painter.size_for(paused)
    }
    pub fn view(&self) -> El {
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
        let paused = snapshot.state.source_state == vantare_domain::SourceState::Paused;
        if paused && self.paused {
            return Update::default();
        }
        self.paused = paused;
        if !paused || !self.live_projection {
            let mut retained;
            let snapshot = if paused {
                retained = snapshot.clone();
                retained.state.source_state = vantare_domain::SourceState::Live;
                &retained
            } else {
                snapshot
            };
            let board = relative::project_cached(
                snapshot,
                self.prefs,
                Self::content(&self.settings),
                &self.settings.footer_slots,
                Some(&self.board),
            );
            let boundary = Some((snapshot.epoch, snapshot.state.session.id.0, self.prefs));
            if !Arc::ptr_eq(&board, &self.board) || self.boundary != boundary {
                let snap = self.motion.reduced()
                    || self.boundary != boundary
                    || scene::waiting(&self.board)
                    || scene::waiting(&board);
                self.motion
                    .update(&board, &self.painter.targets(&board), snap, clock);
                self.board = board;
                self.boundary = boundary;
            }
            self.live_projection = vantare_domain::freshness::shows_last_live(snapshot);
        }
        self.animate(clock)
    }
    pub fn animate(&mut self, clock: f64) -> Update {
        self.motion.advance(&self.board, clock);
        let visual = scene::sample(self.board.clone(), &self.motion, self.paused, clock);
        if Arc::ptr_eq(&self.visual.board, &visual.board)
            && self.visual.rows == visual.rows
            && self.visual.strip == visual.strip
            && self.visual.paused == visual.paused
        {
            return Update::default();
        }
        let update = self.painter.sync(&visual);
        self.visual = visual;
        update
    }
    pub fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if let Some(due) = self.motion.next_wake(clock, self.painter.has_strip()) {
            tx.wake_at(due);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::layout::Options;
    use super::*;
    use vantare_domain::format::Language;
    use vantare_domain::{
        Quality::Reliable,
        widget_settings::{look::Tone, relative::vantare_template},
    };
    fn painter(reduced: bool) -> Relative {
        Relative::new(
            &Settings::default(),
            Preferences::default(),
            reduced,
            5,
            0.0,
        )
    }
    #[test]
    fn reordering_and_ghosts_finish_even_when_text_keeps_changing() {
        let mut painter = painter(false);
        let mut snapshot = crate::testdata::snapshot();
        painter.update(&snapshot, 0.0);
        let before = painter.motion.rows[&3].slot.value(0.0);
        snapshot.state.cars[2].relative_s = Reliable(-0.5);
        painter.update(&snapshot, 1.0);
        for n in 1..=160 {
            snapshot.sequence += 1;
            snapshot.state.cars[2].number = n.to_string();
            painter.update(&snapshot, 1.0 + f64::from(n) / 100.0);
        }
        let row = &painter.motion.rows[&3];
        assert_ne!(row.slot.value(2.6), before);
        assert!(!row.slot.active(2.6));
        assert!(row.flash.is_none());
        snapshot.state.cars.retain(|c| c.id.0 != 3);
        painter.update(&snapshot, 3.0);
        assert!(painter.motion.rows.contains_key(&3), "finite fading ghost");
        assert!(painter.animate(4.0).build);
        assert!(!painter.motion.rows.contains_key(&3));
        let idle = painter.animate(30.0);
        assert!(!idle.build && !idle.pixels);
    }
    #[test]
    fn reduced_motion_snaps_rows_and_has_no_pulse_or_finite_tail() {
        let mut painter = painter(true);
        let mut snapshot = crate::testdata::snapshot();
        painter.update(&snapshot, 0.0);
        snapshot.state.cars[2].relative_s = Reliable(-0.5);
        painter.update(&snapshot, 1.0);
        assert!(
            painter
                .motion
                .rows
                .values()
                .all(|r| !r.slot.active(1.0) && !r.fade.active(1.0) && r.flash.is_none())
        );
        assert!(painter.motion.next_pulse.is_none());
        let idle = painter.animate(30.0);
        assert!(!idle.build && !idle.pixels);
        assert!(!painter.policy(true, 5, 31.0).pixels);
    }
    #[test]
    fn traffic_pulses_at_widget_cadence_and_stops_when_reduced() {
        let settings = Settings {
            class_scope: "all".into(),
            ..Default::default()
        };
        let mut painter = Relative::new(&settings, Preferences::default(), false, 5, 0.0);
        let mut snapshot = crate::testdata::snapshot();
        let faster = &mut snapshot.state.cars[4];
        faster.class = Some(vantare_domain::Class {
            id: vantare_domain::ClassId(2),
            name: "Hypercar".into(),
        });
        faster.best_lap_s = Reliable(90.0);
        painter.update(&snapshot, 0.0);
        assert!(painter.board.traffic.is_some());
        assert!(painter.motion.next_pulse.is_some());
        assert!(!painter.animate(0.1).pixels);
        assert!(painter.animate(0.2).pixels);
        assert!(!painter.animate(0.25).pixels);
        painter.policy(false, 20, 0.25);
        assert_eq!(
            painter.motion.next_wake(0.25, true),
            Some(0.25 + 1.0 / 20.0)
        );
        painter.policy(false, 5, 0.25);
        assert_eq!(painter.motion.next_wake(0.25, true), Some(0.25 + 1.0 / 5.0));
        assert!(painter.policy(true, 5, 0.3).pixels);
        assert!(painter.motion.next_pulse.is_none());
        assert!(!painter.animate(1.0).pixels);

        // Exercise Rune's actual timer queue, with an empty CPU view and no window.
        painter.policy(false, 5, 1.0);
        let mut runtime = rune::Runtime::new(
            painter,
            |_, _| rune::el(),
            (1.0, 1.0),
            rune::Env::new(true, 1.0),
        );
        runtime.poll = Some(|relative, clock, tx| {
            relative.animate(clock);
            relative.schedule(clock, tx);
            false
        });
        runtime.frame(1.0);
        assert!(runtime.wake_deadline().is_some(), "traffic timer");
        runtime.state.update(&crate::testdata::snapshot(), 2.0);
        runtime.frame(1.0);
        assert!(runtime.state.board.traffic.is_none());
        assert_eq!(runtime.wake_deadline(), None, "no traffic, no timer");
        runtime.state.update(&snapshot, 3.0);
        runtime.frame(1.0);
        assert!(runtime.wake_deadline().is_some());
        runtime.state.policy(true, 5, 3.0);
        runtime.frame(1.0);
        assert_eq!(runtime.wake_deadline(), None, "reduced motion stops timers");
    }
    #[test]
    fn templates_tones_languages_and_reversed_custom_columns_keep_canonical_order() {
        for template in ["compact", "standard", "expanded"] {
            for tone in [Tone::Neo, Tone::Neutro] {
                let mut settings = Settings {
                    style: tone,
                    columns: Some(vantare_template(template)),
                    ..Default::default()
                };
                settings.columns.as_mut().expect("columns").reverse();
                let options = Options::from_settings(&settings);
                let expected = options.cols.order.clone();
                let mut painter = Relative::new(
                    &settings,
                    Preferences {
                        language: Language::En,
                        ..Default::default()
                    },
                    true,
                    15,
                    0.0,
                );
                painter.update(&crate::testdata::snapshot(), 0.0);
                assert_eq!(
                    painter
                        .painter
                        .plan
                        .columns
                        .iter()
                        .map(|c| c.kind)
                        .collect::<Vec<_>>(),
                    expected
                );
                assert!(
                    painter
                        .painter
                        .labels
                        .rows
                        .iter()
                        .flatten()
                        .any(|r| r.driver == "You")
                );
                assert!(
                    painter.painter.plan.width > 0.0
                        && painter.painter.plan.height >= painter.painter.plan.content
                );
                let _view = painter.view();
            }
        }
    }
    #[test]
    fn canonical_templates_keep_the_catalogue_widths() {
        for (template, width) in [("compact", 280.0), ("standard", 420.0), ("expanded", 600.0)] {
            let settings = Settings {
                columns: Some(vantare_template(template)),
                ..Default::default()
            };
            let painter = Relative::new(&settings, Preferences::default(), true, 15, 0.0);
            assert_eq!(painter.size().width, width, "{template}");
            assert_eq!(
                painter.painter.header[4].get().as_ref(),
                "Esperando al simulador"
            );
        }
    }
    #[test]
    fn targets_and_motion_ticks_reuse_layout_and_labels_for_the_same_board() {
        let mut relative = painter(false);
        relative.update(&crate::testdata::snapshot(), 0.0);
        let board = Arc::new((*relative.board).clone());
        relative.painter.targets(&board);
        let plan = relative.painter.plan.items.as_ptr();
        let title = relative.painter.labels.title.as_ptr();
        let mut visual = relative.visual.clone();
        visual.board = board.clone();
        assert!(!relative.painter.sync(&visual).build);
        visual.rows[0].opacity = 0.5;
        assert!(!relative.painter.sync(&visual).build);
        relative.painter.targets(&board);
        assert_eq!(relative.painter.plan.items.as_ptr(), plan);
        assert_eq!(relative.painter.labels.title.as_ptr(), title);
        relative.board = board;
        relative.animate(0.0);
        assert!(Arc::ptr_eq(&relative.visual.board, &relative.board));
        assert_eq!(relative.painter.plan.items.as_ptr(), plan);
        assert_eq!(relative.painter.labels.title.as_ptr(), title);
    }
    #[test]
    fn appearing_and_disappearing_banner_interpolates_canonical_layout_coordinates() {
        let mut relative = painter(false);
        let mut snapshot = crate::testdata::snapshot();
        let player = snapshot.state.player.as_ref().expect("player").car;
        relative.update(&snapshot, 0.0);
        let duration = f64::from(crate::vantare::Style::compiled().motion.reorder_ms) / 1000.0;
        for (clock, in_pits) in [(1.0, true), (3.0, false)] {
            let from = relative
                .visual
                .rows
                .iter()
                .find(|r| r.row.id == player)
                .expect("row")
                .slot;
            snapshot
                .state
                .cars
                .iter_mut()
                .find(|c| c.id == player)
                .expect("player car")
                .in_pits = Reliable(in_pits);
            snapshot.sequence += 1;
            relative.update(&snapshot, clock);
            assert_eq!(relative.board.banner.is_some(), in_pits);
            let index = relative
                .board
                .slots
                .iter()
                .position(|r| r.as_ref().is_some_and(|r| r.id == player))
                .expect("player slot");
            let target = relative.painter.targets(&relative.board)[index];
            assert_ne!(from, target);
            assert_eq!(
                relative
                    .visual
                    .rows
                    .iter()
                    .find(|r| r.row.id == player)
                    .expect("row")
                    .slot,
                from
            );
            relative.animate(clock + duration / 2.0);
            let halfway = relative
                .visual
                .rows
                .iter()
                .find(|r| r.row.id == player)
                .expect("row")
                .slot;
            assert!(halfway > from.min(target) && halfway < from.max(target));
            relative.animate(clock + duration);
            assert_eq!(
                relative
                    .visual
                    .rows
                    .iter()
                    .find(|r| r.row.id == player)
                    .expect("row")
                    .slot,
                target
            );
        }
    }
    #[test]
    fn pause_retains_last_live_rows_and_new_windows_can_project_the_retained_photo() {
        let mut painter = painter(true);
        let live = crate::testdata::snapshot();
        painter.update(&live, 0.0);
        let height = painter.size().height;
        let board = painter.board.clone();
        let mut paused = live.clone();
        paused.state.source_state = vantare_domain::SourceState::Paused;
        paused.state.cars[2].number = "unexpected".into();
        assert!(painter.update(&paused, 1.0).build);
        assert!(Arc::ptr_eq(&board, &painter.board));
        assert_eq!(painter.size().height, height + PAUSE_HEIGHT);
        assert!(!painter.update(&paused, 2.0).build);
        let mut opened = Relative::new(&Settings::default(), Preferences::default(), true, 5, 0.0);
        opened.update(&paused, 0.0);
        assert!(!opened.motion.rows.is_empty());
        assert!(painter.update(&live, 3.0).build);
        assert_eq!(painter.size().height, height);
    }
}
