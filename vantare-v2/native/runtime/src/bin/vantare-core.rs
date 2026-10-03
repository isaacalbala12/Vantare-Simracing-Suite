//! Núcleo de Vantare sin UI: lee un simulador (o reproduce una captura) y sirve
//! la foto actual a los overlays por un named pipe.
//!
//! Termina ordenadamente con Ctrl+C, Ctrl+Break, cerrar la consola o al llegar
//! su stdin a EOF (así lo pide el launcher `vantare`). Con stdin cerrado o nulo
//! desde el principio, termina nada más arrancar.
//!
//! `vantare-core (--replay <fixture.bin|corpus.tar.gz> [--build <versión>] [--velocidad 1.0] | --live) [--simulator lmu|acc] [--pipe <nombre>]`

const USAGE: &str = "uso: vantare-core (--replay <fixture.bin|corpus.tar.gz> [--build <versión de LMU>] \
                     [--velocidad 1.0] | --live) [--simulator lmu|acc] [--pipe <nombre>] [--recording <JSONL>] [--engineer-image <EXE>]";

#[derive(Debug, PartialEq)]
enum Input {
    Replay {
        path: String,
        build: Option<String>,
        speed: f64,
    },
    Live,
}

#[derive(Debug, PartialEq)]
struct Args {
    input: Input,
    pipe: Option<String>,
    simulator: String,
    recording: Option<std::path::PathBuf>,
    engineer_image: Option<std::path::PathBuf>,
    managed_rights: bool,
}

fn parse(args: &[String]) -> Result<Args, String> {
    let (mut replay, mut live) = (None, false);
    let (mut build, mut speed, mut pipe) = (None, None, None);
    let mut simulator = "lmu".to_owned();
    let (mut recording, mut engineer_image) = (None, None);
    let mut managed_rights = false;
    let mut args = args.iter();
    while let Some(flag) = args.next() {
        let mut value = || {
            args.next()
                .cloned()
                .ok_or_else(|| format!("{flag} necesita un valor"))
        };
        match flag.as_str() {
            "--replay" => replay = Some(value()?),
            "--live" => live = true,
            "--build" => build = Some(value()?),
            "--velocidad" => {
                let text = value()?;
                speed = Some(
                    text.parse::<f64>()
                        .ok()
                        .filter(|speed| speed.is_finite() && *speed > 0.0 && *speed <= 1000.0)
                        .ok_or_else(|| format!("velocidad no válida: {text}"))?,
                );
            }
            "--pipe" => pipe = Some(value()?),
            "--recording" => recording = Some(value()?.into()),
            "--engineer-image" => engineer_image = Some(value()?.into()),
            "--managed-rights" if !managed_rights => managed_rights = true,
            "--simulator" => simulator = value()?,
            other => return Err(format!("argumento desconocido: {other}")),
        }
    }
    if !matches!(simulator.as_str(), "lmu" | "acc") {
        return Err("--simulator debe ser lmu o acc".into());
    }
    if simulator == "acc" && build.is_some() {
        return Err("ACC obtiene la versión de la captura; --build es solo de LMU".into());
    }
    let input = match (replay, live) {
        (Some(path), false) => Input::Replay {
            path,
            build,
            speed: speed.unwrap_or(1.0),
        },
        (None, true) if build.is_none() && speed.is_none() => Input::Live,
        (None, true) => return Err("--build y --velocidad son de --replay".into()),
        _ => return Err("indica exactamente uno de --replay o --live".into()),
    };
    Ok(Args {
        input,
        pipe,
        simulator,
        recording,
        engineer_image,
        managed_rights,
    })
}

#[cfg(any(windows, unix))]
fn main() -> std::process::ExitCode {
    use std::process::ExitCode;
    vantare_services::diagnostics::install_panic_hook("vantare-core");

    let args: Vec<String> = std::env::args().skip(1).collect();
    match parse(&args) {
        Err(message) => {
            eprintln!("{message}\n{USAGE}");
            ExitCode::from(2)
        }
        Ok(args) => match run(args) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("vantare-core: {error}");
                ExitCode::FAILURE
            }
        },
    }
}

#[cfg(windows)]
fn run(args: Args) -> Result<(), Box<dyn std::error::Error>> {
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    use vantare_domain::Adapter;
    use vantare_runtime::adapter::{Acc, Lmu, open_acc_replay, open_replay};
    use vantare_runtime::{service, shutdown};

    let stop = shutdown::install()?;
    let rights_nonce = if args.managed_rights {
        let bootstrap: vantare_ipc::control::Bootstrap =
            vantare_ipc::control::read(&mut std::io::stdin().lock())?;
        if bootstrap.nonce.len() != 64
            || !bootstrap
                .nonce
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err("bootstrap de derechos inválido".into());
        }
        Some(bootstrap.nonce)
    } else {
        None
    };
    // Contrato con el launcher: pide el cierre cerrando el stdin del núcleo, que
    // debe terminar al llegar a EOF. Lanzado a mano en una terminal, no llega EOF.
    std::thread::spawn(|| {
        let _ = std::io::copy(&mut std::io::stdin(), &mut std::io::sink());
        shutdown::request();
    });
    let pipe = match args.pipe {
        Some(pipe) => pipe,
        None => vantare_ipc::default_pipe_name()?,
    };
    // Época nueva en cada arranque: los milisegundos de reloj de pared crecen
    // entre arranques, y los overlays reconstruyen su estado al verla cambiar.
    let epoch = u64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())?;
    let (mut adapter, speed): (Box<dyn Adapter>, f64) = match args.input {
        Input::Live => {
            let live: Box<dyn Adapter> = if args.simulator == "acc" {
                Box::new(Acc::new())
            } else {
                Box::new(Lmu::new())
            };
            (live, 1.0)
        }
        Input::Replay { path, build, speed } => {
            let replay: Box<dyn Adapter> = if args.simulator == "acc" {
                Box::new(open_acc_replay(Path::new(&path))?)
            } else {
                Box::new(open_replay(Path::new(&path), build.as_deref())?)
            };
            (replay, speed)
        }
    };
    let image = args
        .engineer_image
        .unwrap_or(std::env::current_exe()?.with_file_name("vantare-engineer.exe"));
    service::run_controlled(
        adapter.as_mut(),
        &pipe,
        epoch,
        speed,
        stop,
        service::Options {
            recording: args.recording.as_deref(),
            engineer_image: image,
            rights_nonce,
        },
    )?;
    Ok(())
}

#[cfg(unix)]
fn run(args: Args) -> Result<(), Box<dyn std::error::Error>> {
    use std::path::Path;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::thread;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    use vantare_domain::Adapter;
    use vantare_ipc::Publisher;
    use vantare_runtime::adapter::{open_acc_replay, open_replay};
    use vantare_runtime::core::Core;
    use vantare_runtime::flows::host::{EventHost, pipe_name as events_pipe_name};

    if args.managed_rights {
        return Err("--managed-rights solo está disponible en Windows".into());
    }
    let Input::Replay { path, build, speed } = args.input else {
        return Err("la telemetría live solo está disponible en Windows".into());
    };
    let mut adapter: Box<dyn Adapter> = if args.simulator == "acc" {
        Box::new(open_acc_replay(Path::new(&path))?)
    } else {
        Box::new(open_replay(Path::new(&path), build.as_deref())?)
    };
    let pipe = match args.pipe {
        Some(pipe) => pipe,
        None => vantare_ipc::default_pipe_name()?,
    };
    let epoch = u64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())?;
    let image = args
        .engineer_image
        .unwrap_or(std::env::current_exe()?.with_file_name("vantare-engineer"));
    let mut events = EventHost::start(
        &events_pipe_name(&pipe),
        epoch,
        args.recording.as_deref(),
        move |peer| peer.is_image(&image),
    )?;
    let mut core = Core::with_event_base(events.base())?;
    let mut publisher = Publisher::new(&pipe, |_| true)?;
    let demand = publisher.demand_source();
    let stop = Arc::new(AtomicBool::new(false));
    let stop_on_eof = Arc::clone(&stop);
    thread::spawn(move || {
        let _ = std::io::copy(&mut std::io::stdin(), &mut std::io::sink());
        stop_on_eof.store(true, Ordering::Release);
    });

    let started = Instant::now();
    let mut sent = 0;
    let mut last_error = String::new();
    let mut demand_revision = u64::MAX;
    while !stop.load(Ordering::Acquire) {
        let revision = demand.revision();
        if revision != demand_revision {
            core.set_demand_mask(demand.mask());
            demand_revision = revision;
        }
        match core.step(adapter.as_mut(), started.elapsed().mul_f64(speed)) {
            Ok(()) => last_error.clear(),
            Err(error) if error.to_string() != last_error => {
                last_error = error.to_string();
                eprintln!("núcleo: {last_error}");
            }
            Err(_) => {} // La causa ya se registró; no repetir el mismo diagnóstico en cada ciclo.
        }
        let snapshot = core.snapshot();
        if snapshot.sequence > sent {
            sent = snapshot.sequence;
            events.publish(Arc::clone(&snapshot), core.events());
            publisher.publish(snapshot)?;
        } else {
            thread::sleep(Duration::from_millis(2));
        }
    }
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
    fn replay_and_live_are_exclusive_and_options_belong_to_their_mode() {
        assert_eq!(
            parsed(&["--replay", "c.tar.gz"]).unwrap().input,
            Input::Replay {
                path: "c.tar.gz".into(),
                build: None,
                speed: 1.0
            }
        );
        let full = parsed(&[
            "--pipe",
            "p",
            "--replay",
            "f.bin",
            "--build",
            "1.3.0.0",
            "--velocidad",
            "2.5",
        ])
        .unwrap();
        assert_eq!(full.pipe.as_deref(), Some("p"));
        assert_eq!(
            full.input,
            Input::Replay {
                path: "f.bin".into(),
                build: Some("1.3.0.0".into()),
                speed: 2.5
            }
        );
        assert_eq!(parsed(&["--live"]).unwrap().input, Input::Live);
        for bad in [
            &[][..],
            &["--live", "--replay", "x"],
            &["--live", "--velocidad", "2"],
            &["--live", "--build", "1.3.0.0"],
            &["--replay"],
            &["--replay", "x", "--velocidad", "0"],
            &["--replay", "x", "--velocidad", "-1"],
            &["--replay", "x", "--velocidad", "nan"],
            &["--replay", "x", "--velocidad", "mucho"],
            &["--replay", "x", "--rapido"],
        ] {
            assert!(parsed(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn simulator_selection_preserves_lmu_default_and_acc_reads_its_own_version() {
        assert_eq!(parsed(&["--live"]).expect("LMU").simulator, "lmu");
        for mode in [&["--live"][..], &["--replay", "acc.tar.gz"]] {
            let mut args = vec!["--simulator", "acc"];
            args.extend(mode);
            assert_eq!(parsed(&args).expect("ACC").simulator, "acc");
        }
        assert!(parsed(&["--live", "--simulator", "unknown"]).is_err());
        assert!(
            parsed(&[
                "--replay",
                "acc.tar.gz",
                "--simulator",
                "acc",
                "--build",
                "1.7"
            ])
            .is_err()
        );
    }
}
