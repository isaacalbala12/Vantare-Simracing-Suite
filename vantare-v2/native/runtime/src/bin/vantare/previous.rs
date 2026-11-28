//! Abrir Vantare mientras la instancia anterior aún se cierra (#2873). Las dos
//! no conviven (memoria compartida, telemetría y carpeta de grabaciones): la
//! nueva espera a que la anterior salga, sin ventana, y con un tope.
use std::time::Duration;

/// Lo más que puede tardar en salir la anterior: el Core recibe el cierre como
/// muy tarde a los 2 s y el supervisor le da `PRODUCER_CLOSE` desde entonces.
pub(super) const PREVIOUS_WAIT: Duration =
    Duration::from_secs(2).saturating_add(super::session::PRODUCER_CLOSE);

#[derive(Debug, PartialEq, Eq)]
pub(super) enum Busy {
    /// La anterior sigue en marcha: se le pide abrir el Hub, como siempre.
    OpenHub,
    /// La anterior terminó de cerrarse: esta arranca.
    Proceed,
    /// La anterior no terminó en el plazo: se avisa y esta no arranca.
    TooSlow,
}

/// `closing`: la anterior avisó de que se está cerrando. `wait` espera como
/// mucho el plazo dado a que la anterior salga y dice si salió.
pub(super) fn decide<E>(
    closing: bool,
    wait: impl FnOnce(Duration) -> Result<bool, E>,
) -> Result<Busy, E> {
    if !closing {
        return Ok(Busy::OpenHub);
    }
    Ok(if wait(PREVIOUS_WAIT)? {
        Busy::Proceed
    } else {
        Busy::TooSlow
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    /// Anterior falsa con reloj falso: sale a los `exits` segundos (o nunca).
    fn previous(
        exits: Option<u64>,
        asked: &Cell<Option<Duration>>,
    ) -> impl FnOnce(Duration) -> Result<bool, ()> + '_ {
        move |limit| {
            asked.set(Some(limit));
            Ok(exits.is_some_and(|at| Duration::from_secs(at) <= limit))
        }
    }

    #[test]
    fn a_running_instance_is_asked_to_open_the_hub_without_waiting() {
        let asked = Cell::new(None);
        assert_eq!(decide(false, previous(Some(1), &asked)), Ok(Busy::OpenHub));
        assert_eq!(asked.get(), None);
    }

    #[test]
    fn a_closing_instance_that_exits_in_time_lets_the_new_one_start() {
        for exits in [0, 1, 5, 17, 18] {
            let asked = Cell::new(None);
            assert_eq!(
                decide(true, previous(Some(exits), &asked)),
                Ok(Busy::Proceed)
            );
            assert_eq!(asked.get(), Some(PREVIOUS_WAIT));
        }
    }

    #[test]
    fn a_closing_instance_that_does_not_exit_ends_in_a_clear_message() {
        for exits in [Some(19), Some(600), None] {
            let asked = Cell::new(None);
            assert_eq!(decide(true, previous(exits, &asked)), Ok(Busy::TooSlow));
            assert_eq!(asked.get(), Some(PREVIOUS_WAIT));
        }
    }

    #[test]
    fn the_wait_covers_the_whole_close_of_the_previous_and_is_bounded() {
        assert_eq!(PREVIOUS_WAIT, Duration::from_secs(18));
        assert!(PREVIOUS_WAIT >= super::super::session::PRODUCER_CLOSE + Duration::from_secs(2));
    }
}
