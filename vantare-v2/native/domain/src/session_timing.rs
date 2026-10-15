//! Hechos de sesión para avisos; todos los instantes usan el reloj de sesión,
//! nunca UTC ni el reloj local del consumidor. Ausencia no implica cero.
use crate::{Quality, SessionKind};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartPhase {
    Grid,
    Formation,
    Countdown,
    Racing,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SessionTiming {
    /// Inicio real confirmado, no el instante de conexión del cliente.
    pub started_at_s: Quality<f64>,
    /// Final real confirmado, no el fin programado ni remaining_s == 0.
    pub finished_at_s: Quality<f64>,
    /// Fin programado por el simulador; puede pasar sin terminar la sesión.
    pub scheduled_end_s: Quality<f64>,
    pub start_phase: Quality<StartPhase>,
    /// Distancia longitudinal hasta la próxima línea de salida/meta, en pista.
    /// No es la distancia a la casilla de parrilla ni una distancia euclídea.
    pub distance_to_start_line_m: Quality<f64>,
    /// La siguiente sesión debe estar identificada por la fuente, sin asumir
    /// que después de prácticas siempre viene qualy o carrera.
    pub next_kind: Quality<SessionKind>,
    /// Inicio anunciado de next_kind en el reloj de la sesión actual.
    /// No se obtiene sumando remaining_s al reloj de pared.
    pub next_starts_at_s: Quality<f64>,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_silent_source_cannot_leave_current_session_notices() {
        let mut state = crate::State::default();
        state.session.timing = SessionTiming {
            started_at_s: Quality::Reliable(10.0),
            finished_at_s: Quality::Reliable(100.0),
            scheduled_end_s: Quality::Reliable(90.0),
            start_phase: Quality::Reliable(StartPhase::Countdown),
            distance_to_start_line_m: Quality::Estimated(30.0),
            next_kind: Quality::Reliable(SessionKind::Race),
            next_starts_at_s: Quality::Reliable(120.0),
        };
        crate::degrade(&mut state);
        let t = &state.session.timing;
        assert_eq!(t.started_at_s, Quality::Stale(10.0));
        assert_eq!(t.finished_at_s, Quality::Stale(100.0));
        assert_eq!(t.scheduled_end_s, Quality::Stale(90.0));
        assert_eq!(t.start_phase, Quality::Stale(StartPhase::Countdown));
        assert_eq!(t.distance_to_start_line_m, Quality::Stale(30.0));
        assert_eq!(t.next_kind, Quality::Stale(SessionKind::Race));
        assert_eq!(t.next_starts_at_s, Quality::Stale(120.0));
    }
}
