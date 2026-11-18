//! Integración de procesos y puente real. Solo se simula la concesión de
//! acceso, igual que en las demás pruebas del puente sin cuenta ni red.
#![allow(clippy::unwrap_used)]

use super::*;
use crate::analysis::catalog::{
    AnalysisLap, AnalysisSessionEndReason, AnalysisSessionKind, AnalysisState,
};
use crate::analysis::status::AnalysisRecordingState;
use std::fs::{self, File, OpenOptions};
use std::os::windows::{fs::OpenOptionsExt, process::CommandExt};
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use vantare_ipc::Subscriber;

const PROCESS_TIMEOUT: Duration = Duration::from_secs(20);
const POLL: Duration = Duration::from_millis(20);
const OFFICIAL_MS: [u32; 2] = [91_000, 89_000];

struct Replay {
    child: Child,
    root: PathBuf,
    log: PathBuf,
}

impl Replay {
    fn wait(&mut self) -> ExitStatus {
        let deadline = Instant::now() + PROCESS_TIMEOUT;
        loop {
            if let Some(status) = self.child.try_wait().unwrap() {
                return status;
            }
            assert!(
                Instant::now() < deadline,
                "Core no terminó: {}",
                self.diagnostics()
            );
            // Child no ofrece espera con plazo. Consultar el handle de nuestro hijo.
            std::thread::sleep(POLL);
        }
    }

    fn diagnostics(&self) -> String {
        let status = fs::read_to_string(self.root.join("recording-status.json"));
        let log = fs::read_to_string(&self.log);
        format!("recording-status: {status:?}\nCore: {log:?}")
    }
}

impl Drop for Replay {
    fn drop(&mut self) {
        if !matches!(self.child.try_wait(), Ok(Some(_))) {
            let _ = self.child.kill(); // Solo el handle que devolvió spawn.
            let _ = self.child.wait();
        }
        // El writer recibe EOF al desaparecer Core. En Windows DuckDB retiene
        // el archivo hasta acabar de cerrar; esperar antes de leer o borrar.
        let deadline = Instant::now() + PROCESS_TIMEOUT;
        while let Err(error) = wait_for_database_release(&self.root) {
            if Instant::now() >= deadline || error.raw_os_error() != Some(32) {
                assert!(
                    std::thread::panicking(),
                    "writer no liberó grabación: {error}"
                );
                eprintln!("writer no liberó grabación: {error}");
                break;
            }
            // ERROR_SHARING_VIOLATION es la condición de espera, no un retardo fijo.
            std::thread::sleep(POLL);
        }
    }
}

fn wait_for_database_release(root: &Path) -> io::Result<()> {
    for entry in fs::read_dir(root)? {
        let path = entry?.path();
        if path.extension().is_some_and(|ext| ext == "duckdb")
            || path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().contains(".creating-"))
        {
            match OpenOptions::new().read(true).share_mode(0).open(path) {
                Ok(_) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => return Err(error),
            }
        }
    }
    Ok(())
}

fn record(fixture: &Fixture, image: &Path, helper: &Path, interrupted: bool) {
    let root = fixture.0.join("hub/recordings");
    fs::create_dir_all(&root).unwrap();
    let corpus = fixture.0.join("two-laps.tar.gz");
    fs::write(
        &corpus,
        include_bytes!("../testdata/analysis/two-laps.tar.gz"),
    )
    .unwrap();
    let pipe = format!(
        "vantare-analysis-{}",
        vantare_services::random_id().unwrap()
    );
    let mut photos = Subscriber::connect(&pipe, |_| true).unwrap();
    let log = fixture.0.join("core.log");
    assert!(
        !Path::new("D:/VantareServer/qa/captura.lock").exists(),
        "hay una captura en curso"
    );
    let mut replay = Replay {
        child: Command::new(image)
            .arg("--replay")
            .arg(&corpus)
            .args(["--velocidad", if interrupted { "0.5" } else { "1" }])
            .args(["--pipe", &pipe])
            .arg("--series-dir")
            .arg(&root)
            .env("VANTARE_SIN_GRAFICOS", "1")
            .env("VANTARE_NATIVE_DATA_ROOT", &fixture.0)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(File::create(&log).unwrap())
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .spawn()
            .expect("arrancar el binario real vantare-core"),
        root,
        log,
    };

    let mut checked_live = interrupted;
    let deadline = Instant::now() + PROCESS_TIMEOUT;
    loop {
        assert!(
            Instant::now() < deadline,
            "no llegó la foto de corte/cierre: {}",
            replay.diagnostics()
        );
        assert!(
            replay.child.try_wait().unwrap().is_none(),
            "Core terminó durante replay: {}",
            replay.diagnostics()
        );
        let Some(photo) = photos.next(Duration::from_millis(100)) else {
            continue;
        };
        let Some(car) = photo.state.player_car() else {
            continue;
        };
        if !checked_live && car.laps.current() == Some(&1) {
            checked_live = true;
            verify_live_writer(fixture, helper.to_owned());
        }
        if interrupted {
            // Una vuelta cerrada y varias fotos de la segunda. El Core publica
            // estas fotos después de entregar las series y los eventos al writer.
            if car.laps.current() == Some(&1)
                && car
                    .lap_elapsed_s
                    .current()
                    .is_some_and(|elapsed| *elapsed >= 45.0)
            {
                replay.child.kill().expect("terminar solo el Core propio");
                assert!(!replay.wait().success());
                break;
            }
            assert!(car.laps.current() != Some(&2), "se pasó la foto de corte");
        } else if car.laps.current() == Some(&2) {
            // Replay sigue sirviendo fotos al final del archivo. EOF de stdin es
            // el cierre ordenado de producto solicitado por el launcher.
            drop(replay.child.stdin.take());
            assert!(replay.wait().success(), "{}", replay.diagnostics());
            break;
        }
    }
    println!(
        "Core grabó {} en DuckDB ({})",
        if interrupted {
            "una vuelta completa"
        } else {
            "dos vueltas completas y el inicio de la tercera"
        },
        if interrupted {
            "corte por PID"
        } else {
            "cierre por EOF"
        },
    );
}

fn exchange(session: &mut Session, request: &Request) -> HostToUi {
    let mut pipe = Pipe::new(Vec::new());
    session.request(&mut pipe, 1, request).unwrap();
    if pipe.get_ref().is_empty() {
        session.analysis_state.wait_for_test();
        analysis_tick::tick(session, &mut pipe).unwrap();
    }
    pipe.set_position(0);
    frame::Reader::default().next(&mut pipe).unwrap().unwrap()
}

fn request(session: &mut Session, request: &Request) -> Reply {
    match exchange(session, request) {
        HostToUi::Response { id: 1, result } => result,
        other => panic!("{request:?}: {other:?}"),
    }
}

fn session_for(fixture: &Fixture, helper: PathBuf) -> Session {
    let mut session = fixture.session();
    session.current.access.verified = true;
    session.current.access.analysis = true;
    session.current.rights = crate::protocol::LinkState::Connected;
    session.analysis_state.helper_for_test(helper);
    session
}

/// Con el writer del propio Core aún vivo, la grabación sigue bloqueada y
/// marcada «Grabando ahora»; no se relaja el caso real.
fn verify_live_writer(fixture: &Fixture, helper: PathBuf) {
    let mut session = session_for(fixture, helper);
    let Reply::AnalysisCatalog { recordings, .. } =
        request(&mut session, &Request::AnalysisCatalog {})
    else {
        panic!("faltó el catálogo en vivo");
    };
    let [row] = recordings.as_slice() else {
        panic!("se esperaba la grabación en curso, recibido {recordings:?}");
    };
    assert!(row.recording, "{row:?}");
    for command in [
        Request::AnalysisInspect { id: row.id.clone() },
        Request::AnalysisOpen { id: row.id.clone() },
    ] {
        assert_eq!(
            exchange(&mut session, &command),
            HostToUi::Failure {
                id: 1,
                error: HostError::AnalysisLocked
            },
            "{command:?}"
        );
    }
    let Reply::AnalysisStatus {
        status: Some(status),
    } = request(&mut session, &Request::AnalysisStatus {})
    else {
        panic!("faltó recording-status.json en vivo");
    };
    assert_eq!(status.state, AnalysisRecordingState::Recording);
    println!("Host mantuvo bloqueada la grabación con el writer vivo (Grabando ahora)");
}

/// Tras el corte el JSON del Core sigue en «recording», pero ningún writer
/// retiene el archivo: el host lo muestra como parada, sin causa inventada.
fn verify_cut_status(session: &mut Session, id: &str) {
    let Reply::AnalysisStatus {
        status: Some(status),
    } = request(session, &Request::AnalysisStatus {})
    else {
        panic!("faltó el último recording-status.json del Core");
    };
    assert_eq!(status.state, AnalysisRecordingState::Stopped);
    assert_eq!(status.cause, None);
    assert_eq!(status.row_id.as_deref(), Some(id));
    println!("Host mostró el corte como parada (stopped, sin causa)");
}

fn verify_comparison(session: &mut Session, token: &str, laps: &[AnalysisLap]) {
    let index = |number| laps.iter().find(|lap| lap.lap == number).unwrap().index;
    let Reply::AnalysisCompare {
        speed,
        throttle,
        brake,
        delta,
        delta_unavailable,
        gaps,
        ..
    } = request(
        session,
        &Request::AnalysisCompare {
            session: token.to_owned(),
            a: index(0),
            b: index(1),
        },
    )
    else {
        panic!("faltó compare");
    };
    for (series, first_a, first_b) in [
        (speed, 180.0, 144.0),
        (throttle, 75.0, 50.0),
        (brake, 25.0, 50.0),
    ] {
        assert_eq!((series.a.len(), series.b.len()), (12, 12));
        assert_eq!(series.a[0].value.as_f64(), Some(first_a));
        assert_eq!(series.b[0].value.as_f64(), Some(first_b));
    }
    assert!(gaps.a.is_empty() && gaps.b.is_empty());
    assert_eq!(delta_unavailable, None);
    let delta = delta.expect("ambas vueltas comparten rango y reloj");
    assert_eq!(delta.len(), 12);
    assert_eq!(delta.last().unwrap().value.as_f64(), Some(2.0));
}

#[allow(clippy::too_many_lines)] // un solo recorrido legible de catalog → inspect → open → status
fn verify(fixture: &Fixture, helper: PathBuf, interrupted: bool) {
    let mut session = session_for(fixture, helper);

    let Reply::AnalysisCatalog { recordings, .. } =
        request(&mut session, &Request::AnalysisCatalog {})
    else {
        panic!("faltó el catálogo");
    };
    let [row] = recordings.as_slice() else {
        panic!("se esperaba una grabación, recibido {recordings:?}");
    };
    let id = row.id.clone();
    assert!(row.size_bytes > 0);
    assert!(
        !row.recording,
        "sin writer no se marca como grabando: {row:?}"
    );
    if interrupted {
        verify_cut_status(&mut session, &id);
    }
    let Reply::AnalysisInspect {
        state,
        laps: lap_count,
        sessions,
        best_lap_approx_ms,
    } = request(&mut session, &Request::AnalysisInspect { id: id.clone() })
    else {
        panic!("faltó inspect");
    };
    let [summary] = sessions.as_slice() else {
        panic!("se esperaba una sesión, recibido {state:?}, {sessions:?}");
    };
    assert_eq!(summary.kind, AnalysisSessionKind::Practice);
    assert_eq!(summary.track_name.as_deref(), Some("Circuito QA"));
    assert_eq!(summary.vehicle.as_deref(), Some("Coche QA"));
    assert_eq!(summary.index, 0);
    assert_eq!(summary.sealed, !interrupted);
    let completed = if interrupted {
        assert_eq!(state, AnalysisState::Unconfirmed);
        assert_eq!(lap_count, 1);
        assert_eq!(summary.end_reason, None);
        assert_eq!(summary.ended_at_ms, None);
        assert_eq!(best_lap_approx_ms, Some(90_990));
        1
    } else {
        assert_eq!(state, AnalysisState::Complete);
        assert_eq!(lap_count, 3);
        assert_eq!(
            summary.end_reason,
            Some(AnalysisSessionEndReason::CoreStopped)
        );
        assert!(summary.ended_at_ms.unwrap() >= summary.started_at_ms);
        assert_eq!(summary.laps_completed, Some(2));
        assert_eq!(summary.best_lap_ms, Some(89_000));
        assert_eq!(best_lap_approx_ms, Some(88_990));
        2
    };
    let Reply::AnalysisOpen {
        session: token,
        laps,
        sessions: opened,
        finished,
        watermark,
        attempted,
        total,
    } = request(&mut session, &Request::AnalysisOpen { id: id.clone() })
    else {
        panic!("faltó open");
    };
    assert_eq!(opened, sessions);
    assert_eq!(laps.len(), usize::try_from(lap_count).unwrap());
    assert_eq!(total, lap_count.to_string());
    assert_eq!(finished, !interrupted);
    for (number, official_ms) in OFFICIAL_MS.into_iter().take(completed).enumerate() {
        let lap = laps
            .iter()
            .find(|lap| usize::try_from(lap.lap).unwrap() == number)
            .unwrap();
        assert_eq!(lap.session, Some(summary.index));
        assert_eq!(lap.lap_time_ms, Some(official_ms));
        assert_eq!(lap.lap_time_approx_ms, Some(official_ms - 10));
        assert!(lap.sealed && !lap.gap, "{lap:?}");
        assert_eq!(lap.samples, 12);
    }

    if !interrupted {
        let partial = laps.iter().find(|lap| lap.lap == 2).unwrap();
        assert!(!partial.sealed && !partial.gap);
        assert_eq!(partial.session, Some(summary.index));
        assert_eq!(partial.lap_time_ms, None);
        assert_eq!(partial.lap_time_approx_ms, None);
        verify_comparison(&mut session, &token, &laps);

        let Reply::AnalysisStatus {
            status: Some(status),
        } = request(&mut session, &Request::AnalysisStatus {})
        else {
            panic!("faltó recording-status.json del Core");
        };
        assert_eq!(status.state, AnalysisRecordingState::Stopped);
        assert_eq!(status.cause, None);
        assert_eq!(status.row_id.as_deref(), Some(id.as_str()));
        assert_eq!(
            status.durable_watermark.as_deref(),
            Some(watermark.as_str())
        );
        assert_eq!(status.attempted.as_deref(), Some(attempted.as_str()));
        assert_eq!(watermark, attempted);
    }
    assert_eq!(
        request(&mut session, &Request::AnalysisClose { session: token }),
        Reply::AnalysisClose {}
    );
    println!(
        "Host leyó {state:?}, sesión sellada={}, {completed} vueltas con tiempo oficial (ms) {:?} — OK",
        summary.sealed,
        &OFFICIAL_MS[..completed],
    );
}

fn check_recording(interrupted: bool) {
    let exe = std::env::current_exe().unwrap();
    let binaries = exe.parent().unwrap().parent().unwrap();
    let core = binaries.join("vantare-core.exe");
    let helper = binaries.join("vantare-storage.exe");
    assert!(
        core.is_file() && helper.is_file(),
        "ejecuta native/scripts/e2e-analisis.ps1"
    );
    let fixture = Fixture::new();
    record(&fixture, &core, &helper, interrupted);
    verify(&fixture, helper, interrupted);
}

#[test]
fn e2e_analisis_clean() {
    check_recording(false);
}

#[test]
fn e2e_analisis_interrupted() {
    check_recording(true);
}
