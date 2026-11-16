//! Escena pura de Fuel, común a Vantare y Eficiencia: el tablero de domain y el
//! movimiento ya muestreado. Sin Rune, sin colores y sin ventana. La posición de
//! cada elemento es la fracción de su barra (0 = inicio, 1 = final) y la
//! opacidad es el borde rojo de combustible bajo; el alto y la `y` de cada línea
//! los fija cada Look al pintar.
//!
//! Tras `Motion::update` o `Motion::policy`, llamar a `advance` con los mismos
//! datos e instante antes de `sample`: el muestreo no avanza el estado.
use crate::motion::Tween;
use std::sync::Arc;
use vantare_domain::{
    SourceState,
    fuel_strategy::{Board, Plan},
};

/// El borde late entre estos dos valores, como en GPUI.
const BORDER_MIN: f32 = 0.55;
const BORDER_MAX: f32 = 1.0;
/// Cadencia de reserva cuando el diseño no fija ninguna; igual que Relative.
const DEFAULT_HZ: u16 = 30;

/// Canales animados: los cinco de GPUI.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Bar {
    /// Barra única del tamaño compacto.
    Compact,
    /// Medidor de energía virtual del tamaño ampliado.
    Energy,
    /// Medidor de combustible del tamaño ampliado.
    Fuel,
    /// Medidor de repostaje en boxes.
    Refuel,
    /// Marcador de la vuelta en curso dentro de la ventana de parada.
    Now,
}

/// Valor visible: canal y fracción ya interpolada en el instante.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VisualBar {
    pub bar: Bar,
    pub fraction: f32,
}

/// Duraciones del diseño Vantare, en segundos.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Timing {
    /// Deslizamiento de una barra entre dos valores.
    pub slide: f64,
    /// Periodo del latido del borde rojo.
    pub pulse: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    pub board: Arc<Board>,
    pub bars: Vec<VisualBar>,
    /// Opacidad del borde rojo; 0 = no se pinta.
    pub border: f32,
}

struct MovingBar {
    bar: Bar,
    slide: Tween,
}

/// Estado de movimiento concreto, reutilizable por los dos Looks.
pub struct Motion {
    bars: Vec<MovingBar>,
    timing: Timing,
    reduced: bool,
    hz: u16,
    started: f64,
    next_pulse: Option<f64>,
    pulse: f32,
}

/// Sin coche propio o fuente perdida: se pinta la espera, sin movimiento.
pub fn waiting(board: &Board) -> bool {
    !board.player_present || matches!(board.source_state, SourceState::Waiting | SourceState::Lost)
}

/// Toca entrar esta vuelta: borde rojo y aviso de combustible bajo.
pub fn low(board: &Board) -> bool {
    !waiting(board) && board.plan == Plan::Now && board.service.is_none()
}

impl Motion {
    pub fn new(timing: Timing, reduced: bool, hz: u16, clock: f64) -> Self {
        Self {
            bars: Vec::new(),
            timing,
            reduced,
            hz,
            started: clock,
            next_pulse: None,
            pulse: 0.0,
        }
    }
    /// Cambia la política de movimiento; devuelve si algo cambió.
    pub fn policy(&mut self, reduced: bool, hz: u16) -> bool {
        let hz_changed = self.hz != hz;
        let changed = self.reduced != reduced;
        if hz_changed {
            // Al cambiar los Hz se reprograma el reloj del latido.
            self.next_pulse = None;
        }
        if changed && reduced {
            self.next_pulse = None;
            self.pulse = 0.0;
            for moving in &mut self.bars {
                moving.slide.settle();
            }
        }
        self.reduced = reduced;
        self.hz = hz;
        changed || hz_changed
    }
    /// `targets` son los valores que el Look va a pintar. Un canal que no
    /// aparece conserva su estado, como al cambiar de Look en GPUI.
    pub fn update(&mut self, board: &Board, targets: &[(Bar, f32)], snap: bool, clock: f64) {
        let snap = snap || self.reduced || waiting(board);
        for &(bar, fraction) in targets {
            match self.bars.iter_mut().find(|moving| moving.bar == bar) {
                Some(moving) if snap => moving.slide = Tween::fixed(fraction),
                Some(moving) => moving.slide.retarget(fraction, clock, self.timing.slide),
                None => {
                    self.bars.push(MovingBar {
                        bar,
                        slide: Tween::fixed(fraction),
                    });
                    self.bars.sort_by_key(|moving| moving.bar);
                }
            }
        }
    }
    /// Latido del borde: solo con combustible bajo y sin movimiento reducido.
    pub fn advance(&mut self, board: &Board, clock: f64) {
        if !low(board) {
            self.next_pulse = None;
            self.pulse = 0.0;
            return;
        }
        if self.reduced {
            // Diferencia intencionada respecto a GPUI (#2365): allí el borde
            // sigue latiendo con movimiento reducido; la decisión 3 del ADR 0110
            // pide cero imágenes, así que se queda fijo en 1,0 (fase 0 de GPUI)
            // y sin reloj.
            self.next_pulse = None;
            self.pulse = BORDER_MAX;
            return;
        }
        if self.next_pulse.is_none_or(|due| clock >= due) {
            let hz = if self.hz == 0 { DEFAULT_HZ } else { self.hz };
            self.next_pulse = Some(clock + 1.0 / f64::from(hz));
            let phase =
                (clock - self.started) / self.timing.pulse.max(0.001) * std::f64::consts::TAU;
            self.pulse = BORDER_MIN + (BORDER_MAX - BORDER_MIN) * phase.cos().abs() as f32;
        }
    }
    /// Instante del próximo frame; `None` en reposo.
    pub fn next_wake(&self, clock: f64) -> Option<f64> {
        if self.reduced {
            return None;
        }
        if self.bars.iter().any(|moving| moving.slide.active(clock)) {
            Some(clock)
        } else {
            self.next_pulse
        }
    }
}

/// Muestreo puro de las barras; no avanza el estado.
pub fn visual_bars(motion: &Motion, clock: f64) -> Vec<VisualBar> {
    motion
        .bars
        .iter()
        .map(|moving| VisualBar {
            bar: moving.bar,
            fraction: moving.slide.value(clock),
        })
        .collect()
}

/// Escena del instante. Llamar a `Motion::advance` con el mismo tablero antes.
pub fn sample(board: Arc<Board>, motion: &Motion, clock: f64) -> Scene {
    Scene {
        board,
        bars: visual_bars(motion, clock),
        border: motion.pulse,
    }
}

impl Scene {
    /// Fracción muestreada de un canal; `None` si todavía no se ha pedido.
    pub fn fraction(&self, bar: Bar) -> Option<f32> {
        self.bars
            .iter()
            .find(|visual| visual.bar == bar)
            .map(|visual| visual.fraction)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fuel::{board, board_of, photo};
    use vantare_domain::Quality::Reliable;

    fn motion(reduced: bool, hz: u16) -> Motion {
        Motion::new(
            Timing {
                slide: 0.32,
                pulse: 1.2,
            },
            reduced,
            hz,
            0.0,
        )
    }
    fn bars(motion: &Motion, clock: f64) -> Vec<VisualBar> {
        visual_bars(motion, clock)
    }

    #[test]
    fn bars_appear_at_their_value_and_slide_to_the_next_one() {
        let stopped = board(11.3, 25);
        let mut motion = motion(false, 4);
        motion.update(&stopped, &[(Bar::Fuel, 0.2)], false, 0.0);
        assert_eq!(
            bars(&motion, 0.0),
            [VisualBar {
                bar: Bar::Fuel,
                fraction: 0.2
            }],
            "aparecer no anima"
        );
        assert_eq!(motion.next_wake(0.0), None);
        motion.update(&stopped, &[(Bar::Fuel, 0.6)], false, 1.0);
        assert_eq!(bars(&motion, 1.0)[0].fraction, 0.2);
        assert!(motion.next_wake(1.0).is_some());
        // Curva de GPUI: a mitad de tiempo ya recorrió el 87,5 %.
        assert!((bars(&motion, 1.16)[0].fraction - 0.55).abs() < 0.0001);
        assert_eq!(bars(&motion, 1.32)[0].fraction, 0.6);
        assert_eq!(motion.next_wake(1.32), None, "sin transición, sin reloj");
    }

    #[test]
    fn a_hidden_channel_keeps_its_value_and_channels_sample_in_order() {
        let stopped = board(11.3, 25);
        let mut motion = motion(false, 4);
        motion.update(
            &stopped,
            &[(Bar::Now, 0.4), (Bar::Compact, 0.9)],
            false,
            0.0,
        );
        assert_eq!(
            bars(&motion, 0.0).iter().map(|b| b.bar).collect::<Vec<_>>(),
            [Bar::Compact, Bar::Now]
        );
        motion.update(&stopped, &[(Bar::Now, 0.5)], false, 1.0);
        assert_eq!(
            bars(&motion, 1.32),
            [
                VisualBar {
                    bar: Bar::Compact,
                    fraction: 0.9
                },
                VisualBar {
                    bar: Bar::Now,
                    fraction: 0.5
                }
            ],
            "el canal que deja de pintarse conserva su valor"
        );
    }

    #[test]
    fn sampling_is_pure_and_stays_idle_without_low_fuel() {
        let stopped = Arc::new(board(11.3, 25));
        let mut motion = motion(false, 4);
        motion.update(&stopped, &[(Bar::Fuel, 0.5)], false, 0.0);
        motion.advance(&stopped, 0.0);
        let scene = sample(stopped.clone(), &motion, 0.0);
        assert_eq!(scene, sample(stopped.clone(), &motion, 0.0));
        assert_eq!(scene.border, 0.0, "sin combustible bajo no hay borde");
        assert_eq!(motion.next_wake(0.0), None);
    }

    #[test]
    fn low_fuel_arms_a_clock_at_widget_cadence_and_higher_fuel_disarms_it() {
        let low = Arc::new(board(1.2, 17));
        let normal = Arc::new(board(11.3, 25));
        let mut motion = motion(false, 4);
        motion.update(&low, &[], false, 0.0);
        motion.advance(&low, 0.0);
        assert_eq!(motion.next_wake(0.0), Some(0.0 + 0.25));
        assert_eq!(sample(low.clone(), &motion, 0.0).border, 1.0);
        motion.advance(&low, 0.3);
        assert_eq!(motion.next_wake(0.3), Some(0.3 + 0.25));
        assert!((sample(low.clone(), &motion, 0.3).border - 0.55).abs() < 0.0001);
        // Sube el depósito: se apaga el reloj y el borde.
        motion.update(&normal, &[], false, 1.0);
        motion.advance(&normal, 1.0);
        assert_eq!(motion.next_wake(1.0), None);
        assert_eq!(sample(normal.clone(), &motion, 1.0).border, 0.0);
    }

    #[test]
    fn reduced_motion_has_no_clock_and_keeps_the_border_still() {
        let low = Arc::new(board(1.2, 17));
        let mut motion = motion(true, 4);
        motion.update(&low, &[(Bar::Compact, 0.2)], false, 0.0);
        motion.update(&low, &[(Bar::Compact, 0.8)], false, 1.0);
        assert_eq!(bars(&motion, 1.0)[0].fraction, 0.8, "salta al destino");
        motion.advance(&low, 1.0);
        assert_eq!(motion.next_wake(1.0), None);
        assert_eq!(sample(low.clone(), &motion, 1.0).border, 1.0);
        motion.policy(false, 4);
        motion.advance(&low, 2.0);
        assert!(motion.next_wake(2.0).is_some(), "vuelve el reloj");
    }

    #[test]
    fn waiting_and_boxes_never_arm_the_border_clock() {
        let mut parked = photo(1.2, 17);
        parked.state.source_state = SourceState::Waiting;
        let waiting = board_of(&parked);
        let mut refuelling = photo(1.2, 17);
        refuelling.state.cars[0].in_pits = Reliable(true);
        refuelling
            .state
            .player
            .as_mut()
            .expect("player")
            .pit_service
            .refuel_target_l = Reliable(30.0);
        let boxes = board_of(&refuelling);
        let mut motion = motion(false, 4);
        for board in [&waiting, &boxes] {
            assert!(!low(board));
            motion.update(board, &[], false, 0.0);
            motion.advance(board, 0.0);
            assert_eq!(motion.next_wake(0.0), None);
        }
    }
}
