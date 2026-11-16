//! Observed delta histories, using the same domain state as GPUI. No animation clock.
mod render;
use crate::widget::{Update, Widget};
use render::Painter;
use rune::El;
use std::sync::Arc;
use vantare_domain::{
    Snapshot,
    delta_trace::{self, Details, LapHistory, Sample, Trace, ViewModel},
    format::Preferences,
    geometry::Size,
    widget_settings::{Settings as WidgetSettings, delta_trace::Settings},
};

pub(crate) struct DeltaTrace {
    settings: Settings,
    prefs: Preferences,
    trace: Trace,
    history: LapHistory,
    history_version: u64,
    vm: ViewModel,
    details: Details,
    samples: Arc<Vec<Sample>>,
    painter: Painter,
}
impl DeltaTrace {
    fn new(settings: &Settings, prefs: Preferences) -> Self {
        let snapshot = Snapshot::default();
        let settings = settings.normalized();
        let board = delta_trace::project_board(&snapshot, prefs, &settings.reference);
        let vm = delta_trace::project(&snapshot, prefs);
        let details = Details::from(&snapshot, prefs, &board);
        let samples = Arc::new(Vec::new());
        let history = LapHistory::default();
        let painter = Painter::new(&vm, &samples, &history, &details, prefs);
        Self {
            settings,
            prefs,
            trace: Trace::default(),
            history,
            history_version: 0,
            vm,
            details,
            samples,
            painter,
        }
    }
    fn ingest(&mut self, snapshot: &Snapshot) -> Update {
        let board = delta_trace::project_board(snapshot, self.prefs, &self.settings.reference);
        self.details = Details::from(snapshot, self.prefs, &board);
        if self.history.push_with_board(snapshot, &board) {
            self.history_version = self.history_version.wrapping_add(1);
        }
        if self.trace.push_with_board(
            snapshot,
            std::time::Duration::from_secs_f64(self.settings.window_seconds),
            &board,
        ) {
            self.samples = Arc::new(self.trace.samples().iter().copied().collect());
        }
        self.vm = self.trace.project_with_board(snapshot, self.prefs, &board);
        self.painter.sync(
            &self.vm,
            &self.samples,
            &self.history,
            self.history_version,
            &self.details,
        )
    }
}
impl Widget for DeltaTrace {
    fn new(
        settings: &WidgetSettings,
        prefs: Preferences,
        _: bool,
        _: u16,
        _: f64,
    ) -> Option<Box<dyn Widget>> {
        let WidgetSettings::DeltaTrace(settings) = settings else {
            return None;
        };
        Some(Box::new(Self::new(settings, prefs)))
    }
    fn configured(&self, settings: &WidgetSettings, prefs: Preferences) -> bool {
        matches!(settings, WidgetSettings::DeltaTrace(s) if s.normalized() == self.settings)
            && prefs == self.prefs
    }
    fn size(&self) -> Size {
        Size {
            width: 760.0,
            height: 192.0,
        }
    }
    fn size_for(&self, _: Option<&Snapshot>) -> Size {
        self.size()
    }
    fn policy(&mut self, _: bool, _: u16, _: f64) -> Update {
        Update::default()
    }
    fn update(&mut self, snapshot: &Snapshot, _: f64) -> Update {
        self.ingest(snapshot)
    }
    fn animate(&mut self, _: f64) -> Update {
        Update::default()
    }
    fn schedule(&self, _: f64, _: &mut rune::Tx) {}
    fn view(&self) -> El {
        self.painter.view()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    use vantare_domain::Quality::Reliable;
    fn view(widget: &DeltaTrace, _: &mut rune::Cx<DeltaTrace>) -> El {
        widget.view()
    }
    fn payload(i: &rune::render::Instance) -> [[u32; 4]; 8] {
        [
            i.rect.map(f32::to_bits),
            i.radii.map(f32::to_bits),
            i.fill.map(f32::to_bits),
            i.border.map(f32::to_bits),
            i.params.map(f32::to_bits),
            i.uv.map(f32::to_bits),
            i.clip.map(f32::to_bits),
            i.fade,
        ]
    }
    fn photo() -> Snapshot {
        let mut s = crate::testdata::snapshot();
        s.state.session.track_length_m = Reliable(1000.0);
        let id = s.state.player.unwrap().car;
        let car = s.state.cars.iter_mut().find(|c| c.id == id).unwrap();
        car.laps = Reliable(4);
        car.lap_distance_m = Reliable(100.0);
        s
    }
    #[test]
    fn repeated_and_sequence_only_photos_preserve_scene_path_and_samples() {
        let mut widget = DeltaTrace::new(&Settings::default(), Preferences::default());
        let mut s = photo();
        widget.ingest(&s);
        let version = widget.history_version;
        let samples = widget.samples.clone();
        let graph = widget.painter.graph();
        let u = widget.ingest(&s);
        assert!(!u.build && !u.pixels);
        s.sequence += 1;
        let u = widget.ingest(&s);
        assert!(!u.build && !u.pixels);
        assert!(Arc::ptr_eq(&samples, &widget.samples));
        assert!(Arc::ptr_eq(&graph, &widget.painter.graph()));
        assert_eq!(widget.history_version, version);
    }
    #[test]
    fn changed_visible_data_repaints_even_without_a_new_sequence() {
        let mut widget = DeltaTrace::new(&Settings::default(), Preferences::default());
        let mut s = photo();
        widget.ingest(&s);
        s.state.player.as_mut().unwrap().delta_best_s = Reliable(-0.4);
        let update = widget.ingest(&s);
        assert!(update.build || update.pixels);
    }
    #[test]
    fn actual_view_stays_inside_the_window_and_reduced_motion_has_no_clock() {
        let mut widget = DeltaTrace::new(&Settings::default(), Preferences::default());
        let mut snapshot = photo();
        widget.ingest(&snapshot);
        let mut rt = Runtime::with_text(
            widget,
            view,
            (760.0, 192.0),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        rt.frame(0.0);
        crate::testdata::assert_inside_window(&mut rt, (760.0, 192.0));
        let before = rt.instances.clone();
        let builds = rt.stats.commits;
        for sequence in [snapshot.sequence, snapshot.sequence + 1] {
            snapshot.sequence = sequence;
            assert!(!rt.update_if(|s, _| {
                let update = s.ingest(&snapshot);
                assert!(!update.build && !update.pixels);
                update.build
            }));
            rt.frame(0.0);
            assert_eq!(rt.stats.commits, builds);
            assert!(
                before
                    .iter()
                    .map(payload)
                    .eq(rt.instances.iter().map(payload))
            );
        }
        assert!(!rt.update_if(|s, tx| {
            s.policy(true, 60, 0.0);
            s.schedule(0.0, tx);
            s.animate(0.0).build
        }));
        rt.frame(1.0);
        assert_eq!(rt.stats.commits, builds);
        assert!(
            before
                .iter()
                .map(payload)
                .eq(rt.instances.iter().map(payload))
        );
        assert!(rt.wake_deadline().is_none());
    }
}
