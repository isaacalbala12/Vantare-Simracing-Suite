//! Respaldo del stint, del consumo previsto de la vuelta y de los litros
//! cargados en la parada del jugador (#1497).
//!
//! Esto debería darlo LMU (su HUD y su REST lo muestran); mientras el
//! adaptador no lo lea, el núcleo lo deriva de señales que sí publica. Un
//! valor nativo actual siempre gana. Estado entre fotos; sin reloj de pared.

use vantare_domain::{Car, Player, Quality, Session};

/// Subida de nivel que delata un repostaje (la misma que el combustible).
const REFUEL_EPSILON_L: f64 = 0.05;
/// Parte de la vuelta a partir de la que el consumo previsto es estable.
const MIN_LAP_FRACTION: f64 = 0.1;

#[derive(Debug, Default)]
pub(super) struct Tracker {
    /// Vueltas completadas y reloj de sesión al empezar el stint.
    start: Option<(u32, Option<f64>)>,
    in_pits: Option<bool>,
    /// Vuelta en curso y nivel al abrirla.
    lap: Option<(u32, f64)>,
    last_level: Option<f64>,
    /// Nivel al detenerse en la parada.
    stop_level: Option<f64>,
}

fn finite(quality: &Quality<f64>) -> Option<f64> {
    quality.current().copied().filter(|v| v.is_finite())
}

impl Tracker {
    pub(super) fn reset(&mut self) {
        *self = Self::default();
    }

    pub(super) fn derive(&mut self, player: &mut Player, car: &Car, session: &Session) {
        let laps = car.laps.current().copied();
        let in_pits = car.in_pits.current().copied();
        let level = finite(&player.fuel.level_l);
        self.stint(player, laps, in_pits, finite(&session.elapsed_s));
        self.projection(player, car, laps, level, finite(&session.track_length_m));
        self.refuel(player, in_pits, level);
        self.in_pits = in_pits.or(self.in_pits);
        self.last_level = level.or(self.last_level);
    }

    /// El stint empieza al salir de boxes (o con la sesión, en la vuelta 0).
    fn stint(
        &mut self,
        player: &mut Player,
        laps: Option<u32>,
        in_pits: Option<bool>,
        elapsed: Option<f64>,
    ) {
        let Some(laps) = laps else { return };
        let left_pits = self.in_pits == Some(true) && in_pits == Some(false);
        if left_pits || (self.start.is_none() && laps == 0) {
            self.start = Some((laps, elapsed));
        }
        let Some((start_laps, start_elapsed)) = self.start else {
            return;
        };
        if player.stint.laps.current().is_none() {
            player.stint.laps = Quality::Estimated(laps.saturating_sub(start_laps));
        }
        if player.stint.elapsed_s.current().is_none()
            && let (Some(now), Some(start)) = (elapsed, start_elapsed)
        {
            player.stint.elapsed_s = Quality::Estimated((now - start).max(0.0));
        }
    }

    /// Litros gastados en lo que va de vuelta, llevados a la vuelta entera por
    /// la parte recorrida. En FCY cae y deja ver el ahorro.
    fn projection(
        &mut self,
        player: &mut Player,
        car: &Car,
        laps: Option<u32>,
        level: Option<f64>,
        length: Option<f64>,
    ) {
        let (Some(lap), Some(level)) = (laps, level) else {
            self.lap = None;
            return;
        };
        let refuelled = self
            .last_level
            .is_some_and(|last| level > last + REFUEL_EPSILON_L);
        match self.lap {
            Some((open, _)) if open == lap && !refuelled => {}
            _ => self.lap = Some((lap, level)),
        }
        if player.fuel.lap_projection_l.current().is_some() {
            return;
        }
        let Some((_, open_level)) = self.lap else {
            return;
        };
        let fraction = finite(&car.lap_distance_m)
            .zip(length.filter(|l| *l > 0.0))
            .map(|(distance, length)| distance / length);
        let used = open_level - level;
        if let Some(fraction) = fraction.filter(|f| (MIN_LAP_FRACTION..=1.0).contains(f))
            && used > 0.0
        {
            player.fuel.lap_projection_l = Quality::Estimated(used / fraction);
        }
    }

    /// Litros cargados desde que el coche entró a boxes, en cuanto el nivel sube.
    fn refuel(&mut self, player: &mut Player, in_pits: Option<bool>, level: Option<f64>) {
        if in_pits != Some(true) {
            self.stop_level = None;
            return;
        }
        let Some(level) = level else { return };
        let start = *self.stop_level.get_or_insert(level);
        // Solo si de verdad entra combustible: parado en el garaje no es repostar.
        let added = level - start;
        if added > REFUEL_EPSILON_L && player.pit_service.refuel_added_l.current().is_none() {
            player.pit_service.refuel_added_l = Quality::Estimated(added);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{CarId, Fuel};

    fn car(laps: u32, in_pits: bool, distance: f64) -> Car {
        Car {
            id: CarId(1),
            laps: Quality::Reliable(laps),
            in_pits: Quality::Reliable(in_pits),
            lap_distance_m: Quality::Reliable(distance),
            ..Car::default()
        }
    }

    fn player(level: f64) -> Player {
        Player {
            car: CarId(1),
            fuel: Fuel {
                level_l: Quality::Reliable(level),
                ..Fuel::default()
            },
            ..Player::default()
        }
    }

    fn session(elapsed: f64) -> Session {
        Session {
            elapsed_s: Quality::Reliable(elapsed),
            track_length_m: Quality::Reliable(10_000.0),
            ..Session::default()
        }
    }

    #[test]
    fn stint_counts_from_the_pit_exit_and_the_projection_scales_the_lap() {
        let mut tracker = Tracker::default();
        // A mitad de carrera, sin haber visto salir de boxes: sin stint.
        let mut p = player(50.0);
        tracker.derive(&mut p, &car(10, false, 100.0), &session(2000.0));
        assert!(p.stint.laps.current().is_none());
        // Entra a boxes y carga 30 L.
        let mut added = Quality::Unavailable;
        for level in [50.0, 65.0, 80.0] {
            let mut p = player(level);
            tracker.derive(&mut p, &car(10, true, 9_900.0), &session(2100.0));
            added = p.pit_service.refuel_added_l;
        }
        assert_eq!(added, Quality::Estimated(30.0));
        // Sale: stint nuevo desde la vuelta 10.
        let mut p = player(80.0);
        tracker.derive(&mut p, &car(10, false, 50.0), &session(2130.0));
        assert_eq!(p.stint.laps, Quality::Estimated(0));
        let mut p = player(79.0);
        tracker.derive(&mut p, &car(11, false, 100.0), &session(2300.0));
        assert_eq!(p.stint.laps, Quality::Estimated(1));
        assert_eq!(p.stint.elapsed_s, Quality::Estimated(170.0));
        // A un cuarto de la vuelta 11 ha gastado 1 L: unos 4 L por vuelta.
        let mut p = player(78.0);
        tracker.derive(&mut p, &car(11, false, 2_500.0), &session(2350.0));
        let projection = p.fuel.lap_projection_l.current().copied().unwrap();
        assert!((projection - 1.0 / 0.25).abs() < 1e-9);
        assert!(
            p.pit_service.refuel_added_l.current().is_none(),
            "fuera de boxes"
        );
    }

    #[test]
    fn native_values_win_and_the_session_start_opens_the_first_stint() {
        let mut tracker = Tracker::default();
        let mut p = player(90.0);
        p.stint.laps = Quality::Reliable(7);
        tracker.derive(&mut p, &car(0, false, 10.0), &session(5.0));
        assert_eq!(p.stint.laps, Quality::Reliable(7), "nativo gana");
        assert_eq!(
            p.stint.elapsed_s,
            Quality::Estimated(0.0),
            "la sesión abre el stint"
        );
    }
}
