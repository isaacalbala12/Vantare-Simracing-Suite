//! El final del pump contra un storage en memoria que muere donde diga el
//! guion (#2884, caso B). Sin proceso ni reloj.
use super::*;
use std::io::Cursor;

/// Guion de un storage falso.
#[derive(Clone, Copy)]
pub(crate) struct FakeStorage {
    /// Sus respuestas, una por línea; al agotarse, fin de salida.
    pub answers: &'static str,
    /// Orden al recibir la cual ya no se le puede escribir más.
    pub dies_on: Option<&'static str>,
    pub exits_with_error: bool,
}

/// Causa que da la tubería rota del falso.
const BROKEN: &str = "tubería rota por el storage falso";

/// Un bloque pendiente confirmado hasta 2 y `finished` en 3: valores distintos
/// para ver de dónde sale cada número.
const FINISHED: &str = concat!(r#"["ack",2]"#, "\n", r#"["finished",3,true,4]"#, "\n");

struct Input {
    dies_on: Option<&'static str>,
    dead: bool,
    received: Vec<u8>,
}

impl Write for Input {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.dead |= self
            .dies_on
            .is_some_and(|name| bytes.starts_with(format!("[\"{name}\"").as_bytes()));
        if self.dead {
            return Err(io::Error::new(io::ErrorKind::BrokenPipe, BROKEN));
        }
        self.received.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

struct Pumped {
    outcome: io::Result<SeriesStorageState>,
    /// Órdenes que storage llegó a recibir.
    received: String,
    log: String,
    analysis: Arc<RecordedSeriesSummary>,
}

/// El productor deja un bloque pendiente (índice 2) y pide cerrar.
fn pump_against(storage: FakeStorage) -> Pumped {
    let mut pipe = Pipe {
        input: Input {
            dies_on: storage.dies_on,
            dead: false,
            received: Vec::new(),
        },
        output: Cursor::new(storage.answers.as_bytes()),
        progress: Arc::default(),
    };
    let (chunks, receiver) = mpsc::channel();
    chunks.send(pending_chunk()).expect("bloque pendiente");
    let (finish, control) = mpsc::channel();
    finish.send(Some(3)).expect("pedir cierre");
    let (_events, event_receiver) = mpsc::sync_channel(1);
    let mut sessions = SessionPump {
        receiver: event_receiver,
        delivery: Arc::default(),
        rejected_warned: false,
        loss_warned: false,
    };
    let latest = ArcSwap::from_pointee(RecordedSeriesSummary::default());
    let ready = SeriesStorageState {
        watermark: 0,
        finished: false,
        attempted: 0,
    };
    let mut log = Vec::new();
    let outcome = pump(
        &mut pipe,
        &receiver,
        &control,
        &latest,
        ready,
        &mut sessions,
        &mut log,
    );
    Pumped {
        outcome,
        received: String::from_utf8(pipe.input.received).expect("órdenes UTF-8"),
        log: String::from_utf8(log).expect("registro UTF-8"),
        analysis: latest.load_full(),
    }
}

fn pending_chunk() -> SeriesChunk {
    SeriesChunk::from_bytes(
        concat!(
            r#"["vantare.series-chunk.v1",2,1,0,"#,
            r#"["vantare.player-lap.v1",7,0,7,0,null,false,"#,
            r#"[[1,[1,0.0],[1,0.0],[1,50.0],[1,0.75],[1,0.0]]]]]"#
        )
        .as_bytes(),
    )
    .expect("bloque de prueba")
}

/// Ya ha contestado y salido cuando se le mira.
struct Exited {
    outcome: Option<io::Result<SeriesStorageState>>,
    with_error: bool,
}

impl series_close::CloseProbe for Exited {
    fn progress(&self) -> u64 {
        0
    }

    fn confirmation(&mut self, _: Duration) -> Option<io::Result<SeriesStorageState>> {
        self.outcome.take()
    }

    fn exit(&mut self, _: Duration) -> Option<io::Result<()>> {
        Some(if self.with_error {
            Err(io::Error::other("storage terminó con error"))
        } else {
            Ok(())
        })
    }
}

/// El pump real y la espera de cierre real contra el storage falso.
pub(crate) fn close_against(
    storage: FakeStorage,
    publish: &mut dyn FnMut(&SeriesStorageState),
) -> SeriesClose {
    let pumped = pump_against(storage);
    let start = Instant::now();
    let closed = series_close::run(
        &mut Exited {
            outcome: Some(pumped.outcome),
            with_error: storage.exits_with_error,
        },
        // Instante fijo: el falso contesta a la primera.
        &mut || start,
        CloseLimits::PRODUCT,
        publish,
    );
    SeriesClose {
        closed,
        analysis: pumped.analysis,
    }
}

fn storage(answers: &'static str, dies_on: Option<&'static str>) -> FakeStorage {
    FakeStorage {
        answers,
        dies_on,
        exits_with_error: false,
    }
}

#[test]
fn a_stop_that_cannot_be_sent_after_finished_is_only_logged() {
    let pumped = pump_against(storage(FINISHED, Some("stop")));
    assert_eq!(
        pumped.outcome.expect("grabación terminada"),
        SeriesStorageState {
            watermark: 3,
            finished: true,
            attempted: 4,
        }
    );
    assert!(pumped.received.ends_with("[\"finish\",3]\n"));
    // Una sola línea, con la causa.
    assert_eq!(pumped.log.lines().count(), 1, "{}", pumped.log);
    assert!(pumped.log.contains(BROKEN), "{}", pumped.log);
}

#[test]
fn a_healthy_storage_still_receives_stop_and_nothing_is_logged() {
    let pumped = pump_against(storage(FINISHED, None));
    assert_eq!(pumped.outcome.expect("cierre sano").watermark, 3);
    assert!(
        pumped.received.ends_with("[\"finish\",3]\n[\"stop\"]\n"),
        "{}",
        pumped.received
    );
    assert!(pumped.log.is_empty(), "{}", pumped.log);
}

#[test]
fn storage_gone_before_answering_finished_is_still_an_error() {
    let only_ack = concat!(r#"["ack",2]"#, "\n");
    // No llega a recibir `finish`, o lo recibe y sale sin contestar.
    for dies_on in [Some("finish"), Some("stop"), None] {
        let pumped = pump_against(storage(only_ack, dies_on));
        let error = pumped.outcome.expect_err("sin finished");
        assert_eq!(error.kind(), io::ErrorKind::BrokenPipe, "{dies_on:?}");
        assert!(pumped.log.is_empty(), "{}", pumped.log);
        assert_eq!(pumped.analysis.watermark, 2);
    }
}

#[test]
fn an_unreadable_finished_never_becomes_complete() {
    // Cortada, otro nombre, sin forma de estado, cifras o coherencia mal.
    for answers in [
        concat!(r#"["ack",2]"#, "\n", r#"["finished",3,true,4]"#),
        concat!(r#"["ack",2]"#, "\n", r#"["status",3,true,4]"#, "\n"),
        concat!(r#"["ack",2]"#, "\n", r#"["finished",3,true]"#, "\n"),
        concat!(r#"["ack",2]"#, "\n", r#"["finished","3",true,4]"#, "\n"),
        concat!(r#"["ack",2]"#, "\n", r#"["finished",3,true,2]"#, "\n"),
        concat!(r#"["ack",2]"#, "\n", "basura\n"),
    ] {
        let pumped = pump_against(storage(answers, Some("stop")));
        let error = pumped.outcome.expect_err(answers);
        assert_eq!(error.kind(), io::ErrorKind::InvalidData, "{answers}");
        assert!(pumped.log.is_empty(), "{answers}: {}", pumped.log);
    }
}

#[test]
fn a_finished_answer_that_says_not_finished_keeps_the_stop_error() {
    let answers = concat!(r#"["ack",2]"#, "\n", r#"["finished",3,false,3]"#, "\n");
    let pumped = pump_against(storage(answers, Some("stop")));
    let error = pumped.outcome.expect_err("finished=false no confirma nada");
    assert_eq!(error.kind(), io::ErrorKind::BrokenPipe);
    assert!(pumped.log.is_empty(), "{}", pumped.log);
}
