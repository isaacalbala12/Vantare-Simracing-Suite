//! Storage falso y reloj falso: cada espera adelanta el reloj lo pedido, sin
//! dormir. El guion dice en qué instantes responde storage.
use super::*;
use std::cell::Cell;
use std::rc::Rc;

const SECOND: Duration = Duration::from_secs(1);

fn state(watermark: u64) -> SeriesStorageState {
    SeriesStorageState {
        watermark,
        finished: true,
        attempted: watermark,
    }
}

/// Instantes (desde que se pide cerrar) en que storage responde, cuándo
/// confirma `finished` y cuándo sale. `None`: nunca.
struct Script {
    responses: Vec<Duration>,
    confirms: Option<Duration>,
    exits: Option<Duration>,
    exit_fails: bool,
}

struct Fake {
    start: Instant,
    clock: Rc<Cell<Instant>>,
    script: Script,
}

impl Fake {
    fn new(script: Script) -> (Self, Rc<Cell<Instant>>) {
        let start = Instant::now();
        let clock = Rc::new(Cell::new(start));
        let fake = Self {
            start,
            clock: Rc::clone(&clock),
            script,
        };
        (fake, clock)
    }
    fn elapsed(&self) -> Duration {
        self.clock.get() - self.start
    }
    fn wait(&self, wait: Duration) {
        self.clock.set(self.clock.get() + wait);
    }
    fn due(&self, at: Option<Duration>) -> bool {
        at.is_some_and(|at| self.elapsed() >= at)
    }
}

impl CloseProbe for Fake {
    fn progress(&self) -> u64 {
        let answered = self
            .script
            .responses
            .iter()
            .filter(|at| self.elapsed() >= **at)
            .count();
        // `finished` es también una respuesta.
        u64::try_from(answered).unwrap() + u64::from(self.due(self.script.confirms))
    }
    fn confirmation(&mut self, wait: Duration) -> Option<io::Result<SeriesStorageState>> {
        if self.due(self.script.confirms) {
            return Some(Ok(state(3)));
        }
        self.wait(wait);
        None
    }
    fn exit(&mut self, wait: Duration) -> Option<io::Result<()>> {
        if self.due(self.script.exits) {
            return Some(if self.script.exit_fails {
                Err(io::Error::other("storage terminó con error"))
            } else {
                Ok(())
            });
        }
        self.wait(wait);
        None
    }
}

struct Run {
    closed: Closed,
    /// Instante en que se dejó de esperar.
    ended: Duration,
    /// Instante en que corrió `on_confirmed`, si corrió.
    confirmed: Option<Duration>,
}

fn close(script: Script, limits: CloseLimits) -> Run {
    let (mut fake, clock) = Fake::new(script);
    let start = fake.start;
    let mut now = || clock.get();
    let seen = Cell::new(None);
    let closed = run(&mut fake, &mut now, limits, |_| {
        seen.set(Some(clock.get() - start));
    });
    Run {
        closed,
        ended: fake.elapsed(),
        confirmed: seen.get(),
    }
}

fn every(step: Duration, until: Duration) -> Vec<Duration> {
    (1..)
        .map(|n| step * n)
        .take_while(|at| *at <= until)
        .collect()
}

fn timed_out(closed: &Closed) -> bool {
    match closed {
        Closed::Unconfirmed(error) | Closed::ConfirmedUnclosed(_, error) => {
            error.kind() == io::ErrorKind::TimedOut
        }
        Closed::Clean(_) => false,
    }
}

#[test]
fn a_slow_close_that_keeps_answering_is_never_killed() {
    // Cada COMMIT tarda 3 s (disco muy ocupado): 20 s en total, nunca parado 10 s.
    let run = close(
        Script {
            responses: every(3 * SECOND, 18 * SECOND),
            confirms: Some(20 * SECOND),
            exits: Some(27 * SECOND),
            exit_fails: false,
        },
        CloseLimits::PRODUCT,
    );
    assert!(matches!(run.closed, Closed::Clean(_)), "{:?}", run.closed);
    assert_eq!(run.confirmed, Some(20 * SECOND));
    assert_eq!(run.ended, 27 * SECOND);
}

#[test]
fn the_measured_slow_close_of_1_8_s_fits() {
    // #2865: finished a ~0,54 s y salida a ~1,79 s con el disco ocupado.
    let run = close(
        Script {
            responses: vec![Duration::from_millis(325)],
            confirms: Some(Duration::from_millis(540)),
            exits: Some(Duration::from_millis(1790)),
            exit_fails: false,
        },
        CloseLimits::PRODUCT,
    );
    assert!(matches!(run.closed, Closed::Clean(_)), "{:?}", run.closed);
}

#[test]
fn ten_seconds_without_progress_before_finished_stops_waiting_exactly_then() {
    let run = close(
        Script {
            responses: vec![2 * SECOND],
            confirms: None,
            exits: None,
            exit_fails: false,
        },
        CloseLimits::PRODUCT,
    );
    assert!(
        matches!(run.closed, Closed::Unconfirmed(_)),
        "{:?}",
        run.closed
    );
    assert!(timed_out(&run.closed));
    // Último avance a los 2 s: el margen de 10 s cuenta desde ahí.
    assert_eq!(run.ended, 12 * SECOND);
    assert_eq!(run.confirmed, None);
}

#[test]
fn progress_restarts_the_margin_every_time() {
    // Avances a los 9, 18 y 27 s: nunca 10 s seguidos sin progreso.
    let run = close(
        Script {
            responses: every(9 * SECOND, 27 * SECOND),
            confirms: Some(28 * SECOND),
            exits: Some(29 * SECOND),
            exit_fails: false,
        },
        CloseLimits::PRODUCT,
    );
    assert!(matches!(run.closed, Closed::Clean(_)), "{:?}", run.closed);
}

#[test]
fn the_absolute_cap_ends_a_close_that_never_stops_progressing() {
    let run = close(
        Script {
            responses: every(SECOND, 60 * SECOND),
            confirms: None,
            exits: None,
            exit_fails: false,
        },
        CloseLimits::PRODUCT,
    );
    assert!(
        matches!(run.closed, Closed::Unconfirmed(_)),
        "{:?}",
        run.closed
    );
    assert!(timed_out(&run.closed));
    assert_eq!(run.ended, 30 * SECOND);
}

#[test]
fn a_confirmed_close_that_stalls_closing_the_database_keeps_the_data_complete() {
    // finished a 1 s; el checkpoint no termina nunca: se espera 10 s y se mata.
    let run = close(
        Script {
            responses: vec![],
            confirms: Some(SECOND),
            exits: None,
            exit_fails: false,
        },
        CloseLimits::PRODUCT,
    );
    assert!(
        matches!(run.closed, Closed::ConfirmedUnclosed(state, _) if state.finished),
        "{:?}",
        run.closed
    );
    assert_eq!(run.confirmed, Some(SECOND));
    assert_eq!(run.ended, 11 * SECOND);
}

#[test]
fn closing_the_database_with_an_error_after_finished_is_still_confirmed() {
    let run = close(
        Script {
            responses: vec![],
            confirms: Some(SECOND),
            exits: Some(2 * SECOND),
            exit_fails: true,
        },
        CloseLimits::PRODUCT,
    );
    assert!(
        matches!(&run.closed, Closed::ConfirmedUnclosed(_, error) if error.kind() != io::ErrorKind::TimedOut),
        "{:?}",
        run.closed
    );
}

#[test]
fn a_fixed_timeout_ends_at_the_same_time_whatever_the_progress() {
    let run = close(
        Script {
            responses: every(Duration::from_millis(100), 5 * SECOND),
            confirms: Some(3 * SECOND),
            exits: None,
            exit_fails: false,
        },
        CloseLimits::fixed(SECOND),
    );
    assert!(
        matches!(run.closed, Closed::Unconfirmed(_)),
        "{:?}",
        run.closed
    );
    assert_eq!(run.ended, SECOND);
}

#[test]
fn the_deadline_alone_counts_from_the_close_request_and_the_last_progress() {
    let start = Instant::now();
    let mut deadline = Deadline::new(CloseLimits::PRODUCT, start, 0);
    assert!(deadline.check(start + 9 * SECOND, 0).is_ok());
    assert!(deadline.check(start + 9 * SECOND, 1).is_ok());
    assert!(deadline.check(start + 18 * SECOND, 1).is_ok());
    assert!(deadline.check(start + 19 * SECOND, 1).is_err());
    let mut capped = Deadline::new(CloseLimits::PRODUCT, start, 0);
    assert!(capped.check(start + 29 * SECOND, 3).is_ok());
    // Al llegar al tope, ni un avance en ese mismo instante lo prorroga.
    assert!(capped.check(start + 30 * SECOND, 4).is_err());
}
