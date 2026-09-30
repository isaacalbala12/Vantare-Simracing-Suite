//! Banco sintético explícito: reglas y medios locales, nunca reproduce audio.
#![allow(clippy::unwrap_used)]
use std::fs;
use std::io;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use vantare_domain::{Car, CarId, Flag, FlagKind, FlagScope, Player, Quality, Snapshot};
use vantare_engineer::{
    Applied,
    radio::{Families, Intent, Locale, MAX_PENDING, Message, Queue},
    spotter::{Side, classify_position},
    voice::{Voice, pcm_duration, resolve_clip},
    worker::RadioWorker,
};
use vantare_runtime::flows::{Cursor, GapReason, PitEvent};

fn photo() -> Snapshot {
    let mut snapshot = Snapshot {
        epoch: 1,
        sequence: 10,
        ..Snapshot::default()
    };
    snapshot.state.player = Some(Player {
        car: CarId(7),
        ..Player::default()
    });
    snapshot.state.cars.push(Car {
        id: CarId(7),
        in_pits: Quality::Reliable(false),
        ..Car::default()
    });
    snapshot
}
fn message(intent: Intent, snapshot: &Snapshot) -> Message {
    Message::new(intent, Locale::Es, snapshot, Duration::ZERO).unwrap()
}
fn lines(bytes: &[u8]) -> Vec<serde_json::Value> {
    std::str::from_utf8(bytes)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}
fn intents(messages: &[Message]) -> Vec<Intent> {
    messages.iter().map(|message| message.intent).collect()
}

#[test]
fn locales_have_closed_catalog_and_independent_visible_metadata() {
    let snapshot = photo();
    for (code, locale, text) in [
        ("es", Locale::Es, "Queda un litro"),
        ("en", Locale::En, "One litre remaining"),
        ("it", Locale::It, "Rimane un litro"),
        ("pt-BR", Locale::PtBr, "Resta um litro"),
    ] {
        assert_eq!(Locale::parse(code), Some(locale));
        let message = Message::new(Intent::FuelOne, locale, &snapshot, Duration::MAX).unwrap();
        let json = message.to_json();
        assert_eq!(json["locale"], code);
        assert_eq!(json["text"], text);
        assert_eq!(json["sequence"], 10);
        assert_eq!(json["expires_at_ms"], u64::MAX);
        for intent in [
            Intent::PitEntry,
            Intent::PitExit,
            Intent::FuelTwo,
            Intent::FuelHalf,
            Intent::Yellow,
            Intent::Blue,
            Intent::CarLeft,
            Intent::CarRight,
            Intent::ThreeWide,
        ] {
            assert!(!intent.text(locale).is_empty());
        }
    }
    assert!(Locale::parse("pt").is_none());
    assert!(
        Message::new(
            Intent::Blue,
            Locale::Es,
            &Snapshot::default(),
            Duration::ZERO
        )
        .is_none()
    );
}

#[test]
fn fuel_uses_only_reliable_current_levels_and_rearms_after_condition_ends() {
    let mut snapshot = photo();
    let mut families = Families::default();
    for (level, capacity, expected) in [
        (
            Quality::Reliable(1.0),
            Quality::Unavailable,
            Some(Intent::FuelOne),
        ),
        (
            Quality::Reliable(2.0),
            Quality::Unavailable,
            Some(Intent::FuelTwo),
        ),
        (
            Quality::Reliable(20.0),
            Quality::Reliable(40.0),
            Some(Intent::FuelHalf),
        ),
        (Quality::Reliable(20.0), Quality::Estimated(40.0), None),
        (Quality::Reliable(0.0), Quality::Reliable(40.0), None),
        (Quality::Reliable(-1.0), Quality::Reliable(40.0), None),
        (Quality::Reliable(f64::NAN), Quality::Reliable(40.0), None),
        (
            Quality::Reliable(f64::INFINITY),
            Quality::Reliable(40.0),
            None,
        ),
        (Quality::Estimated(1.0), Quality::Reliable(40.0), None),
        (Quality::Unavailable, Quality::Reliable(40.0), None),
    ] {
        families.reset();
        let fuel = &mut snapshot.state.player.as_mut().unwrap().fuel;
        fuel.level_l = level;
        fuel.capacity_l = capacity;
        fuel.laps_left = Quality::Reliable(0.1); // No inventar aviso por autonomía.
        let (messages, _) =
            families.evaluate(&snapshot, &Applied::default(), Locale::En, Duration::ZERO);
        assert_eq!(intents(&messages), expected.into_iter().collect::<Vec<_>>());
        for message in &messages {
            families.started(message);
        }
        assert!(
            families
                .evaluate(&snapshot, &Applied::default(), Locale::En, Duration::ZERO)
                .0
                .is_empty()
        );
    }
    snapshot.state.player.as_mut().unwrap().fuel.level_l = Quality::Reliable(1.0);
    let first = families
        .evaluate(&snapshot, &Applied::default(), Locale::Es, Duration::ZERO)
        .0;
    families.started(&first[0]);
    snapshot.state.player.as_mut().unwrap().fuel.level_l = Quality::Reliable(30.0);
    assert!(
        families
            .evaluate(&snapshot, &Applied::default(), Locale::Es, Duration::ZERO)
            .0
            .is_empty()
    );
    snapshot.state.player.as_mut().unwrap().fuel.level_l = Quality::Reliable(1.0);
    assert_eq!(
        intents(
            &families
                .evaluate(&snapshot, &Applied::default(), Locale::Es, Duration::ZERO)
                .0
        ),
        [Intent::FuelOne]
    );
}

#[test]
fn flags_respect_quality_scope_and_ack_without_announcing_sector_ahead() {
    let mut snapshot = photo();
    snapshot.state.flags = Quality::Reliable(vec![
        Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        },
        Flag {
            kind: FlagKind::Blue,
            scope: FlagScope::Car(CarId(7)),
        },
        Flag {
            kind: FlagKind::Blue,
            scope: FlagScope::Car(CarId(8)),
        },
    ]);
    let mut families = Families::default();
    let messages = families
        .evaluate(&snapshot, &Applied::default(), Locale::Es, Duration::ZERO)
        .0;
    assert_eq!(intents(&messages), [Intent::Yellow, Intent::Blue]);
    for message in &messages {
        families.started(message);
    }
    assert!(
        families
            .evaluate(&snapshot, &Applied::default(), Locale::Es, Duration::ZERO)
            .0
            .is_empty()
    );
    for flags in [
        Quality::Estimated(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        }]),
        Quality::Reliable(vec![Flag {
            kind: FlagKind::Blue,
            scope: FlagScope::Car(CarId(8)),
        }]),
        Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Sector(1),
        }]),
        Quality::Unavailable,
    ] {
        snapshot.state.flags = flags;
        assert!(
            families
                .evaluate(&snapshot, &Applied::default(), Locale::Es, Duration::ZERO)
                .0
                .is_empty()
        );
        assert!(!messages[0].is_current(&snapshot));
    }
    snapshot.state.flags = Quality::Reliable(vec![Flag {
        kind: FlagKind::Yellow,
        scope: FlagScope::Session,
    }]);
    assert_eq!(
        intents(
            &families
                .evaluate(&snapshot, &Applied::default(), Locale::Es, Duration::ZERO)
                .0
        ),
        [Intent::Yellow]
    );
}

#[test]
fn boxes_never_come_from_photo_gap_historical_event_or_other_subject() {
    let mut snapshot = photo();
    snapshot.state.cars[0].in_pits = Quality::Reliable(true);
    let mut families = Families::default();
    for applied in [
        Applied::default(),
        Applied {
            baseline: true,
            gap: Some(GapReason::Retention),
            event: None,
        },
    ] {
        assert!(
            families
                .evaluate(&snapshot, &applied, Locale::Es, Duration::ZERO)
                .0
                .is_empty()
        );
    }
    let event = PitEvent {
        cursor: Cursor { epoch: 1, index: 1 },
        sequence: 10,
        session: snapshot.state.session.id,
        car: CarId(7),
        was_in_pits: false,
        in_pits: true,
    };
    let applied = Applied {
        event: Some(event),
        ..Applied::default()
    };
    assert_eq!(
        intents(
            &families
                .evaluate(&snapshot, &applied, Locale::Es, Duration::ZERO)
                .0
        ),
        [Intent::PitEntry]
    );
    for event in [
        PitEvent {
            sequence: 9,
            ..event
        },
        PitEvent {
            car: CarId(8),
            ..event
        },
        PitEvent {
            cursor: Cursor { epoch: 0, index: 1 },
            ..event
        },
    ] {
        let applied = Applied {
            event: Some(event),
            ..Applied::default()
        };
        assert!(
            families
                .evaluate(&snapshot, &applied, Locale::Es, Duration::ZERO)
                .0
                .is_empty()
        );
    }
    snapshot.state.cars[0].in_pits = Quality::Estimated(true);
    assert!(
        families
            .evaluate(&snapshot, &applied, Locale::Es, Duration::ZERO)
            .0
            .is_empty()
    );
}

#[test]
fn queue_coalesces_fifo_expires_and_only_safety_preempts() {
    let mut snapshot = photo();
    let mut queue = Queue::default();
    assert!(queue.submit(message(Intent::PitEntry, &snapshot)));
    snapshot.sequence += 1;
    assert!(queue.submit(message(Intent::PitEntry, &snapshot)));
    assert_eq!(queue.pending_len(), 1);
    let (selected, preempted) = queue.select(Duration::ZERO).unwrap();
    assert_eq!(selected.sequence, 11);
    assert!(!preempted);
    queue.submit(message(Intent::Yellow, &snapshot));
    assert!(queue.select(Duration::ZERO).is_none()); // Flags no interrumpe audio.
    queue.submit(message(Intent::CarLeft, &snapshot));
    let (selected, preempted) = queue.select(Duration::ZERO).unwrap();
    assert_eq!(selected.intent, Intent::CarLeft);
    assert!(preempted);
    queue.submit(message(Intent::CarRight, &snapshot));
    assert!(queue.select(Duration::ZERO).is_none()); // Safety no se pisa a sí misma.
    queue.finish();
    assert_eq!(
        queue.select(Duration::ZERO).unwrap().0.intent,
        Intent::CarRight
    );
    queue.finish();
    assert_eq!(
        queue.select(Duration::ZERO).unwrap().0.intent,
        Intent::Yellow
    );
    queue.clear();
    queue.submit(message(Intent::PitExit, &snapshot));
    queue.submit(message(Intent::PitEntry, &snapshot));
    assert_eq!(
        queue.select(Duration::ZERO).unwrap().0.intent,
        Intent::PitExit
    );
    queue.finish();
    assert!(queue.select(Duration::from_secs(10)).is_none());
}

#[test]
fn queue_bounds_slow_consumer_and_withdraws_when_evidence_disappears() {
    let mut snapshot = photo();
    let mut queue = Queue::default();
    for car in 0..MAX_PENDING {
        let mut message = message(Intent::PitEntry, &snapshot);
        message.car = CarId(u32::try_from(car).unwrap());
        assert!(queue.submit(message));
    }
    assert_eq!(queue.pending_len(), MAX_PENDING);
    assert!(!queue.submit(message(Intent::PitExit, &snapshot)));
    assert!(queue.submit(message(Intent::CarLeft, &snapshot)));
    assert_eq!(queue.pending_len(), MAX_PENDING);
    queue.clear();
    snapshot.state.player.as_mut().unwrap().fuel.level_l = Quality::Reliable(1.0);
    queue.submit(message(Intent::FuelOne, &snapshot));
    queue.select(Duration::ZERO).unwrap();
    queue.submit(message(Intent::Yellow, &snapshot));
    snapshot.state.player.as_mut().unwrap().fuel.level_l = Quality::Unavailable;
    assert!(queue.refresh(&snapshot));
    assert_eq!(queue.pending_len(), 0);
    assert!(queue.select(Duration::ZERO).is_none());
}

#[test]
fn geometric_golden_boundaries_preserve_go_thresholds_without_enabling_spotter() {
    for (ahead, right, existing, side) in [
        (0.0, -2.0, false, Some(Side::Left)),
        (0.0, 2.0, false, Some(Side::Right)),
        (0.0, 1.8, false, None),
        (0.0, 20.0, false, Some(Side::Right)),
        (0.0, 20.001, false, None),
        (4.899, 2.0, false, Some(Side::Right)),
        (4.9, 2.0, false, None),
        (-4.499, -2.0, false, Some(Side::Left)),
        (-4.5, -2.0, false, None),
        (4.999, 2.0, true, Some(Side::Right)),
        (-5.0, -2.0, true, None),
        (f64::NAN, 2.0, false, None),
        (0.0, f64::INFINITY, false, None),
    ] {
        assert_eq!(classify_position(ahead, right, existing), side);
    }
    assert!(!message(Intent::CarLeft, &photo()).is_current(&photo()));
}

#[test]
fn radio_deduplicates_and_clears_at_freeze_gap_quality_and_identity() {
    let mut snapshot = photo();
    snapshot.state.player.as_mut().unwrap().fuel.level_l = Quality::Reliable(1.0);
    let mut worker = RadioWorker::new(Locale::It, None).unwrap();
    let mut output = Vec::new();
    worker
        .ingest(&snapshot, &Applied::default(), Duration::ZERO, &mut output)
        .unwrap();
    let initial = lines(&output);
    assert_eq!(initial.len(), 2); // Clear inicial y un único aviso.
    assert_eq!(initial[1]["intent"], "fuel.low_1l");
    assert_eq!(initial[1]["locale"], "it");
    assert_eq!(initial[1]["voice"], "disabled");
    output.clear();
    worker
        .ingest(
            &snapshot,
            &Applied::default(),
            Duration::from_millis(499),
            &mut output,
        )
        .unwrap();
    assert!(output.is_empty());
    worker
        .ingest(
            &snapshot,
            &Applied::default(),
            Duration::from_millis(500),
            &mut output,
        )
        .unwrap();
    assert_eq!(
        lines(&output),
        [serde_json::json!({"version":"vantare.radio.status.v1","clear":true})]
    );
    output.clear();
    worker.tick(Duration::from_secs(1), &mut output).unwrap();
    assert!(output.is_empty(), "una foto congelada no reanima la radio");
    snapshot.sequence += 1;
    worker
        .ingest(
            &snapshot,
            &Applied::default(),
            Duration::from_secs(1),
            &mut output,
        )
        .unwrap();
    assert_eq!(
        lines(&output).len(),
        2,
        "una revisión nueva reconstruye la familia"
    );
    output.clear();
    snapshot.sequence += 1;
    snapshot.state.player.as_mut().unwrap().fuel.level_l = Quality::Unavailable;
    worker
        .ingest(
            &snapshot,
            &Applied::default(),
            Duration::from_millis(1100),
            &mut output,
        )
        .unwrap();
    assert_eq!(lines(&output).len(), 1);
    assert_eq!(lines(&output)[0]["clear"], true);
    output.clear();
    snapshot.sequence += 1;
    let gap = Applied {
        gap: Some(GapReason::RecordingDisabled),
        baseline: true,
        event: None,
    };
    worker
        .ingest(&snapshot, &gap, Duration::from_millis(1200), &mut output)
        .unwrap();
    assert_eq!(lines(&output).len(), 1);
    output.clear();
    snapshot.epoch += 1;
    snapshot.state.player = None;
    worker
        .ingest(
            &snapshot,
            &Applied::default(),
            Duration::from_millis(1300),
            &mut output,
        )
        .unwrap();
    assert_eq!(lines(&output).len(), 1);
}

#[test]
fn visual_ttl_expires_even_with_fresh_photos_without_repeating_condition() {
    let mut snapshot = photo();
    snapshot.state.flags = Quality::Reliable(vec![Flag {
        kind: FlagKind::Blue,
        scope: FlagScope::Session,
    }]);
    let mut worker = RadioWorker::new(Locale::PtBr, None).unwrap();
    let mut output = Vec::new();
    worker
        .ingest(&snapshot, &Applied::default(), Duration::ZERO, &mut output)
        .unwrap();
    output.clear();
    for step in 1..=50 {
        snapshot.sequence += 1;
        worker
            .ingest(
                &snapshot,
                &Applied::default(),
                Duration::from_millis(step * 200),
                &mut output,
            )
            .unwrap();
    }
    assert_eq!(lines(&output).len(), 1);
    assert_eq!(lines(&output)[0]["clear"], true);
}

struct Assets(PathBuf);
impl Assets {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "vantare-radio-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        fs::create_dir(path.join("es")).unwrap();
        Self(path)
    }
}
impl Drop for Assets {
    fn drop(&mut self) {
        assert!(self.0.is_absolute() && self.0.parent() == Some(std::env::temp_dir().as_path()));
        assert!(
            self.0
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("vantare-radio-")
        );
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn wav(seconds: u32) -> Vec<u8> {
    let size = 32_000 * seconds;
    let mut bytes = Vec::new();
    bytes.extend(b"RIFF");
    bytes.extend((size + 36).to_le_bytes());
    bytes.extend(b"WAVEfmt ");
    bytes.extend(16_u32.to_le_bytes());
    bytes.extend(1_u16.to_le_bytes()); // PCM.
    bytes.extend(1_u16.to_le_bytes()); // Mono.
    bytes.extend(16_000_u32.to_le_bytes());
    bytes.extend(32_000_u32.to_le_bytes());
    bytes.extend(2_u16.to_le_bytes());
    bytes.extend(16_u16.to_le_bytes());
    bytes.extend(b"data");
    bytes.extend(size.to_le_bytes());
    bytes.resize(usize::try_from(size).unwrap() + 44, 0);
    bytes
}

#[test]
fn local_clips_fail_visibly_without_fallback_and_validate_media_without_playing() {
    let files = Assets::new();
    let clip = files.0.join("es/fuel.low_1l.wav");
    fs::write(&clip, wav(1)).unwrap();
    let (resolved, duration) = resolve_clip(&files.0, Locale::Es, Intent::FuelOne).unwrap();
    assert_eq!(resolved, clip.canonicalize().unwrap());
    assert_eq!(duration, Duration::from_secs(1));
    // Nunca Voice::play de un clip válido: no efecto acústico durante tests.
    assert_eq!(pcm_duration(&wav(8)).unwrap(), Duration::from_secs(8));
    assert!(pcm_duration(&wav(9)).is_err());
    for at in [0, 4, 8, 16, 20, 22, 24, 28, 32, 34, 36, 40] {
        let mut bytes = wav(1);
        bytes[at] ^= 0xff;
        assert!(pcm_duration(&bytes).is_err(), "offset {at}");
    }
    for len in 0..44 {
        assert!(pcm_duration(&wav(1)[..len]).is_err());
    }
    fs::write(&clip, b"ID3 mp3 no soportado").unwrap();
    assert_eq!(
        resolve_clip(&files.0, Locale::Es, Intent::FuelOne)
            .unwrap_err()
            .kind(),
        io::ErrorKind::InvalidData
    );
    assert!(Voice::new(Some(&clip)).is_err());
    assert!(
        Voice::new(None)
            .unwrap()
            .play(Locale::Es, Intent::FuelOne, Duration::ZERO)
            .unwrap()
            .is_none()
    );
    fs::remove_file(&clip).unwrap();
    let mut snapshot = photo();
    snapshot.state.player.as_mut().unwrap().fuel.level_l = Quality::Reliable(1.0);
    let mut worker = RadioWorker::new(Locale::Es, Some(&files.0)).unwrap();
    let mut output = Vec::new();
    worker
        .ingest(&snapshot, &Applied::default(), Duration::ZERO, &mut output)
        .unwrap();
    let presented = lines(&output);
    assert_eq!(presented[1]["voice"], "missing");
    assert_eq!(presented[1]["text"], "Queda un litro");
    assert!(
        presented[1]
            .to_string()
            .find(&files.0.to_string_lossy().to_string())
            .is_none()
    );
}
