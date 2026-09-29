//! Topología A de la campaña de medición de la fase 0: el núcleo y los overlays
//! GPUI en el mismo proceso. La foto va del `Reader` del núcleo (`ArcSwap`) a
//! la ventana, sin pipe ni serde. Se retira tras decidir entre A y B.
//!
//! `vantare-inproc (--replay <fixture.bin|corpus.tar.gz> [--build <versión>] [--velocidad 1.0] | --live) [1|4|22]`
//!
//! Mismas opciones que `vantare-core` (fuente) y `vantare-overlays` (número de
//! widgets), una ventana por monitor. Para que la comparación con B sea justa
//! el bucle del núcleo es el mismo (`service::drive`), la fuente y los widgets
//! son los mismos y el puente Reader→ventana hace lo que el hilo de
//! `pipe_feed` en B: entregar a `run` la foto más reciente.

use std::convert::Infallible;
use std::path::Path;
use std::process::ExitCode;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::RecvTimeoutError;
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use vantare_domain::format::Preferences;
use vantare_domain::{Adapter, Snapshot};
use vantare_runtime::adapter::{Lmu, open_replay};
use vantare_runtime::core::Core;
use vantare_runtime::{service, shutdown};
use vantare_ui::Grouping;

const USAGE: &str = "uso: vantare-inproc (--replay <fixture.bin|corpus.tar.gz> [--build <versión de LMU>] \
                     [--velocidad 1.0] | --live) [1|4|22]";

struct Args {
    /// `Some((ruta, build))` en replay; `None` en vivo.
    replay: Option<(String, Option<String>)>,
    speed: f64,
    windows: usize,
}

fn parse(args: &[String]) -> Result<Args, String> {
    let (mut replay, mut live, mut build) = (None, false, None);
    let (mut speed, mut windows) = (None, None);
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        let mut value = || {
            args.next()
                .cloned()
                .ok_or_else(|| format!("{arg} necesita un valor"))
        };
        match arg.as_str() {
            "--replay" => replay = Some(value()?),
            "--live" => live = true,
            "--build" => build = Some(value()?),
            "--velocidad" => {
                let text = value()?;
                speed = text
                    .parse::<f64>()
                    .ok()
                    .filter(|s| s.is_finite() && *s > 0.0 && *s <= 1000.0);
                if speed.is_none() {
                    return Err(format!("velocidad no válida: {text}"));
                }
            }
            n if windows.is_none() => {
                windows = Some(
                    n.parse()
                        .ok()
                        .filter(|n| matches!(n, 1 | 4 | 22))
                        .ok_or(format!("número de widgets no válido: {n} (1, 4 o 22)"))?,
                );
            }
            other => return Err(format!("argumento desconocido: {other}")),
        }
    }
    if replay.is_some() == live {
        return Err("indica exactamente uno de --replay o --live".into());
    }
    if live && (build.is_some() || speed.is_some()) {
        return Err("--build y --velocidad son de --replay".into());
    }
    Ok(Args {
        replay: replay.map(|path| (path, build)),
        speed: speed.unwrap_or(1.0),
        windows: windows.unwrap_or(1),
    })
}

/// Arranca el núcleo en su hilo y devuelve el canal por el que salen sus fotos.
/// El puente lee del `Reader` (`ArcSwap`): latest-wins, como el `Subscriber` de B.
/// Se cierra levantando `stop`.
fn start_core(
    mut adapter: Box<dyn Adapter + Send>,
    epoch: u64,
    speed: f64,
    stop: &'static AtomicBool,
) -> (JoinHandle<()>, flume::Receiver<Arc<Snapshot>>) {
    let mut core = Core::new(epoch);
    let reader = core.subscribe();
    let (tx, rx) = flume::unbounded();
    thread::spawn(move || {
        loop {
            match reader.wait(Duration::from_millis(250)) {
                // La primera foto (sequence 0) es la vacía anterior al primer dato.
                Ok(snapshot) if snapshot.sequence == 0 => {}
                Ok(snapshot) => {
                    if tx.send(snapshot).is_err() {
                        break;
                    }
                }
                Err(RecvTimeoutError::Timeout) if !tx.is_disconnected() => {}
                Err(_) => break,
            }
        }
    });
    let handle = thread::spawn(move || {
        let _ = service::drive(&mut core, &mut *adapter, speed, stop, |_| {
            Ok::<(), Infallible>(())
        });
    });
    (handle, rx)
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let args = match parse(&args) {
        Ok(args) => args,
        Err(message) => {
            eprintln!("{message}\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("vantare-inproc: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(args: &Args) -> Result<(), Box<dyn std::error::Error>> {
    let stop = shutdown::install()?;
    let adapter: Box<dyn Adapter + Send> = match &args.replay {
        Some((path, build)) => Box::new(open_replay(Path::new(path), build.as_deref())?),
        None => Box::new(Lmu::new()),
    };
    let epoch = u64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())?;
    let (_core, snapshots) = start_core(adapter, epoch, args.speed, stop);
    // Ctrl+C solo levanta la bandera del núcleo: aquí se cierra el proceso entero.
    thread::spawn(|| {
        while !stop.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(50));
        }
        std::process::exit(0);
    });
    // Al cerrarse la última ventana el proceso termina y se lleva los hilos.
    vantare_ui::run(
        args.windows,
        Grouping::OneWindow,
        snapshots,
        Preferences::default(),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(list: &[&str]) -> Result<Args, String> {
        let args: Vec<String> = list.iter().map(|s| (*s).into()).collect();
        parse(&args)
    }

    #[test]
    fn options_match_core_and_overlays() {
        let a = parsed(&["--replay", "c.tar.gz", "4", "--velocidad", "2"]).unwrap();
        assert_eq!((a.windows, a.speed), (4, 2.0));
        assert!(a.replay.is_some());
        assert_eq!(parsed(&["--live"]).unwrap().windows, 1);
        for bad in [
            &[][..],
            &["--live", "--replay", "x"],
            &["--live", "--build", "1"],
            &["--live", "3"],
            &["--live", "1", "4"],
            &["--replay", "x", "--velocidad", "0"],
        ] {
            assert!(parsed(bad).is_err(), "{bad:?}");
        }
    }

    /// El núcleo arranca en su hilo y las fotos llegan por el `Reader`, con
    /// revisión creciente y los 44 coches del fixture real.
    #[test]
    fn the_core_starts_and_photos_arrive_through_the_reader() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata/lmu-fixture.bin");
        assert!(fixture.exists(), "falta {}", fixture.display());
        let replay = open_replay(&fixture, Some("1.3.0.0")).unwrap();
        let stop: &'static AtomicBool = Box::leak(Box::new(AtomicBool::new(false)));
        // 0,2×: la foto fresca dura 2,5 s reales y a continuación llega la obsoleta.
        let (core, snapshots) = start_core(Box::new(replay), 7, 0.2, stop);

        let first = snapshots.recv_timeout(Duration::from_secs(10)).unwrap();
        assert_eq!((first.epoch, first.state.cars.len()), (7, 44));
        // Con la fuente parada, la revisión sigue creciendo (foto obsoleta).
        let stale = snapshots.recv_timeout(Duration::from_secs(10)).unwrap();
        assert!(stale.sequence > first.sequence);

        stop.store(true, Ordering::SeqCst);
        core.join().unwrap();
    }
}
