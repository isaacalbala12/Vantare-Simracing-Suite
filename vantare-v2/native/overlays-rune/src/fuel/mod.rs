//! Fuel: projection, retención en pausa y los dos Looks. Un solo módulo de
//! escena pura; cada Look añade su pintura y sus textos.
mod eficiencia;
mod eficiencia_tokens;
mod layout;
mod render;
pub mod scene;

use crate::widget::Update;
use rune::El;
use scene::{Bar, Motion, Timing};
use std::sync::Arc;
use vantare_domain::{
    Snapshot, SourceState,
    format::Preferences,
    freshness::shows_last_live,
    fuel_strategy::{self, Board},
    geometry::Size,
    widget_session::Session,
    widget_settings::{Settings as AnySettings, fuel_strategy::Settings, look::Look},
};

/// Pintor del Look elegido; la escena es la misma para los dos.
enum Painter {
    Vantare(render::Painter),
    Eficiencia(eficiencia::Painter),
}

impl Painter {
    fn size(&self) -> Size {
        match self {
            Self::Vantare(painter) => painter.size(),
            Self::Eficiencia(painter) => painter.size(),
        }
    }
    fn prepare(&mut self, board: &Arc<Board>, session: Option<Session>) -> bool {
        match self {
            Self::Vantare(painter) => painter.prepare(board, session),
            Self::Eficiencia(painter) => painter.prepare(board, session),
        }
    }
    fn targets(&self) -> Vec<(Bar, f32)> {
        match self {
            Self::Vantare(painter) => painter.targets(),
            Self::Eficiencia(painter) => painter.targets(),
        }
    }
    /// Solo el Look Vantare late con combustible bajo.
    fn pulses(&self) -> bool {
        match self {
            Self::Vantare(_) => true,
            Self::Eficiencia(painter) => painter.pulses(),
        }
    }
    fn view(&self) -> El {
        match self {
            Self::Vantare(painter) => painter.view(),
            Self::Eficiencia(painter) => painter.view(),
        }
    }
    fn sync(&mut self, scene: &scene::Scene) -> Update {
        match self {
            Self::Vantare(painter) => painter.sync(scene),
            Self::Eficiencia(painter) => painter.sync(scene),
        }
    }
}

pub(crate) struct Fuel {
    settings: Settings,
    prefs: Preferences,
    content: fuel_strategy::Config,
    pause: Pause,
    motion: Motion,
    painter: Painter,
    visual: scene::Scene,
    /// Hay que sincronizar aunque la escena no cambie (sesión o idioma).
    repaint: bool,
}

impl Fuel {
    pub fn new(
        settings: &Settings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Self {
        let settings = settings.normalized();
        let content = Self::content(&settings);
        let style = crate::vantare::Style::compiled();
        let mut motion = Motion::new(
            Timing {
                slide: f64::from(style.motion.reorder_ms) / 1000.0,
                pulse: f64::from(style.fuel.low_pulse_ms) / 1000.0,
            },
            reduced,
            hz,
            clock,
        );
        let mut pause = Pause::default();
        pause.project(&Snapshot::default(), prefs, content);
        let board = pause.board().clone();
        let initial = scene::sample(board.clone(), &motion, clock);
        let mut painter = match settings.design_system {
            Look::Eficiencia => Painter::Eficiencia(eficiencia::Painter::new(prefs, &initial)),
            _ => Painter::Vantare(render::Painter::new(&settings, prefs, &initial)),
        };
        motion.update(&board, &painter.targets(), true, clock);
        if painter.pulses() {
            motion.advance(&board, clock);
        }
        let visual = scene::sample(board, &motion, clock);
        painter.sync(&visual);
        Self {
            settings,
            prefs,
            content,
            pause,
            motion,
            painter,
            visual,
            repaint: false,
        }
    }
    pub fn configured(&self, settings: &Settings, prefs: Preferences) -> bool {
        self.settings == settings.normalized() && self.prefs == prefs
    }
    /// Ajustes de contenido, los mismos que el widget de GPUI pasa a domain.
    fn content(settings: &Settings) -> fuel_strategy::Config {
        fuel_strategy::Config {
            history_rows: settings.history_rows,
            show_projection: settings.show_projection,
            virtual_energy: settings.source == "virtual-energy",
        }
    }
    pub fn size(&self) -> Size {
        self.painter.size()
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
        let session = Session::of(&snapshot.state.session.kind);
        let changed = self.pause.project(snapshot, self.prefs, self.content);
        let board = self.pause.board().clone();
        let prepared = self.painter.prepare(&board, session);
        if changed || prepared {
            // GPUI reintenta las barras en cada foto: nunca salta al destino.
            self.motion
                .update(&board, &self.painter.targets(), false, clock);
            self.repaint = true;
        }
        self.animate(clock)
    }
    pub fn animate(&mut self, clock: f64) -> Update {
        let board = self.pause.board().clone();
        if self.painter.pulses() {
            self.motion.advance(&board, clock);
        }
        let visual = scene::sample(board, &self.motion, clock);
        let quiet = Arc::ptr_eq(&self.visual.board, &visual.board)
            && self.visual.bars == visual.bars
            && self.visual.border == visual.border;
        if quiet && !self.repaint {
            return Update::default();
        }
        self.repaint = false;
        let update = self.painter.sync(&visual);
        self.visual = visual;
        update
    }
    pub fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        if let Some(due) = self.motion.next_wake(clock) {
            tx.wake_at(due);
        }
    }
}

/// Looks migrados del widget; el brazo del `match` de `constructor()` decide.
fn supported(look: Look) -> bool {
    matches!(look, Look::Vantare | Look::Eficiencia)
}

impl crate::widget::Widget for Fuel {
    fn new(
        settings: &AnySettings,
        prefs: Preferences,
        reduced: bool,
        hz: u16,
        clock: f64,
    ) -> Option<Box<dyn crate::widget::Widget>> {
        let AnySettings::FuelStrategy(settings) = settings else {
            return None;
        };
        if !supported(settings.design_system) {
            return None;
        }
        Some(Box::new(Fuel::new(settings, prefs, reduced, hz, clock)))
    }
    fn configured(&self, settings: &AnySettings, prefs: Preferences) -> bool {
        let AnySettings::FuelStrategy(settings) = settings else {
            return false;
        };
        supported(settings.design_system) && Fuel::configured(self, settings, prefs)
    }
    fn size(&self) -> Size {
        Fuel::size(self)
    }
    fn size_for(&self, _snapshot: Option<&Snapshot>) -> Size {
        Fuel::size(self)
    }
    fn policy(&mut self, reduced: bool, hz: u16, clock: f64) -> Update {
        Fuel::policy(self, reduced, hz, clock)
    }
    fn update(&mut self, snapshot: &Snapshot, clock: f64) -> Update {
        Fuel::update(self, snapshot, clock)
    }
    fn animate(&mut self, clock: f64) -> Update {
        Fuel::animate(self, clock)
    }
    fn schedule(&self, clock: f64, tx: &mut rune::Tx) {
        Fuel::schedule(self, clock, tx);
    }
    fn view(&self) -> El {
        Fuel::view(self)
    }
}

/// Última proyección viva. En pausa se conserva; una instancia abierta durante
/// la pausa sí proyecta esa foto, como `native/ui/src/app.rs` en GPUI.
pub struct Pause {
    paused: bool,
    live: bool,
    board: Arc<Board>,
}
impl Default for Pause {
    fn default() -> Self {
        Self {
            paused: false,
            live: false,
            board: Arc::new(fuel_strategy::project_with_config(
                &Snapshot::default(),
                Preferences::default(),
                fuel_strategy::Config::default(),
            )),
        }
    }
}
impl Pause {
    pub fn board(&self) -> &Arc<Board> {
        &self.board
    }
    /// `true` si hay que repintar: cambió el tablero o el estado de pausa.
    pub fn project(
        &mut self,
        snapshot: &Snapshot,
        prefs: Preferences,
        content: fuel_strategy::Config,
    ) -> bool {
        let paused = snapshot.state.source_state == SourceState::Paused;
        if paused && self.paused {
            return false;
        }
        let changed = self.paused != paused;
        self.paused = paused;
        if paused && self.live {
            return changed;
        }
        let live = shows_last_live(snapshot);
        let mut retained;
        let snapshot = if paused {
            retained = snapshot.clone();
            retained.state.source_state = SourceState::Live;
            &retained
        } else {
            snapshot
        };
        let next = Arc::new(fuel_strategy::project_with_config(snapshot, prefs, content));
        self.live = live;
        if *next == *self.board {
            return changed;
        }
        self.board = next;
        true
    }
}

#[cfg(test)]
pub(crate) fn photo(laps_left: f64, remaining: u32) -> Snapshot {
    use vantare_domain::{
        Capability, Car, CarId, Fuel, Player, Quality::Reliable, SessionId, SessionKind,
        TyreCompound,
    };
    let mut snapshot = Snapshot {
        epoch: 1,
        ..Snapshot::default()
    };
    snapshot.state.source_state = SourceState::Live;
    snapshot.state.capabilities.fuel = Capability::Fresh;
    snapshot.state.session.id = SessionId(1);
    snapshot.state.session.kind = Reliable(SessionKind::Race);
    snapshot.state.session.laps_remaining = Reliable(remaining);
    snapshot.state.session.laps_total = Reliable(38);
    snapshot.state.cars.push(Car {
        id: CarId(1),
        laps: Reliable(21),
        in_pits: Reliable(false),
        pit_stops: Reliable(1),
        tyre_compound: Reliable(TyreCompound::Medium),
        ..Car::default()
    });
    snapshot.state.player = Some(Player {
        car: CarId(1),
        fuel: Fuel {
            level_l: Reliable(4.4),
            capacity_l: Reliable(90.0),
            per_lap_l: Reliable(3.71),
            laps_left: Reliable(laps_left),
            ..Fuel::default()
        },
        ..Player::default()
    });
    snapshot
}

#[cfg(test)]
pub(crate) fn board_of(photo: &Snapshot) -> Board {
    fuel_strategy::project_with_config(
        photo,
        Preferences::default(),
        fuel_strategy::Config::default(),
    )
}

#[cfg(test)]
pub(crate) fn board(laps_left: f64, remaining: u32) -> Board {
    board_of(&photo(laps_left, remaining))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pause_keeps_the_last_live_board_and_a_fresh_open_shows_the_paused_photo() {
        let prefs = Preferences::default();
        let content = fuel_strategy::Config::default();
        let live = photo(11.3, 25);
        let mut pause = Pause::default();
        assert!(pause.project(&live, prefs, content));
        let kept = pause.board().clone();
        let mut paused = live.clone();
        paused.state.source_state = SourceState::Paused;
        paused.state.player.as_mut().expect("player").fuel.level_l =
            vantare_domain::Quality::Reliable(1.0);
        assert!(
            pause.project(&paused, prefs, content),
            "entrar en pausa repinta una vez"
        );
        assert!(
            Arc::ptr_eq(&kept, pause.board()),
            "conserva la última foto viva"
        );
        assert_eq!(pause.board().fuel.level, Some(4.4));
        assert!(
            !pause.project(&paused, prefs, content),
            "quieto en pausa, sin repintar"
        );
        let mut opened = Pause::default();
        assert!(opened.project(&paused, prefs, content));
        assert_eq!(
            opened.board().fuel.level,
            Some(1.0),
            "una apertura en pausa proyecta esa foto"
        );
        assert!(
            pause.project(&live, prefs, content),
            "salir de pausa repinta"
        );
        assert_eq!(pause.board().fuel.level, Some(4.4));
    }

    fn settings(size: &str) -> Settings {
        Settings {
            design_system: Look::Vantare,
            size: size.into(),
            ..Settings::default()
        }
    }
    fn widget(size: &str, reduced: bool) -> Fuel {
        Fuel::new(&settings(size), Preferences::default(), reduced, 4, 0.0)
    }
    fn runtime(fuel: Fuel) -> rune::Runtime<Fuel> {
        fn view(fuel: &Fuel, _: &mut rune::Cx<Fuel>) -> El {
            fuel.view()
        }
        fn poll(fuel: &mut Fuel, clock: f64, tx: &mut rune::Tx) -> bool {
            fuel.animate(clock);
            fuel.schedule(clock, tx);
            false
        }
        let mut runtime = rune::Runtime::with_text(
            fuel,
            view,
            (460.0, 440.0),
            rune::Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(poll);
        runtime
    }
    /// Una imagen solo si cambia el flujo CPU del pintor, no si «sigue animando».
    fn rendered_frame(runtime: &mut rune::Runtime<Fuel>, dt: f64) -> bool {
        let before = runtime.instances.clone();
        runtime.frame(dt);
        before.len() != runtime.instances.len()
            || before
                .iter()
                .map(payload)
                .ne(runtime.instances.iter().map(payload))
    }

    fn payload(instance: &rune::render::Instance) -> [[u32; 4]; 8] {
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

    #[test]
    fn dispatch_builds_both_looks_and_rejects_other_widgets() {
        let prefs = Preferences::default();
        let vantare = AnySettings::FuelStrategy(settings("compact"));
        let painter = <Fuel as crate::widget::Widget>::new(&vantare, prefs, true, 4, 0.0)
            .expect("fuel Vantare");
        assert!(painter.configured(&vantare, prefs));
        assert_eq!(
            painter.size(),
            Size {
                width: 230.0,
                height: 137.0
            }
        );
        assert_eq!(painter.size_for(None), painter.size());
        let efficiency = AnySettings::FuelStrategy(Settings {
            design_system: Look::Eficiencia,
            ..settings("compact")
        });
        let efi = <Fuel as crate::widget::Widget>::new(&efficiency, prefs, true, 4, 0.0)
            .expect("fuel Eficiencia");
        assert!(efi.configured(&efficiency, prefs));
        assert_eq!(
            efi.size(),
            Size {
                width: 523.0,
                height: 272.0
            },
            "Eficiencia ignora el tamaño del ajuste"
        );
        assert!(!painter.configured(&efficiency, prefs));
        assert!(
            <Fuel as crate::widget::Widget>::new(
                &AnySettings::Pedals(Default::default()),
                prefs,
                true,
                4,
                0.0
            )
            .is_none()
        );
    }

    #[test]
    fn quiet_photos_paint_no_image_and_arm_no_timer() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        for reduced in [false, true] {
            let mut fuel = widget("expanded", reduced);
            fuel.update(&photo(11.3, 25), 0.0);
            let mut runtime = runtime(fuel);
            assert!(
                rendered_frame(&mut runtime, 0.0),
                "la primera vista se pinta"
            );
            for step in 1..=40 {
                let mut photo = photo(11.3, 25);
                photo.sequence = step + 1;
                runtime.state.update(&photo, step as f64 * 0.25);
                assert!(
                    !rendered_frame(&mut runtime, 0.25),
                    "misma foto, sin imagen"
                );
            }
            assert!(
                runtime.wake_deadline().is_none(),
                "en reposo no queda reloj"
            );
        }
    }

    #[test]
    fn a_visible_change_rebuilds_once_and_settles() {
        let mut fuel = widget("standard", true);
        fuel.update(&photo(11.3, 25), 0.0);
        let mut changed = photo(11.3, 25);
        changed.state.player.as_mut().expect("player").fuel.level_l =
            vantare_domain::Quality::Reliable(30.0);
        assert!(
            fuel.update(&changed, 1.0).build,
            "el texto nuevo recompone la vista"
        );
        assert!(!fuel.update(&changed, 1.0).build, "y solo una vez");
        assert!(!fuel.animate(1.0).pixels, "quieto, sin valores animados");
    }

    #[test]
    fn long_texts_build_without_changing_the_frame() {
        let mut fuel = widget("compact", true);
        let mut photo = photo(11.3, 25);
        photo.state.cars[0].class = Some(vantare_domain::Class {
            id: vantare_domain::ClassId(1),
            name: "Hypercar Prototype Extra Long Class Name".into(),
        });
        fuel.update(&photo, 0.0);
        let _ = fuel.view();
        assert_eq!(
            fuel.size(),
            Size {
                width: 230.0,
                height: 137.0
            }
        );
    }

    #[test]
    fn low_fuel_keeps_the_border_clock_until_the_tank_recovers_or_motion_is_reduced() {
        let _fonts = rune::text::with_families("Inter", "Inter");
        let mut fuel = widget("standard", false);
        fuel.update(&photo(1.2, 17), 0.0);
        let mut runtime = runtime(fuel);
        rendered_frame(&mut runtime, 0.0);
        assert!(
            runtime.wake_deadline().is_some(),
            "con combustible bajo hay reloj"
        );
        runtime.state.update(&photo(11.3, 25), 1.0);
        rendered_frame(&mut runtime, 1.0);
        assert!(
            runtime.wake_deadline().is_none(),
            "sin condición, sin reloj"
        );
        runtime.state.update(&photo(1.2, 17), 2.0);
        rendered_frame(&mut runtime, 1.0);
        assert!(runtime.wake_deadline().is_some());
        runtime.state.policy(true, 4, 3.0);
        rendered_frame(&mut runtime, 1.0);
        assert!(
            runtime.wake_deadline().is_none(),
            "movimiento reducido apaga el reloj"
        );
    }
}

#[cfg(test)]
mod extra_tests {
    use super::scene::Bar;
    use super::*;
    use rune::render::Instance;
    use vantare_domain::Quality::Reliable;

    fn draw(fuel: Fuel) -> Vec<Instance> {
        let _fonts = rune::text::with_families("Inter", "Inter");
        fn view(fuel: &Fuel, _: &mut rune::Cx<Fuel>) -> El {
            fuel.view()
        }
        fn poll(fuel: &mut Fuel, clock: f64, tx: &mut rune::Tx) -> bool {
            let update = fuel.animate(clock);
            fuel.schedule(clock, tx);
            update.build
        }
        let mut runtime = rune::Runtime::with_text(
            fuel,
            view,
            (460.0, 440.0),
            rune::Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(poll);
        runtime.frame(0.0);
        runtime.instances.clone()
    }
    fn has(instances: &[Instance], x: f32, y: f32, width: f32, height: f32) -> bool {
        instances.iter().any(|instance| {
            (instance.rect[0] - x).abs() < 0.02
                && (instance.rect[1] - y).abs() < 0.02
                && (instance.rect[2] - width).abs() < 0.02
                && (instance.rect[3] - height).abs() < 0.02
        })
    }
    fn has_size(instances: &[Instance], width: f32, height: f32) -> bool {
        instances.iter().any(|instance| {
            (instance.rect[2] - width).abs() < 0.02 && (instance.rect[3] - height).abs() < 0.02
        })
    }
    fn scaled(size: &str, reduced: bool) -> Fuel {
        Fuel::new(
            &Settings {
                design_system: Look::Vantare,
                size: size.into(),
                ..Settings::default()
            },
            Preferences::default(),
            reduced,
            4,
            0.0,
        )
    }
    fn compact_track_y() -> f32 {
        10.0 + 22.0 + 62.0 - 6.0 - 4.0
    }

    #[test]
    fn compact_paints_the_tank_track_under_the_fill() {
        let mut fuel = scaled("compact", true);
        fuel.update(&photo(11.3, 25), 0.0);
        let instances = draw(fuel);
        assert!(
            has(&instances, 12.0, compact_track_y(), 206.0, 6.0),
            "pista del depósito 230 − 2·12"
        );
    }

    #[test]
    fn expanded_paints_the_track_marker_tiles_and_banner() {
        let mut fuel = scaled("expanded", true);
        let mut photo = photo(11.3, 25);
        let player = photo.state.player.as_mut().expect("player");
        player.fuel.energy = Reliable(0.614);
        player.fuel.energy_per_lap = Reliable(0.0482);
        for (slot, (lap, litres)) in [(10, 2.21), (11, 2.08), (12, 2.26), (13, 2.12)]
            .into_iter()
            .enumerate()
        {
            player.fuel.history[slot] = Some((lap, litres));
        }
        fuel.update(&photo, 0.0);
        let instances = draw(fuel);
        assert!(has(&instances, 12.0, 58.0, 436.0, 8.0), "pista del medidor");
        assert!(
            has_size(&instances, 2.0, 16.0),
            "marcador de la vuelta actual"
        );
        assert!(has_size(&instances, 436.0, 44.0), "teselas");
        assert!(has_size(&instances, 6.0, 6.0), "punto del gráfico");
    }

    #[test]
    fn low_fuel_paints_the_warning_banner_across_the_panel() {
        let mut fuel = scaled("standard", true);
        fuel.update(&photo(1.2, 17), 0.0);
        let instances = draw(fuel);
        assert!(has(&instances, 0.0, 0.0, 300.0, 22.0), "franja de aviso");
    }

    #[test]
    fn a_session_change_alone_repaints_even_with_the_same_board() {
        let mut fuel = scaled("standard", true);
        let mut photo = photo(11.3, 25);
        fuel.update(&photo, 0.0);
        assert!(
            !fuel.update(&photo, 0.1).build,
            "la misma foto no recompone"
        );
        photo.state.session.kind = Reliable(vantare_domain::SessionKind::Practice);
        assert!(
            fuel.update(&photo, 0.2).build,
            "la práctica recom pone aunque el tablero no cambie"
        );
        assert!(!fuel.update(&photo, 0.3).build, "y no se repite");
    }

    #[test]
    fn bars_slide_after_the_tank_and_after_waiting() {
        let mut fuel = scaled("compact", false);
        fuel.update(&photo(11.3, 25), 0.0);
        let before = fuel.visual.fraction(Bar::Compact).expect("barra");
        let mut fuller = photo(11.3, 25);
        fuller.state.player.as_mut().expect("player").fuel.level_l = Reliable(60.0);
        fuel.update(&fuller, 1.0);
        assert_eq!(
            fuel.visual.fraction(Bar::Compact),
            Some(before),
            "arranca en el valor anterior: desliza, no salta"
        );
        fuel.animate(1.32);
        let full = fuel.visual.fraction(Bar::Compact).expect("barra");
        assert!(full > before);
        // La espera no reinicia el canal: al volver, desliza desde el valor vivo.
        let mut waiting = photo(11.3, 25);
        waiting.state.source_state = SourceState::Waiting;
        fuel.update(&waiting, 2.0);
        let mut lower = photo(11.3, 25);
        lower.state.player.as_mut().expect("player").fuel.level_l = Reliable(20.0);
        fuel.update(&lower, 3.0);
        assert_eq!(
            fuel.visual.fraction(Bar::Compact),
            Some(full),
            "no salta al destino tras la espera"
        );
        assert!(fuel.motion.next_wake(3.0).is_some(), "la barra desliza");
        fuel.animate(3.32);
        assert!(
            fuel.visual.fraction(Bar::Compact).expect("barra") < full,
            "desliza hacia el valor nuevo"
        );
    }

    #[test]
    fn every_catalogue_phase_keeps_its_frame() {
        for size in ["compact", "standard", "expanded"] {
            for phase in 0..5 {
                let mut fuel = scaled(size, true);
                let mut photo = photo(11.3, 25);
                match phase {
                    1 => photo.state.player.as_mut().expect("player").fuel.level_l = Reliable(1.0),
                    2 => {
                        photo.state.cars[0].in_pits = Reliable(true);
                        let player = photo.state.player.as_mut().expect("player");
                        player.pit_service.refuel_target_l = Reliable(58.0);
                        player.pit_service.refuel_added_l = Reliable(34.1);
                    }
                    3 => {
                        let player = photo.state.player.as_mut().expect("player");
                        player.fuel.energy = Reliable(0.614);
                        player.fuel.energy_per_lap = Reliable(0.0482);
                    }
                    4 => photo.state.source_state = SourceState::Waiting,
                    _ => {}
                }
                fuel.update(&photo, 0.0);
                let _ = fuel.view();
            }
        }
    }
}


#[cfg(test)]
mod layout_bounds {
    use super::*;

    fn runtime(fuel: Fuel, window: (f32, f32)) -> rune::Runtime<Fuel> {
        fn view(fuel: &Fuel, _: &mut rune::Cx<Fuel>) -> El {
            fuel.view()
        }
        fn poll(fuel: &mut Fuel, clock: f64, tx: &mut rune::Tx) -> bool {
            let update = fuel.animate(clock);
            fuel.schedule(clock, tx);
            update.build
        }
        let mut runtime = rune::Runtime::with_text(
            fuel,
            view,
            window,
            rune::Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(poll);
        runtime
    }

    #[test]
    fn no_layer_falls_outside_the_vantare_window() {
        for (size, width, height) in [
            ("compact", 230.0, 137.0),
            ("standard", 300.0, 204.0),
            ("expanded", 460.0, 440.0),
        ] {
            let mut fuel = Fuel::new(
                &Settings {
                    design_system: Look::Vantare,
                    size: size.into(),
                    ..Settings::default()
                },
                Preferences::default(),
                true,
                4,
                0.0,
            );
            fuel.update(&photo(11.3, 25), 0.0);
            let mut runtime = runtime(fuel, (width, height));
            runtime.frame(0.0);
            crate::testdata::assert_inside_window(&mut runtime, (width, height));
        }
    }
}

#[cfg(test)]
mod efficiency_tests {
    use super::*;

    fn efi() -> Fuel {
        Fuel::new(
            &Settings {
                design_system: Look::Eficiencia,
                ..Settings::default()
            },
            Preferences::default(),
            false,
            4,
            0.0,
        )
    }

    #[test]
    fn efficiency_never_arms_a_clock_or_animates() {
        let mut fuel = efi();
        fuel.update(&photo(1.2, 17), 0.0);
        assert!(fuel.painter.targets().is_empty(), "sin canales de barra");
        assert!(!fuel.animate(0.1).pixels, "quieto, sin valores animados");
        assert!(
            fuel.motion.next_wake(0.1).is_none(),
            "sin reloj con combustible bajo"
        );
        assert_eq!(fuel.visual.border, 0.0, "el borde no late en Eficiencia");
    }

    #[test]
    fn efficiency_paints_once_per_data_change() {
        let mut fuel = efi();
        let photo = photo(11.3, 25);
        assert!(fuel.update(&photo, 0.0).build, "la primera foto compone");
        assert!(
            !fuel.update(&photo, 0.1).build,
            "la misma foto no recompone"
        );
        let mut changed = photo.clone();
        changed.state.player.as_mut().expect("player").fuel.level_l =
            vantare_domain::Quality::Reliable(30.0);
        assert!(fuel.update(&changed, 0.2).build, "el dato nuevo compone");
        assert!(!fuel.animate(0.2).pixels, "y no queda animaci├│n detr├ís");
    }

    #[test]
    fn efficiency_keeps_the_session_label_out_of_the_look() {
        let mut fuel = efi();
        let mut photo = photo(11.3, 25);
        fuel.update(&photo, 0.0);
        photo.state.session.kind =
            vantare_domain::Quality::Reliable(vantare_domain::SessionKind::Practice);
        assert!(
            !fuel.update(&photo, 0.1).build,
            "la sesi├│n no cambia los textos de este Look"
        );
    }
}
