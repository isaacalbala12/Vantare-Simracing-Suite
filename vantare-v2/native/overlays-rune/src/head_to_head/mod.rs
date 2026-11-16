//! Cara a cara: domain projection, pause retention and the retained Vantare Look.
mod render;
pub mod scene;
use crate::widget::Update;
use rune::El;
use vantare_domain::{
    Snapshot, SourceState,
    format::Preferences,
    geometry::Size,
    head_to_head::{self, Target, ViewModel},
    widget_settings::head_to_head::Settings,
};

const WIDTH: f32 = 780.0;
const HEIGHT: f32 = 72.0;
/// Pause band of the GPUI host: it grows the window below the widget, never over it.
const PAUSE_HEIGHT: f32 = 22.0;

pub(crate) struct HeadToHead {
    settings: Settings,
    prefs: Preferences,
    vm: ViewModel,
    painter: render::Painter,
    visual: scene::Scene,
    paused: bool,
    live_projection: bool,
}
impl HeadToHead {
    pub fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        let vm = head_to_head::project(&Snapshot::default(), prefs, target(&settings));
        let visual = sample(&settings, prefs, &vm, false);
        let painter = render::Painter::new(&visual);
        Self {
            settings,
            prefs,
            vm,
            painter,
            visual,
            paused: false,
            live_projection: false,
        }
    }
    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }
    pub fn size(&self) -> Size {
        self.painter.size()
    }
    pub fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        let paused = snapshot.map_or(self.paused, |photo| {
            photo.state.source_state == SourceState::Paused
        });
        Size {
            width: WIDTH,
            height: HEIGHT + if paused { PAUSE_HEIGHT } else { 0.0 },
        }
    }
    /// Nothing moves, so reduced motion and the cadence need no work of their own.
    pub fn policy(&mut self, _reduced: bool, _hz: u16, _clock: f64) -> Update {
        Update::default()
    }
    pub fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        let paused = snapshot.state.source_state == SourceState::Paused;
        if paused && self.paused {
            return Update::default();
        }
        self.paused = paused;
        if !paused || !self.live_projection {
            let mut retained;
            let photo = if paused {
                retained = snapshot.clone();
                retained.state.source_state = SourceState::Live;
                &retained
            } else {
                snapshot
            };
            let vm = head_to_head::project(photo, self.prefs, target(&self.settings));
            if vm != self.vm {
                self.vm = vm;
            }
            self.live_projection = vantare_domain::freshness::shows_last_live(photo);
        }
        self.animate(clock)
    }
    pub fn animate(&mut self, _clock: f64) -> Update {
        let visual = sample(&self.settings, self.prefs, &self.vm, self.paused);
        if visual == self.visual {
            return Update::default();
        }
        let update = self.painter.sync(&visual);
        self.visual = visual;
        update
    }
    pub fn schedule(&self, _clock: f64, _tx: &mut rune::Tx) {}
    pub fn view(&self) -> El {
        self.painter.view()
    }
}

fn target(settings: &Settings) -> Target {
    if settings.target == "behind" {
        Target::Behind
    } else {
        Target::Ahead
    }
}
fn sample(settings: &Settings, prefs: Preferences, vm: &ViewModel, paused: bool) -> scene::Scene {
    scene::sample(vm, settings.show_sectors, prefs.language, paused)
}

impl crate::widget::Widget for HeadToHead {
    fn new(
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
        _reduced: bool,
        _hz: u16,
        _clock: f64,
    ) -> Option<Box<dyn crate::widget::Widget>> {
        let vantare_domain::widget_settings::Settings::HeadToHead(settings) = settings else {
            return None;
        };
        Some(Box::new(HeadToHead::new(settings, prefs)))
    }
    fn configured(
        &self,
        settings: &vantare_domain::widget_settings::Settings,
        prefs: Preferences,
    ) -> bool {
        let vantare_domain::widget_settings::Settings::HeadToHead(settings) = settings else {
            return false;
        };
        HeadToHead::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        HeadToHead::size(self)
    }
    fn size_for(&self, snapshot: Option<&Snapshot>) -> Size {
        HeadToHead::size_for(self, snapshot)
    }
    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        HeadToHead::policy(self, reduced, hz, clock)
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        HeadToHead::update(self, snapshot, clock)
    }
    fn animate(&mut self, clock: f64) -> Update {
        HeadToHead::animate(self, clock)
    }
    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        HeadToHead::schedule(self, clock, tx);
    }
    fn view(&self) -> El {
        HeadToHead::view(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vantare::paint::{Face, font};
    use rune::{Env, Runtime};
    use vantare_domain::{
        CarId,
        Quality::Reliable,
        SessionKind,
        widget_settings::{self, head_to_head::Settings as Stored},
    };

    /// Seven cars, player in P4, rival ahead in P3; race order, not best lap.
    fn snapshot() -> Snapshot {
        let mut snapshot = crate::testdata::snapshot();
        snapshot.state.session.kind = Reliable(SessionKind::Race);
        for car in &mut snapshot.state.cars {
            let id = f64::from(car.id.0);
            car.relative_s = Reliable(4.0 - id);
            car.last_lap_s = Reliable(110.0 - id);
        }
        snapshot
    }
    fn widget() -> HeadToHead {
        HeadToHead::new(&Stored::default(), Preferences::default())
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
    fn rendered_frame(runtime: &mut Runtime<HeadToHead>, dt: f64) -> bool {
        let before = runtime.instances.clone();
        runtime.frame(dt);
        before.len() != runtime.instances.len()
            || before
                .iter()
                .map(paint_payload)
                .ne(runtime.instances.iter().map(paint_payload))
    }
    fn paint(widget: &HeadToHead, _: &mut rune::Cx<HeadToHead>) -> El {
        widget.view()
    }
    thread_local! {
        /// Photo the next poll syncs, as the host's pending revision does.
        static NEXT: std::cell::RefCell<Option<Snapshot>> = const { std::cell::RefCell::new(None) };
    }
    fn push(snapshot: Snapshot) {
        NEXT.with(|next| *next.borrow_mut() = Some(snapshot));
    }
    fn poll(widget: &mut HeadToHead, clock: f64, tx: &mut rune::Tx) -> bool {
        let photo = NEXT.with(|next| next.borrow_mut().take());
        let build = photo.is_some_and(|photo| HeadToHead::update(widget, &photo, clock).build);
        HeadToHead::schedule(widget, clock, tx);
        build
    }
    fn host(widget: HeadToHead) -> Runtime<HeadToHead> {
        let mut runtime = Runtime::with_text(
            widget,
            paint,
            (WIDTH, HEIGHT + PAUSE_HEIGHT),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(poll);
        runtime
    }

    #[test]
    fn one_visible_change_is_one_image_and_rest_costs_nothing() {
        let snapshot = snapshot();
        push(snapshot.clone());
        let mut runtime = host(widget());
        assert!(rendered_frame(&mut runtime, 0.0), "primera imagen");
        for _ in 0..300 {
            assert!(
                !rendered_frame(&mut runtime, 0.1),
                "en reposo no hay imagen"
            );
        }
        let before = runtime.state.visual.clone();
        assert!(!rendered_frame(&mut runtime, 0.1), "sin datos nuevos");
        assert_eq!(runtime.state.visual, before);
        let mut changed = snapshot.clone();
        changed.state.cars[2].driver.name = "RIVAL NUEVO".into();
        push(changed.clone());
        assert!(
            rendered_frame(&mut runtime, 1.0),
            "un nombre nuevo recompone la celda estática: una imagen"
        );
        assert!(!rendered_frame(&mut runtime, 0.1));
        let mut quiet = changed.clone();
        quiet.sequence += 1;
        push(quiet);
        assert!(
            !rendered_frame(&mut runtime, 2.0),
            "la secuencia no se pinta"
        );
        assert!(runtime.wake_deadline().is_none(), "sin relojes");
        assert!(!runtime.state.policy(true, 5, 3.0).pixels);
        assert!(!runtime.state.policy(false, 60, 3.0).pixels);
    }

    #[test]
    fn pause_retains_the_last_live_pair_under_its_band() {
        let live = snapshot();
        let mut widget = widget();
        assert!(widget.update(&live, 0.0).build, "primer par");
        let pair = widget.visual.duel.clone().expect("pareja");
        let mut paused = live.clone();
        paused.state.source_state = SourceState::Paused;
        paused.state.cars[2].driver.name = "NO DEBE SALIR".into();
        assert!(widget.update(&paused, 1.0).build, "aparece la franja");
        assert_eq!(widget.visual.duel, Some(pair), "la pareja viva se conserva");
        assert_eq!(widget.visual.pause.as_deref(), Some("EN PAUSA"));
        assert_eq!(widget.size().height, HEIGHT + PAUSE_HEIGHT);
        let again = widget.update(&paused, 2.0);
        assert!(!again.build && !again.pixels, "la pausa repetida no pinta");
        assert!(widget.update(&live, 3.0).build, "vuelve lo vivo");
        assert_eq!(widget.visual.pause, None);
        assert_eq!(widget.size().height, HEIGHT);
    }

    /// Boxes of the painted texts, as the CPU stream clips them: [x, y, right, bottom].
    fn text_boxes(runtime: &Runtime<HeadToHead>) -> Vec<[f32; 4]> {
        let mut boxes: Vec<[f32; 4]> = runtime
            .instances
            .iter()
            .filter(|instance| instance.uv[1] > 0.0)
            .map(|instance| instance.clip)
            .collect();
        boxes.sort_by(|a, b| a.partial_cmp(b).expect("finite boxes"));
        boxes.dedup();
        boxes
    }
    /// Glyph quads painted inside a band of the widget, whatever text node owns them.
    fn glyphs_in(runtime: &Runtime<HeadToHead>, area: [f32; 4]) -> usize {
        runtime
            .instances
            .iter()
            .filter(|instance| {
                instance.uv[1] > 0.0
                    && instance.rect[0] >= area[0]
                    && instance.rect[0] < area[2]
                    && instance.rect[1] >= area[1]
                    && instance.rect[1] < area[3]
            })
            .count()
    }
    fn mono_width(style: &crate::vantare::Style, value: &str) -> f32 {
        rune::text::measure(
            value,
            &[],
            font(style, Face::Mono, 12.0, 16.0, 0.0, 400.0),
            None,
        )
        .0
    }
    /// The name cell of the left half: x = 8 + 10, Body has no baseline offset, 180 × 18.
    /// Static text has no clip rect, so this band is how the painted cell is counted.
    const NAME_BAND: [f32; 4] = [18.0, 19.0, 198.0, 36.0];

    /// GPUI never truncates the lap or the sector value, so both boxes hold them whole.
    #[test]
    fn lap_and_sector_boxes_hold_their_widest_values() {
        let mut snapshot = snapshot();
        snapshot.state.cars[2].last_lap_s = Reliable(754.567);
        push(snapshot);
        let mut runtime = host(widget());
        assert!(rendered_frame(&mut runtime, 0.0), "primera imagen");
        let _fonts = rune::text::with_families("Inter", "Inter");
        let style = crate::vantare::Style::compiled();
        let boxes = text_boxes(&runtime);
        let lap = boxes
            .iter()
            .find(|area| (area[0] - 70.0).abs() < 0.01 && (area[1] - 40.0).abs() < 0.01)
            .copied()
            .expect("caja de la vuelta");
        let needed = mono_width(&style, "12:34.567");
        assert!(
            needed + 8.0 <= lap[2] - lap[0],
            "la vuelta cabe entera: {needed} px en {} px",
            lap[2] - lap[0]
        );
        assert_eq!(glyphs_in(&runtime, lap), 9, "los nueve glifos de 12:34.567");
        let sector = boxes
            .iter()
            .find(|area| (area[0] - 610.0).abs() < 0.01 && (area[1] - 30.0).abs() < 0.01)
            .copied()
            .expect("caja del sector");
        let wide = mono_width(&style, "+1:02.345");
        assert!(
            wide + 8.0 <= sector[2] - sector[0],
            "el sector cabe entero: {wide} px en {} px",
            sector[2] - sector[0]
        );
    }

    /// GPUI cuts the cell with a marker: the long name paints fewer glyphs than the
    /// whole label needs, and it rebuilds once. Fade instead of elision paints them
    /// all, so removing `.truncate()` makes this test fail.
    #[test]
    fn a_long_name_paints_cut_glyphs_and_rebuilds_once() {
        let long = "Alessandro Pier Guidi Maria Fernanda de Souza e Silva";
        let mut snapshot = snapshot();
        snapshot.state.cars[2].driver.name = "RIVAL".into();
        push(snapshot.clone());
        let mut runtime = host(widget());
        assert!(rendered_frame(&mut runtime, 0.0), "primera imagen");
        assert_eq!(glyphs_in(&runtime, NAME_BAND), 9, "P3  RIVAL  #3 entero");
        let mut long_photo = snapshot.clone();
        long_photo.state.cars[2].driver.name = long.into();
        push(long_photo);
        assert!(
            rendered_frame(&mut runtime, 1.0),
            "una imagen al recomponer"
        );
        let painted = glyphs_in(&runtime, NAME_BAND);
        let whole = long.chars().filter(|c| !c.is_whitespace()).count() + 4;
        assert!(painted >= 12, "algo del nombre se pinta: {painted}");
        assert!(
            painted + 10 < whole,
            "el nombre largo se recorta: {painted} de {whole} glifos"
        );
        // Elision cuts the string inside the cell; plain clipping would let the rest of
        // the label spill past its 180 px, so removing `.truncate()` makes this fail.
        let spill = glyphs_in(&runtime, [NAME_BAND[2], 19.0, 208.0, 36.0]);
        assert_eq!(spill, 0, "la celda no deja nada fuera: {spill} glifos");
        assert!(!rendered_frame(&mut runtime, 0.1), "y vuelve al reposo");
    }

    /// The painted pins carry the face baseline; Display sits one pixel below its box.
    #[test]
    fn painted_text_boxes_use_the_face_baseline() {
        let mut snapshot = snapshot();
        snapshot.state.cars[2].driver.name = "RIVAL".into();
        push(snapshot);
        let mut runtime = host(widget());
        assert!(rendered_frame(&mut runtime, 0.0), "primera imagen");
        let boxes = text_boxes(&runtime);
        assert!(
            boxes.contains(&[265.0, 7.0, 392.0, 19.0]),
            "cabecera Display: {boxes:?}"
        );
        assert!(
            boxes.contains(&[208.0, 19.0, 392.0, 41.0]),
            "hueco Display: {boxes:?}"
        );
        assert!(
            boxes.contains(&[18.0, 40.0, 68.0, 56.0]),
            "leyenda Body: {boxes:?}"
        );
        assert!(
            boxes.contains(&[70.0, 40.0, 166.0, 56.0]),
            "vuelta Mono: {boxes:?}"
        );
    }

    /// The status and the pause band stay inside the panel: nothing sticks out.
    #[test]
    fn the_status_and_the_pause_band_keep_their_boxes_inside_the_panel() {
        let live = snapshot();
        let mut no_pair = live.clone();
        no_pair.state.player.as_mut().expect("player").car = CarId(1);
        push(no_pair);
        let mut runtime = host(widget());
        assert!(rendered_frame(&mut runtime, 0.0), "primera imagen");
        let boxes = text_boxes(&runtime);
        assert!(
            boxes.contains(&[330.0, 27.0, 772.0, 47.0]),
            "estado Display: {boxes:?}"
        );
        let mut paused_widget = widget();
        assert!(paused_widget.update(&live, 0.0).build, "primer par");
        let mut paused = live.clone();
        paused.state.source_state = SourceState::Paused;
        assert!(
            paused_widget.update(&paused, 1.0).build,
            "aparece la franja"
        );
        let mut paused_runtime = host(paused_widget);
        assert!(rendered_frame(&mut paused_runtime, 0.0), "primera imagen");
        let boxes = text_boxes(&paused_runtime);
        assert!(
            boxes
                .iter()
                .any(|area| (area[1] - HEIGHT).abs() < 0.01 && area[2] <= WIDTH),
            "la franja de pausa cabe en el panel: {boxes:?}"
        );
    }

    #[test]
    fn the_constructor_takes_its_settings_and_rejects_other_kinds() {
        let stored = widget_settings::Settings::HeadToHead(Stored {
            target: "behind".into(),
            show_sectors: false,
        });
        let prefs = Preferences::default();
        let painter = <HeadToHead as crate::widget::Widget>::new(&stored, prefs, true, 15, 0.0)
            .expect("cara a cara");
        assert!(painter.configured(&stored, prefs));
        assert_eq!(
            painter.size(),
            Size {
                width: WIDTH,
                height: HEIGHT
            }
        );
        assert!(
            !painter.configured(
                &widget_settings::Settings::HeadToHead(Stored::default()),
                prefs
            ),
            "otros ajustes no reutilizan la instancia"
        );
        let mut paused = snapshot();
        paused.state.source_state = SourceState::Paused;
        assert_eq!(
            painter.size_for(Some(&paused)).height,
            HEIGHT + PAUSE_HEIGHT
        );
        assert!(
            <HeadToHead as crate::widget::Widget>::new(
                &widget_settings::Settings::Pedals(Default::default()),
                prefs,
                true,
                15,
                0.0
            )
            .is_none()
        );
    }
}
