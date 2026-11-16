//! Pedals scene shared by both Looks: visible percentages, fill heights, brake
//! peak and status, sampled from the domain projection. No Rune values, colors
//! or window. Nothing animates, so the scene has no clock.
use vantare_domain::{
    CarId, SessionId, Snapshot, SourceState, pedals::ViewModel, widget_settings::look::Look,
};

/// Alto fijo del widget; el ancho depende solo de la separación.
pub const HEIGHT: f32 = 160.0;
/// Margen lateral común a los dos Looks.
pub const PAD_X: f32 = 10.0;
/// Ancho de columna de cada Look; el resto del ancho es la separación.
pub const EFICIENCIA_COLUMN_W: f32 = 28.0;
pub const VANTARE_COLUMN_W: f32 = 24.0;

/// Ancho del widget para una separación dada; las columnas no cambian.
#[must_use]
pub fn width_for_gap(look: Look, gap: f32) -> f32 {
    let column = match look {
        Look::Eficiencia => EFICIENCIA_COLUMN_W,
        Look::Vantare => VANTARE_COLUMN_W,
    };
    2.0 * PAD_X + 3.0 * column + 2.0 * gap
}

/// Un pedal: el texto ya redondeado y el relleno como fracción de la pista.
#[derive(Clone, Debug, PartialEq)]
pub struct Pedal {
    /// Texto visible (`13%` o el marcador de dato ausente).
    pub text: String,
    /// 0–1; `None` no pinta relleno. El alto en píxeles lo pone el Look.
    pub fill: Option<f32>,
}

/// Lo que se ve, en el orden de las columnas: embrague, freno, acelerador.
#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub pedals: [Pedal; 3],
    /// Aviso de la fuente ya en el idioma del usuario.
    pub status: Option<&'static str>,
    /// El Look pone el texto del limitador según el idioma.
    pub limiter: bool,
    /// Posición del pico de frenada desde arriba (1 − pico), si hay alguno.
    pub peak: Option<f32>,
}

/// Estado pequeño con memoria: pico de la última frenada y limitador.
#[derive(Debug, Default)]
pub struct State {
    peak: Option<f64>,
    previous: Option<f64>,
    identity: Option<(u64, SessionId, Option<CarId>)>,
    limiter: bool,
}

impl State {
    /// Ingiere una foto y su proyección. La identidad nueva reinicia el pico.
    pub fn update(&mut self, snapshot: &Snapshot, vm: &ViewModel) {
        let identity = (
            snapshot.epoch,
            snapshot.state.session.id,
            snapshot.state.player.map(|player| player.car),
        );
        if self.identity != Some(identity) {
            self.identity = Some(identity);
            self.peak = None;
            self.previous = None;
        }
        self.peak = match vm.brake {
            None => None,
            Some(value) if value > 0.0 => Some(if self.previous.is_some_and(|last| last > 0.0) {
                self.peak.unwrap_or(value).max(value)
            } else {
                value
            }),
            Some(_) => self.peak,
        };
        self.previous = vm.brake;
        self.limiter = snapshot.state.source_state == SourceState::Live
            && snapshot
                .state
                .player
                .is_some_and(|player| player.pit_limiter_active.current() == Some(&true));
    }

    #[must_use]
    pub fn peak(&self) -> Option<f64> {
        self.peak
    }

    #[must_use]
    pub fn limiter(&self) -> bool {
        self.limiter
    }
}

/// Muestreo puro: el Look elige colores y geometría de píxeles, nunca los valores.
/// Llama antes a `State::update` con la misma foto y proyección.
#[must_use]
pub fn sample(vm: &ViewModel, state: &State) -> Scene {
    Scene {
        pedals: [
            pedal(vm.clutch, &vm.clutch_text),
            pedal(vm.brake, &vm.brake_text),
            pedal(vm.throttle, &vm.throttle_text),
        ],
        status: vm.status_text,
        limiter: state.limiter(),
        peak: state.peak().map(|value| 1.0 - value.clamp(0.0, 1.0) as f32),
    }
}

fn pedal(value: Option<f64>, text: &str) -> Pedal {
    Pedal {
        text: text.to_owned(),
        // El porcentaje se redondea primero, como el texto que lo acompaña.
        fill: value.map(|value| (value * 100.0).round() as f32 / 100.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{
        Quality::{Reliable, Unavailable},
        format::{Language, PLACEHOLDER, Preferences},
    };

    fn snapshot() -> Snapshot {
        let mut snapshot = crate::testdata::snapshot();
        let telemetry = &mut snapshot.state.player.as_mut().expect("jugador").telemetry;
        telemetry.throttle = Reliable(0.5);
        telemetry.brake = Reliable(0.25);
        telemetry.clutch = Reliable(0.75);
        telemetry.gear = Reliable(3);
        telemetry.speed_mps = Reliable(10.0);
        telemetry.engine_speed_rad_s = Reliable(100.0);
        snapshot
    }

    fn project(snapshot: &Snapshot) -> ViewModel {
        vantare_domain::pedals::project(snapshot, Preferences::default())
    }

    fn scene(photo: &Snapshot) -> (State, Scene) {
        let vm = project(photo);
        let mut state = State::default();
        state.update(photo, &vm);
        let scene = sample(&vm, &state);
        (state, scene)
    }

    fn set_brake(photo: &mut Snapshot, value: Option<f64>) {
        photo
            .state
            .player
            .as_mut()
            .expect("jugador")
            .telemetry
            .brake = value.map_or(Unavailable, Reliable);
    }

    #[test]
    fn pedals_follow_the_column_order_and_round_like_their_text() {
        let mut photo = snapshot();
        let telemetry = &mut photo.state.player.as_mut().expect("jugador").telemetry;
        telemetry.clutch = Reliable(0.5);
        telemetry.brake = Reliable(0.125);
        telemetry.throttle = Reliable(0.985);
        let (_, scene) = scene(&photo);
        assert_eq!(
            scene
                .pedals
                .iter()
                .map(|pedal| pedal.text.as_str())
                .collect::<Vec<_>>(),
            ["50%", "13%", "99%"]
        );
        assert!(
            scene
                .pedals
                .iter()
                .zip([0.5, 0.13, 0.99])
                .all(|(pedal, expected)| {
                    (pedal.fill.expect("relleno") - expected).abs() < 1e-6
                })
        );
        assert_eq!(scene.status, None);
    }

    #[test]
    fn a_missing_pedal_leaves_its_bar_empty_and_prints_a_dash() {
        let mut photo = snapshot();
        set_brake(&mut photo, None);
        let (_, scene) = scene(&photo);
        assert_eq!(scene.pedals[1].fill, None);
        assert_eq!(scene.pedals[1].text, PLACEHOLDER);
        assert_eq!(scene.status, Some("SIN DATOS"));
        assert!(scene.pedals[0].fill.is_some() && scene.pedals[2].fill.is_some());
    }

    #[test]
    fn brake_peak_tracks_one_braking_event_and_restarts_when_pressed_again() {
        let mut photo = snapshot();
        let mut state = State::default();
        for value in [0.42, 0.93, 0.42, 0.0] {
            set_brake(&mut photo, Some(value));
            let vm = project(&photo);
            state.update(&photo, &vm);
        }
        assert_eq!(state.peak(), Some(0.93));
        set_brake(&mut photo, Some(0.25));
        let vm = project(&photo);
        state.update(&photo, &vm);
        assert_eq!(state.peak(), Some(0.25), "nueva frenada");
        assert!((sample(&vm, &state).peak.expect("pico") - 0.75).abs() < 1e-6);
        set_brake(&mut photo, None);
        let vm = project(&photo);
        state.update(&photo, &vm);
        assert_eq!(state.peak(), None, "sin dato no se inventa un pico");
    }

    #[test]
    fn brake_peak_resets_with_epoch_session_or_car() {
        for changed in 0..3 {
            let mut photo = snapshot();
            set_brake(&mut photo, Some(0.93));
            let mut state = State::default();
            state.update(&photo, &project(&photo));
            match changed {
                0 => photo.epoch += 1,
                1 => photo.state.session.id.0 += 1,
                _ => photo.state.player.as_mut().expect("jugador").car = CarId(2),
            }
            set_brake(&mut photo, Some(0.25));
            state.update(&photo, &project(&photo));
            assert_eq!(state.peak(), Some(0.25), "identidad nueva {changed}");
        }
    }

    #[test]
    fn the_limiter_needs_live_data_and_an_active_flag() {
        let mut photo = snapshot();
        photo
            .state
            .player
            .as_mut()
            .expect("jugador")
            .pit_limiter_active = Reliable(true);
        assert!(scene(&photo).1.limiter);
        for flag in [Reliable(false), Unavailable] {
            photo
                .state
                .player
                .as_mut()
                .expect("jugador")
                .pit_limiter_active = flag;
            assert!(!scene(&photo).1.limiter);
        }
        photo
            .state
            .player
            .as_mut()
            .expect("jugador")
            .pit_limiter_active = Reliable(true);
        photo.state.source_state = SourceState::Stale;
        assert!(!scene(&photo).1.limiter, "solo con datos vivos");
    }

    #[test]
    fn status_follows_the_source_state_and_language() {
        let photo = snapshot();
        assert_eq!(scene(&photo).1.status, None);
        for (state, language, expected) in [
            (SourceState::Waiting, Language::Es, "DESCONECTADO"),
            (SourceState::Lost, Language::En, "DISCONNECTED"),
            (SourceState::Stale, Language::Es, "DATOS ANTIGUOS"),
            (SourceState::Stale, Language::En, "DATA OUT OF DATE"),
        ] {
            let mut photo = photo.clone();
            photo.state.source_state = state;
            let prefs = Preferences {
                language,
                ..Preferences::default()
            };
            let vm = vantare_domain::pedals::project(&photo, prefs);
            let mut memory = State::default();
            memory.update(&photo, &vm);
            assert_eq!(sample(&vm, &memory).status, Some(expected));
        }
    }

    #[test]
    fn pausing_keeps_the_values_without_a_status_band() {
        let mut photo = snapshot();
        photo.state.source_state = SourceState::Paused;
        let (_, scene) = scene(&photo);
        assert_eq!(scene.status, None);
        assert!(scene.pedals.iter().all(|pedal| pedal.fill.is_some()));
    }

    #[test]
    fn width_follows_the_gap_and_keeps_each_looks_column() {
        assert_eq!(HEIGHT, 160.0);
        for (gap, eficiencia, vantare) in [
            (0.0, 104.0, 92.0),
            (2.0, 108.0, 96.0),
            (8.0, 120.0, 108.0),
            (12.0, 128.0, 116.0),
        ] {
            assert_eq!(
                width_for_gap(Look::Eficiencia, gap),
                eficiencia,
                "Eficiencia {gap}"
            );
            assert_eq!(width_for_gap(Look::Vantare, gap), vantare, "Vantare {gap}");
        }
    }

    #[test]
    fn sampling_the_same_state_twice_is_identical_and_needs_no_time() {
        let photo = snapshot();
        let vm = project(&photo);
        let mut state = State::default();
        state.update(&photo, &vm);
        let first = sample(&vm, &state);
        assert_eq!(first, sample(&vm, &state));
        state.update(&photo, &vm);
        assert_eq!(first, sample(&vm, &state), "reposo sin reloj");
    }
}
