//! Combustible del jugador (matemática de ISA-1403 `derive/fuel.rs`): el
//! consumo de una vuelta se mide al cerrarla (nivel al abrir la vuelta − nivel
//! al cerrarla) y se promedia sobre las últimas vueltas medidas. Una vuelta con
//! repostaje (>0,05 L) o boxes no se mide. Estado entre fotos; sin reloj.

use std::collections::VecDeque;

use vantare_domain::{Car, Player, Quality};

/// Ventana de la media móvil. El original la configuraba hasta 10; aquí nada la
/// configura y se fija su valor por defecto (3).
const WINDOW_LAPS: usize = 3;
const HISTORY_LAPS: usize = 10;
/// Subida de nivel que delata un repostaje (epsilon del original).
const REFUEL_EPSILON_L: f64 = 0.05;

/// Estado entre fotos del combustible del jugador. Vive en el núcleo, no en
/// `domain`: no es una señal, es memoria de la derivación.
#[derive(Debug, Default)]
pub(super) struct Tracker {
    open: Option<OpenLap>,
    samples: VecDeque<(u32, f64)>,
    last_lap: Option<u32>,
}

#[derive(Clone, Copy, Debug)]
struct OpenLap {
    /// Vuelta que se está midiendo.
    lap: u32,
    /// Nivel al abrirla.
    open_l: f64,
    /// Último nivel visto.
    last_l: f64,
    /// Repostó o pisó boxes: su consumo no se mide.
    invalid: bool,
}

impl Tracker {
    /// Olvida la vuelta en curso; la ventana medida también se descarta (sesión
    /// nueva o cambio de coche del jugador).
    pub(super) fn reset(&mut self) {
        self.open = None;
        self.last_lap = None;
        self.samples.clear();
    }

    /// Pierde la vuelta en curso (dato ausente); la ventana medida se conserva.
    pub(super) fn invalidate(&mut self) {
        self.open = None;
        self.last_lap = None;
    }

    /// Consume la foto y completa las señales derivadas del jugador si el
    /// adaptador no las trae actuales.
    pub(super) fn derive(&mut self, player: &mut Player, car: &Car) {
        self.observe(player, car);
        self.write(player);
    }

    fn observe(&mut self, player: &Player, car: &Car) {
        let (Some(lap), Some(level), Some(in_pit)) = (
            car.laps.current().copied(),
            player.fuel.level_l.current().copied(),
            car.in_pits.current().copied(),
        ) else {
            self.invalidate();
            return;
        };
        let over_capacity = player
            .fuel
            .capacity_l
            .current()
            .is_some_and(|capacity| level > *capacity);
        if level < 0.0 || over_capacity {
            self.invalidate();
            return;
        }
        let Some(open) = self.open else {
            // Primera foto a mitad de vuelta: esperar a un cruce observado.
            if self
                .last_lap
                .is_some_and(|last| last.checked_add(1) == Some(lap))
            {
                self.start(lap, level, in_pit);
            }
            self.last_lap = Some(lap);
            return;
        };
        self.last_lap = Some(lap);
        let mut open = open;
        if level > open.last_l + REFUEL_EPSILON_L || in_pit {
            open.invalid = true;
        }
        match i64::from(lap) - i64::from(open.lap) {
            0 => {
                open.last_l = level;
                self.open = Some(open);
            }
            1 => {
                self.close(open, level);
                self.start(lap, level, in_pit);
            }
            _ => self.open = None,
        }
    }

    /// Cierra la vuelta abierta con el nivel actual; solo registra consumos
    /// positivos y finitos de vueltas sin incidencias.
    fn close(&mut self, open: OpenLap, level: f64) {
        if open.invalid {
            return;
        }
        let consumed = open.open_l - level;
        if !consumed.is_finite() || consumed <= 0.0 {
            return;
        }
        if self.samples.len() == HISTORY_LAPS {
            self.samples.pop_front();
        }
        self.samples.push_back((open.lap, consumed));
    }

    fn start(&mut self, lap: u32, level: f64, in_pit: bool) {
        self.open = Some(OpenLap {
            lap,
            open_l: level,
            last_l: level,
            invalid: in_pit,
        });
    }

    /// Media de la ventana medida, si hay alguna vuelta.
    fn per_lap(&self) -> Option<f64> {
        if self.samples.is_empty() {
            return None;
        }
        let mut sum = 0.0;
        let mut count = 0_u32;
        for (_, sample) in self.samples.iter().rev().take(WINDOW_LAPS) {
            sum += sample;
            count += 1;
        }
        let average = sum / f64::from(count);
        average.is_finite().then_some(average)
    }

    /// `per_lap_l` = media de la ventana; `laps_left` = nivel / `per_lap_l`.
    /// Un dato nativo actual nunca se pisa.
    fn write(&self, player: &mut Player) {
        player.fuel.history = [None; HISTORY_LAPS];
        for (slot, sample) in player.fuel.history.iter_mut().zip(&self.samples) {
            *slot = Some(*sample);
        }
        if player.fuel.per_lap_l.current().is_none()
            && let Some(per_lap) = self.per_lap()
        {
            player.fuel.per_lap_l = Quality::Estimated(per_lap);
        }
        let (Some(level), Some(per_lap)) = (
            player.fuel.level_l.current().copied(),
            player.fuel.per_lap_l.current().copied(),
        ) else {
            return;
        };
        if player.fuel.laps_left.current().is_none() && per_lap > 0.0 {
            let laps_left = level / per_lap;
            if laps_left.is_finite() {
                player.fuel.laps_left = Quality::Estimated(laps_left);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use vantare_domain::{CarId, Fuel};

    use super::*;

    #[test]
    fn first_observation_is_not_a_full_lap() {
        let mut tracker = Tracker::default();
        tracker.derive(&mut at_level(100.0), &car(1, false));
        let mut player = at_level(98.0);
        tracker.derive(&mut player, &car(2, false));
        assert_eq!(player.fuel.per_lap_l, Quality::Unavailable);
        player = at_level(94.0);
        tracker.derive(&mut player, &car(3, false));
        assert_eq!(player.fuel.per_lap_l, Quality::Estimated(4.0));
    }

    #[test]
    fn history_keeps_ten_laps_and_average_only_the_last_three() {
        let mut tracker = Tracker::default();
        let mut level = 200.0;
        tracker.derive(&mut at_level(level), &car(0, false));
        tracker.derive(&mut at_level(level), &car(1, false));
        let mut player = at_level(level);
        for lap in 1..=12 {
            level -= f64::from(lap);
            player = at_level(level);
            tracker.derive(&mut player, &car(lap + 1, false));
        }
        let history: Vec<_> = player.fuel.history.into_iter().flatten().collect();
        assert_eq!(
            history,
            (3..=12)
                .map(|lap| (lap, f64::from(lap)))
                .collect::<Vec<_>>()
        );
        assert_eq!(player.fuel.per_lap_l, Quality::Estimated(11.0));
        tracker.invalidate();
        tracker.derive(&mut player, &car(20, false));
        assert_eq!(
            player
                .fuel
                .history
                .into_iter()
                .flatten()
                .collect::<Vec<_>>(),
            history
        );
        tracker.reset();
        tracker.derive(&mut at_level(200.0), &car(0, false));
        assert!(tracker.samples.is_empty());
    }

    fn car(lap: u32, in_pit: bool) -> Car {
        Car {
            id: CarId(1),
            laps: Quality::Reliable(lap),
            in_pits: Quality::Reliable(in_pit),
            ..Car::default()
        }
    }

    fn at_level(level_l: f64) -> Player {
        Player {
            car: CarId(1),
            fuel: Fuel {
                level_l: Quality::Reliable(level_l),
                ..Fuel::default()
            },
            ..Player::default()
        }
    }

    #[test]
    fn three_laps_average_and_laps_left() {
        let mut tracker = Tracker::default();
        tracker.derive(&mut at_level(100.0), &car(0, false));
        let mut player = at_level(100.0);
        tracker.derive(&mut player, &car(1, false));
        assert_eq!(
            player.fuel.per_lap_l,
            Quality::Unavailable,
            "sin vueltas cerradas no hay consumo"
        );

        player = at_level(96.0);
        tracker.derive(&mut player, &car(2, false));
        assert_eq!(player.fuel.per_lap_l, Quality::Estimated(4.0));
        assert_eq!(player.fuel.laps_left, Quality::Estimated(24.0));

        player = at_level(92.0);
        tracker.derive(&mut player, &car(3, false));
        player = at_level(89.0);
        tracker.derive(&mut player, &car(4, false));
        // Ventana [4, 4, 3] en vez del consumo total de la primera vuelta.
        let per_lap = player.fuel.per_lap_l.current().copied().unwrap();
        assert!((per_lap - 11.0 / 3.0).abs() < 1e-9, "media de 3 vueltas");
        let laps_left = player.fuel.laps_left.current().copied().unwrap();
        assert!((laps_left - 89.0 / (11.0 / 3.0)).abs() < 1e-9);
    }

    #[test]
    fn refuel_invalidates_the_lap() {
        let mut tracker = Tracker::default();
        tracker.derive(&mut at_level(100.0), &car(0, false));
        let mut player = at_level(100.0);
        tracker.derive(&mut player, &car(1, false));
        player = at_level(96.0);
        tracker.derive(&mut player, &car(2, false)); // mide 4 L
        // Reposta a mitad de la vuelta 2: 96 → 100 (subida > 0,05 L).
        player = at_level(100.0);
        tracker.derive(&mut player, &car(2, false));
        // Cierra la vuelta 2 con 100 → 95, pero queda invalidada.
        player = at_level(95.0);
        tracker.derive(&mut player, &car(3, false));
        // Vuelta 3: 95 → 80 sí se mide.
        player = at_level(80.0);
        tracker.derive(&mut player, &car(4, false));
        assert_eq!(
            player.fuel.per_lap_l,
            Quality::Estimated(9.5),
            "media de la vuelta buena (4 L) y la buena tras el repostaje (15 L)"
        );
    }

    #[test]
    fn pit_stop_invalidates_the_lap() {
        let mut tracker = Tracker::default();
        tracker.derive(&mut at_level(100.0), &car(0, false));
        let mut player = at_level(100.0);
        tracker.derive(&mut player, &car(1, false));
        player = at_level(99.0);
        tracker.derive(&mut player, &car(1, true)); // pisa boxes: vuelta invalidada
        player = at_level(95.0);
        tracker.derive(&mut player, &car(2, false)); // cierra la 1: no se mide
        assert_eq!(player.fuel.per_lap_l, Quality::Unavailable);
        player = at_level(91.0);
        tracker.derive(&mut player, &car(3, false)); // cierra la 2: 4 L
        assert_eq!(player.fuel.per_lap_l, Quality::Estimated(4.0));
    }

    #[test]
    fn native_values_win_and_gaps_in_the_lap_do_not_invent_measurements() {
        let mut tracker = Tracker::default();
        tracker.derive(&mut at_level(100.0), &car(0, false));
        let mut player = at_level(100.0);
        tracker.derive(&mut player, &car(1, false));
        // La foto que cierra la vuelta llega con los valores nativos actuales.
        let mut native = at_level(96.0);
        native.fuel.per_lap_l = Quality::Reliable(2.5);
        native.fuel.laps_left = Quality::Reliable(40.0);
        tracker.derive(&mut native, &car(2, false));
        assert_eq!(native.fuel.per_lap_l, Quality::Reliable(2.5));
        assert_eq!(native.fuel.laps_left, Quality::Reliable(40.0));

        // Un salto de dos vueltas reinicia la medida, no la inventa.
        let mut tracker = Tracker::default();
        let mut player = at_level(100.0);
        tracker.derive(&mut player, &car(1, false));
        player = at_level(90.0);
        tracker.derive(&mut player, &car(4, false));
        assert_eq!(player.fuel.per_lap_l, Quality::Unavailable);
    }
}
