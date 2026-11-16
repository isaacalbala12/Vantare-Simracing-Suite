//! Avisos de sesión: proyección de LMU, máquina de avisos de domain y Look Vantare.
//! Sin sonido y sin avisos de calendario: diferencia declarada, se hace en un PR aparte.
mod render;
pub mod scene;
use crate::motion::Tween;
use crate::widget::Update;
use rune::El;
use vantare_domain::{
    Snapshot,
    format::Preferences,
    geometry::Size,
    session_alerts::{self as model, Machine, Options, View},
    widget_settings::session_alerts::Settings,
};

/// The GPUI painter fades the notice in and out over 150 ms.
const FADE: f64 = 0.15;

pub(crate) struct SessionAlerts {
    settings: Settings,
    options: Options,
    prefs: Preferences,
    machine: Machine,
    view: View,
    /// Wall clock the runtime clock is added to, already discounted on construction.
    wall: u64,
    /// A photo arrived: the widget is in track, not in the Studio preview.
    live: bool,
    reduced: bool,
    hz: u16,
    fade: Tween,
    shown: Option<(String, u64)>,
    /// Last photo seen, to deduplicate like the GPUI ingest does.
    cursor: Option<(u64, u64)>,
    input: Option<model::SessionInput>,
    /// Agenda plug of the next PR: the calendar feed will arrive here, empty for now.
    #[allow(dead_code)]
    calendar: Vec<model::CalendarInput>,
    painter: render::Painter,
    visual: scene::Scene,
}
impl SessionAlerts {
    pub fn new(settings: &Settings, prefs: Preferences, clock: f64) -> Self {
        let wall = match vantare_ipc::control::wall_ms() {
            Ok(wall) => wall_base(clock, wall),
            Err(_) => {
                // A calendar compares wall milliseconds: say it once instead of hiding it.
                static ONCE: std::sync::atomic::AtomicBool =
                    std::sync::atomic::AtomicBool::new(true);
                if ONCE.swap(false, std::sync::atomic::Ordering::Relaxed) {
                    eprintln!(
                        "overlays-rune: sin hora de pared; los avisos de calendario no estarán disponibles"
                    );
                }
                wall_base(clock, 0)
            }
        };
        Self::with_wall(settings, prefs, wall)
    }
    /// Deterministic constructor: the tests hand the wall base instead of reading a clock.
    fn with_wall(settings: &Settings, prefs: Preferences, wall: u64) -> Self {
        let settings = settings.normalized();
        let options = options(&settings);
        let view = View::default();
        let initial = scene::sample(&settings, &view, None, false, 1.0);
        let painter = render::Painter::new(&initial, &settings.style);
        Self {
            settings,
            options,
            prefs,
            machine: Machine::default(),
            view,
            wall,
            live: false,
            reduced: false,
            hz: 0,
            fade: Tween::linear(1.0),
            shown: None,
            cursor: None,
            input: None,
            calendar: Vec::new(),
            painter,
            visual: initial,
        }
    }
    fn now(&self, clock: f64) -> u64 {
        self.wall.saturating_add((clock.max(0.0) * 1000.0) as u64)
    }
    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }
    pub fn size(&self) -> Size {
        self.painter.size()
    }
    /// The bounds only depend on the settings, so the host can place it before any photo.
    pub fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        let (width, height) = scene::size(&self.settings);
        Size { width, height }
    }
    pub fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        let changed = self.reduced != reduced || self.hz != hz;
        self.reduced = reduced;
        self.hz = hz;
        if changed {
            self.animate(clock)
        } else {
            Update::default()
        }
    }
    pub fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let cursor = (snapshot.epoch, snapshot.sequence);
        let input = model::project(snapshot);
        // The same photo twice is not news: dedupe on the sequence, as GPUI's ingest does.
        if self.cursor == Some(cursor) && self.input == input {
            return Update::default();
        }
        self.cursor = Some(cursor);
        self.input = input.clone();
        self.live = true;
        self.machine.session(input, self.now(clock), &self.options);
        self.animate(clock)
    }
    pub fn animate(&mut self, clock: f64) -> Update {
        let now = self.now(clock);
        self.view = self.machine.tick(now, &self.options);
        self.fade(now, clock);
        let opacity = if self.reduced {
            self.fade.to
        } else {
            self.fade.value(clock)
        };
        let counter = self
            .view
            .active
            .as_ref()
            .and_then(|notice| self.machine.countdown(&notice.event, now));
        let next = scene::sample(
            &self.settings,
            &self.view,
            counter.as_ref(),
            self.live,
            opacity,
        );
        if next == self.visual {
            return Update::default();
        }
        let update = self.painter.sync(&next);
        self.visual = next;
        update
    }
    /// 150 ms in and out for the main notice; reduced motion removes the animation, not
    /// the notice, so it stays at full opacity until it ends.
    fn fade(&mut self, now: u64, clock: f64) {
        let key = self
            .view
            .active
            .as_ref()
            .map(|notice| (notice.event.clone(), notice.started_at_ms));
        if key != self.shown {
            self.shown = key.clone();
            self.fade = Tween::linear(0.0);
        }
        let target = match &self.view.active {
            Some(notice) if !self.reduced && now.saturating_add(150) >= notice.ends_at_ms => 0.0,
            Some(_) => 1.0,
            None => 0.0,
        };
        if self.reduced {
            self.fade = Tween::linear(target);
        } else if (self.fade.to - target).abs() > f32::EPSILON {
            self.fade.retarget(target, clock, FADE);
        }
    }
    /// One wake per second while a notice or a row is drawn; frames only while the notice
    /// fades. Without either there is no clock at all, reduced motion or not.
    pub fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        let companion = self.settings.companion_for.is_some();
        let active = !companion && self.view.active.is_some();
        // The main never draws the rows, so it keeps no clock for them; the companion does.
        let ticking = (companion && self.settings.mini && !self.view.minis.is_empty()) || active;
        if active && !self.reduced && self.fade.active(clock) {
            let step = 1.0 / f64::from(if self.hz == 0 { 30 } else { self.hz });
            tx.wake_at(clock + step);
            return;
        }
        let now = self.now(clock);
        if ticking {
            let until_end = if active {
                self.view
                    .active
                    .as_ref()
                    .map_or(1, |notice| {
                        // Only the fade needs the 150 ms margin; with reduced motion there is
                        // no fade, and subtracting it would schedule 1 ms wakes at the end.
                        let margin = if self.reduced { 0 } else { 150 };
                        notice.ends_at_ms.saturating_sub(now).saturating_sub(margin)
                    })
                    .max(1)
            } else {
                1_000
            };
            let second = 1000 - now % 1000;
            tx.wake_at(clock + f64::from(second.min(until_end) as u32) / 1000.0);
            return;
        }
        if let Some(at) = self.machine.next_wake_at(now, &self.options) {
            tx.wake_at(clock + at.saturating_sub(now) as f64 / 1000.0);
        }
    }
    pub fn view(&self) -> El {
        self.painter.view()
    }
}

/// Wall milliseconds are what a calendar compares. The runtime clock already ran when the
/// widget is built, so its offset is discounted here and added back in `now`; the host
/// brings the wall reading in production and the tests inject their own.
fn wall_base(clock: f64, wall_ms: u64) -> u64 {
    wall_ms.saturating_sub((clock.max(0.0) * 1000.0) as u64)
}

fn options(settings: &Settings) -> Options {
    Options {
        thresholds: settings.thresholds.clone(),
        session: settings.session,
        calendar: settings.calendar,
        finished: settings.finished,
        starts: settings.starts,
        duration_ms: u64::from(settings.duration_seconds) * 1000,
        mini: settings.mini,
        mini_session: settings.mini_session,
        mini_final: settings.mini_final,
        mini_calendar: settings.mini_calendar,
        mini_start: settings.mini_start,
        mini_limit: usize::from(settings.mini_limit),
    }
}

impl crate::widget::Widget for SessionAlerts {
    fn new(
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        clock: f64,
    ) -> Option<Box<dyn crate::widget::Widget>> {
        let vantare_domain::widget_settings::Settings::SessionAlerts(settings) = settings else {
            return None;
        };
        Some(Box::new(SessionAlerts::new(settings, prefs, clock)))
    }
    fn configured(
        &self,
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
    ) -> bool {
        let vantare_domain::widget_settings::Settings::SessionAlerts(settings) = settings else {
            return false;
        };
        SessionAlerts::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        SessionAlerts::size(self)
    }
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        SessionAlerts::size_for(self, snapshot)
    }
    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        SessionAlerts::policy(self, reduced, hz, clock)
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        SessionAlerts::update(self, snapshot, clock)
    }
    fn animate(&mut self, clock: f64) -> Update {
        SessionAlerts::animate(self, clock)
    }
    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        SessionAlerts::schedule(self, clock, tx);
    }
    fn view(&self) -> El {
        SessionAlerts::view(self)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    use vantare_domain::{
        Quality::Reliable,
        SessionKind, SourceKind, SourceState,
        widget_settings::{self, session_alerts::Settings as Stored},
    };

    /// A live LMU practice session ending in five minutes, so its threshold fires.
    fn photo(elapsed: f64) -> Snapshot {
        let mut snapshot = crate::testdata::snapshot();
        snapshot.origin.source.simulator = "lmu";
        snapshot.origin.source.kind = SourceKind::Live;
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.session.kind = Reliable(SessionKind::Practice);
        snapshot.state.session.elapsed_s = Reliable(elapsed);
        snapshot.state.session.timing.scheduled_end_s = Reliable(300.0);
        snapshot
    }
    fn settings() -> Stored {
        Stored::default()
    }
    /// No real clock: the wall base is zero, so `now` is exactly the runtime clock.
    fn widget() -> SessionAlerts {
        SessionAlerts::with_wall(&settings(), Preferences::default(), 0)
    }
    fn companion() -> Stored {
        Stored {
            companion_for: Some("main".into()),
            ..Stored::default()
        }
    }
    fn paint_payload(instance: &rune::render::Instance) -> [[u32; 4]; 8] {
        [
            instance.rect.map(f32::to_bits),
            instance.radii.map(f32::to_bits),
            instance.fill.map(f32::to_bits),
            instance.border.map(f32::to_bits),
            instance.params.map(f32::to_bits),
            instance.uv.map(f32::to_bits),
            instance.clip.map(f32::to_bits),
            instance.fade,
        ]
    }
    /// Compare every field of the CPU painter stream: `Runtime::frame` only reports
    /// whether an animation is still running, not whether the image changed.
    fn rendered_frame(runtime: &mut Runtime<SessionAlerts>, dt: f64) -> bool {
        let before = runtime.instances.clone();
        runtime.frame(dt);
        before.len() != runtime.instances.len()
            || before
                .iter()
                .map(paint_payload)
                .ne(runtime.instances.iter().map(paint_payload))
    }
    fn paint(widget: &SessionAlerts, _: &mut rune::Cx<SessionAlerts>) -> El {
        widget.view()
    }
    thread_local! {
        /// The photo the host keeps delivering, as its revision does.
        static NEXT: std::cell::RefCell<Option<Snapshot>> = const { std::cell::RefCell::new(None) };
    }
    fn push(snapshot: Snapshot) {
        NEXT.with(|next| *next.borrow_mut() = Some(snapshot));
    }
    fn poll(widget: &mut SessionAlerts, clock: f64, tx: &mut rune::Tx) -> bool {
        // Own finite curves update the Live values: no implicit Rune springs on data.
        tx.instant();
        let mut build = SessionAlerts::animate(widget, clock).build;
        if let Some(photo) = NEXT.with(|next| next.borrow().clone()) {
            build |= SessionAlerts::update(widget, &photo, clock).build;
        }
        SessionAlerts::schedule(widget, clock, tx);
        build
    }
    fn host(widget: SessionAlerts) -> Runtime<SessionAlerts> {
        let (width, height) = scene::size(&widget.settings);
        let mut runtime = Runtime::with_text(
            widget,
            paint,
            (width, height),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(poll);
        runtime
    }
    /// Primes the runtime, then delivers the first photo: the notice appears.
    fn opened() -> Runtime<SessionAlerts> {
        let mut runtime = host(widget());
        runtime.frame(0.0);
        push(photo(0.0));
        assert!(rendered_frame(&mut runtime, 0.0), "el aviso aparece");
        runtime
    }
    /// Paints one scene on its own, without photos or machine.
    fn painted_with(scene: &scene::Scene, style: &str) -> Runtime<render::Painter> {
        let mut runtime = Runtime::with_text(
            render::Painter::new(scene, style),
            |painter: &render::Painter, _: &mut rune::Cx<render::Painter>| painter.view(),
            scene.size,
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.frame(0.0);
        runtime
    }
    fn painted(scene: &scene::Scene) -> Runtime<render::Painter> {
        painted_with(scene, "neo")
    }
    fn rows(count: usize) -> Vec<scene::Row> {
        (0..count)
            .map(|index| scene::Row {
                label: format!("FIN · PRÁCTICAS {index}"),
                value: format!("0{}:30", index + 1),
                calm: index % 2 == 0,
            })
            .collect()
    }
    fn row_scene(settings: &Stored, count: usize) -> scene::Scene {
        scene::Scene {
            size: scene::size(settings),
            scale: scene::scale(settings),
            opacity: 1.0,
            notice: None,
            placeholder: None,
            ghost: None,
            rows: rows(count),
        }
    }
    fn keys<T: 'static>(runtime: &Runtime<T>) -> Vec<String> {
        runtime
            .elements()
            .into_iter()
            .filter_map(|element| element.key)
            .collect()
    }

    /// Deterministic: no test here reads the real clock, so the second boundary of the
    /// machine never depends on when the suite happens to run.
    #[test]
    fn the_wall_base_discounts_the_runtime_clock_and_now_adds_it_back() {
        let widget = SessionAlerts::with_wall(&settings(), Preferences::default(), 1_000);
        assert_eq!(
            widget.now(0.0),
            1_000,
            "el reloj del runtime suma a la base"
        );
        assert_eq!(widget.now(2.5), 3_500);
        assert_eq!(wall_base(5.0, 10_000), 5_000, "la base descuenta el reloj");
        assert_eq!(wall_base(0.0, 10_000), 10_000);
        assert_eq!(wall_base(20.0, 1_000), 0, "nunca por debajo de cero");
    }

    #[test]
    fn the_controller_turns_a_live_photo_into_a_notice() {
        let mut widget = widget();
        let update = widget.update(&photo(0.0), 0.0);
        assert!(widget.live, "la foto marca la pista");
        assert!(widget.visual.notice.is_some(), "el umbral produce aviso");
        assert!(update.build || update.pixels, "algo que pintar");
    }

    #[test]
    fn the_same_photo_is_not_projected_twice() {
        let mut widget = widget();
        assert!(widget.update(&photo(0.0), 0.0).build);
        let again = widget.update(&photo(0.0), 0.0);
        assert!(!again.build && !again.pixels, "la misma foto no repite");
        let mut next = photo(5.0);
        next.sequence += 1;
        let newer = widget.update(&next, 0.0);
        assert!(
            newer.build || newer.pixels,
            "la misma secuencia no repite; un dato nuevo sí"
        );
    }

    #[test]
    fn the_countdown_changes_once_per_second_and_nothing_in_between() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut runtime = opened();
        assert!(runtime.wake_deadline().is_some(), "hay reloj con aviso");
        for second in 1..=2 {
            let before = runtime
                .state
                .visual
                .notice
                .as_ref()
                .map(|n| n.value.clone());
            push(photo(f64::from(second)));
            assert!(
                rendered_frame(&mut runtime, 1.0),
                "una imagen en el segundo {second}"
            );
            let after = runtime
                .state
                .visual
                .notice
                .as_ref()
                .map(|n| n.value.clone());
            assert_ne!(
                before, after,
                "la cuenta atrás avanza: {before:?} -> {after:?}"
            );
            // Tras un dato nuevo el widget puede asentarse; después se queda quieto.
            rendered_frame(&mut runtime, 0.1);
            assert!(!rendered_frame(&mut runtime, 0.1), "y se queda quieto");
        }
    }

    #[test]
    fn the_notice_leaves_after_its_duration_and_the_clock_stops() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut runtime = opened();
        let mut painted = 0;
        for step in 1..=40 {
            push(photo(f64::from(step) * 0.5));
            painted += u8::from(rendered_frame(&mut runtime, 0.5));
        }
        assert!(painted >= 1, "el aviso se marcha");
        assert!(runtime.state.visual.notice.is_none(), "el panel desaparece");
    }

    #[test]
    fn reduced_motion_keeps_the_data_clock_and_leaves_no_clock_afterwards() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut runtime = opened();
        runtime.state.policy(true, 5, 1.0);
        rendered_frame(&mut runtime, 0.1);
        assert_eq!(runtime.state.visual.opacity, 1.0, "el aviso no se apaga");
        assert!(
            runtime.wake_deadline().is_some(),
            "la cuenta atrás sigue con reloj"
        );
        for step in 1..=40 {
            push(photo(f64::from(step) * 0.5));
            rendered_frame(&mut runtime, 0.5);
        }
        assert!(runtime.state.visual.notice.is_none(), "el aviso termina");
    }

    #[test]
    fn the_transparent_style_shadows_the_ghost_like_gpui() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let studio = companion();
        let ghost = scene::Scene {
            ghost: Some("Mini cuenta atrás".into()),
            ..row_scene(&studio, 0)
        };
        let transparent = keys(&painted_with(&ghost, "transparente"));
        assert!(
            transparent.iter().any(|key| key == "ghost-shadow"),
            "el ghost lleva sombra en transparente: {transparent:?}"
        );
        assert!(transparent.iter().any(|key| key == "ghost"));
        let neo = keys(&painted(&ghost));
        assert!(!neo.iter().any(|key| key == "ghost-shadow"), "en neo no");
    }

    #[test]
    fn reduced_motion_does_not_schedule_one_millisecond_wakes() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut runtime = opened();
        runtime.state.policy(true, 5, 1.0);
        for step in 1..=7 {
            push(photo(f64::from(step)));
            rendered_frame(&mut runtime, 1.0);
        }
        push(photo(7.9));
        assert!(rendered_frame(&mut runtime, 0.9), "queda el último tramo");
        let deadline = runtime
            .wake_deadline()
            .expect("despierta al terminar el aviso");
        assert!(
            deadline - 7.9 >= 0.05,
            "sin despertares de 1 ms: {}",
            deadline - 7.9
        );
    }

    #[test]
    fn only_the_companion_keeps_the_second_clock_for_its_rows() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut main = opened();
        for step in 1..=40 {
            push(photo(f64::from(step) * 0.5));
            rendered_frame(&mut main, 0.5);
        }
        assert!(main.state.visual.notice.is_none(), "el aviso terminó");
        assert!(
            main.wake_deadline().is_none(),
            "el principal no late por unas minis que no pinta"
        );
        let settings = companion();
        let mut mini = host(SessionAlerts::with_wall(
            &settings,
            Preferences::default(),
            0,
        ));
        mini.frame(0.0);
        for step in 1..=40 {
            push(photo(f64::from(step) * 0.5));
            rendered_frame(&mut mini, 0.5);
        }
        assert!(!mini.state.visual.rows.is_empty(), "la mini pinta filas");
        let deadline = mini.wake_deadline().expect("late con las filas");
        assert!(deadline <= 21.0, "la mini late cada segundo: {deadline}");
    }

    #[test]
    fn without_a_session_there_is_no_clock() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut runtime = host(widget());
        runtime.frame(0.0);
        assert!(
            runtime.wake_deadline().is_none(),
            "sin sesión ni filas no hay reloj"
        );
    }

    #[test]
    fn the_studio_hint_is_painted_at_full_opacity_without_photos() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut runtime = host(widget());
        runtime.frame(0.0);
        assert!(
            runtime.state.visual.placeholder.is_some(),
            "vista del Studio"
        );
        let elements = runtime.elements();
        assert!(!elements.is_empty(), "la pista pinta el cartel");
        assert!(
            elements.iter().all(|element| element.opacity > 0.99),
            "sin foto todo se ve: el fade es solo del aviso"
        );
    }

    #[test]
    fn the_companion_paints_its_rows_without_a_notice_and_never_fades() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let settings = companion();
        let mut runtime = painted(&row_scene(&settings, 3));
        let painted_keys = keys(&runtime);
        for index in 0..3 {
            assert!(
                painted_keys
                    .iter()
                    .any(|key| key == &format!("row-{index}")),
                "fila {index}: {painted_keys:?}"
            );
        }
        assert!(
            runtime
                .elements()
                .iter()
                .all(|element| element.opacity > 0.99),
            "las filas no se apagan con el fade"
        );
        crate::testdata::assert_inside_window(&mut runtime, scene::size(&settings));
    }

    #[test]
    fn the_companion_ghost_and_the_three_row_variants_fit_their_windows() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let studio = companion();
        let ghost = scene::Scene {
            ghost: Some("Mini cuenta atrás".into()),
            ..row_scene(&studio, 0)
        };
        let mut painted_ghost = painted(&ghost);
        assert!(
            keys(&painted_ghost).iter().any(|key| key == "ghost-panel"),
            "el aviso de la vista previa se pinta"
        );
        crate::testdata::assert_inside_window(&mut painted_ghost, scene::size(&studio));
        for size in ["s", "m", "l"] {
            let settings = Stored {
                mini_size: size.into(),
                mini_limit: 3,
                ..studio.clone()
            };
            let mut runtime = painted(&row_scene(&settings, 3));
            crate::testdata::assert_inside_window(&mut runtime, scene::size(&settings));
        }
    }

    #[test]
    fn the_main_widget_never_paints_companion_rows() {
        let scene = scene::sample(
            &settings(),
            &View {
                minis: vec![vantare_domain::session_alerts::Mini {
                    event: "session:1:7".into(),
                    label: "PRÁCTICAS".into(),
                    calendar: false,
                    seconds: 30,
                    distance_m: None,
                    scheduled: false,
                    distance_estimated: false,
                }],
                ..Default::default()
            },
            None,
            true,
            1.0,
        );
        assert!(scene.rows.is_empty(), "el principal no pinta filas");
    }

    #[test]
    fn nothing_painted_falls_outside_the_window() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        for settings in [settings(), companion()] {
            let size = scene::size(&settings);
            let mut runtime = host(SessionAlerts::with_wall(
                &settings,
                Preferences::default(),
                0,
            ));
            runtime.frame(0.0);
            push(photo(0.0));
            rendered_frame(&mut runtime, 0.0);
            assert!(!runtime.elements().is_empty(), "la vista pinta algo");
            crate::testdata::assert_inside_window(&mut runtime, size);
        }
    }

    #[test]
    fn the_constructor_takes_its_settings_and_rejects_other_kinds() {
        let stored = widget_settings::Settings::SessionAlerts(settings());
        let prefs = Preferences::default();
        let painter = <SessionAlerts as crate::widget::Widget>::new(&stored, prefs, false, 5, 0.0)
            .expect("avisos");
        assert!(painter.configured(&stored, prefs));
        assert_eq!(
            painter.size(),
            Size {
                width: 480.0,
                height: 88.0
            }
        );
        let mini = widget_settings::Settings::SessionAlerts(companion());
        assert_eq!(
            <SessionAlerts as crate::widget::Widget>::new(&mini, prefs, false, 5, 0.0)
                .expect("mini")
                .size(),
            Size {
                width: 210.0,
                height: 124.0
            }
        );
        assert!(
            <SessionAlerts as crate::widget::Widget>::new(
                &widget_settings::Settings::Pedals(Default::default()),
                prefs,
                false,
                5,
                0.0
            )
            .is_none()
        );
    }
}
