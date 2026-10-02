//! Regresión del worker productivo con voz determinista; no reproduce audio.
#![allow(dead_code)] // El módulo compartido expone también operaciones ajenas al caso.
pub use vantare_engineer::{Applied, control, radio, spotter};

#[path = "../src/worker.rs"]
mod worker;

#[allow(clippy::unnecessary_wraps)] // Misma Interface que la voz productiva con I/O.
mod voice {
    use super::radio::{Intent, Locale};
    use std::{io, path::Path, time::Duration};

    pub struct Voice {
        until: Option<Duration>,
    }
    impl Voice {
        pub fn new(_: Option<&Path>) -> io::Result<Self> {
            Ok(Self { until: None })
        }
        pub fn play(
            &mut self,
            _: Locale,
            _: Intent,
            now: Duration,
        ) -> io::Result<Option<Duration>> {
            self.until = Some(now + Duration::from_secs(4));
            Ok(Some(Duration::from_secs(4)))
        }
        pub fn stop(&mut self) -> io::Result<()> {
            self.until = None;
            Ok(())
        }
        pub fn tick(&mut self, now: Duration) -> io::Result<bool> {
            if self.until.is_some_and(|until| now >= until) {
                self.until = None;
                Ok(true)
            } else {
                Ok(false)
            }
        }
    }
}

#[test]
fn withdrawing_fuel_audio_keeps_a_valid_pending_pit_event() {
    use std::{collections::BTreeMap, path::Path, time::Duration};
    use vantare_domain::{Car, CarId, Player, Quality, Snapshot, SourceState};
    use vantare_runtime::flows::{Cursor, PitEvent};

    let mut snapshot = Snapshot {
        epoch: 1,
        sequence: 1,
        ..Default::default()
    };
    snapshot.state.source_state = SourceState::Live;
    let mut player = Player {
        car: CarId(7),
        ..Default::default()
    };
    player.fuel.level_l = Quality::Reliable(1.0);
    snapshot.state.player = Some(player);
    snapshot.state.cars.push(Car {
        id: CarId(7),
        in_pits: Quality::Reliable(false),
        ..Default::default()
    });
    let mut worker =
        worker::RadioWorker::new(radio::Locale::Es, Some(Path::new("fixture"))).expect("worker");
    let mut output = Vec::new();
    worker
        .ingest(&snapshot, &Applied::default(), Duration::ZERO, &mut output)
        .expect("fuel");
    assert!(worker.runtime_status(0, &BTreeMap::new()).delivery.speaking);

    snapshot.sequence = 2;
    snapshot.state.cars[0].in_pits = Quality::Reliable(true);
    let event = PitEvent {
        cursor: Cursor { epoch: 1, index: 1 },
        sequence: 2,
        session: snapshot.state.session.id,
        car: CarId(7),
        was_in_pits: false,
        in_pits: true,
    };
    worker
        .ingest(
            &snapshot,
            &Applied {
                event: Some(event),
                ..Default::default()
            },
            Duration::from_millis(100),
            &mut output,
        )
        .expect("pit event");
    assert_eq!(
        worker.runtime_status(0, &BTreeMap::new()).delivery.pending,
        1
    );

    snapshot.sequence = 3;
    snapshot.state.player.as_mut().expect("player").fuel.level_l = Quality::Reliable(20.0);
    worker
        .ingest(
            &snapshot,
            &Applied::default(),
            Duration::from_millis(200),
            &mut output,
        )
        .expect("withdraw fuel");
    let status = worker.runtime_status(0, &BTreeMap::new());
    assert_eq!(status.delivery.history.len(), 2);
    assert_eq!(
        status.delivery.history[0].audio,
        control::runtime::AudioOutcome::Cancelled
    );
    assert_eq!(
        status.delivery.last().expect("pit delivery").message.intent,
        "pitstops.entry"
    );
    assert_eq!(status.delivery.pending, 0);
    let messages: Vec<serde_json::Value> = std::str::from_utf8(&output)
        .expect("UTF8")
        .lines()
        .map(|line| serde_json::from_str(line).expect("JSON"))
        .filter(|line: &serde_json::Value| line["version"] == "vantare.radio.v1")
        .collect();
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[1]["intent"], "pitstops.entry");
}
