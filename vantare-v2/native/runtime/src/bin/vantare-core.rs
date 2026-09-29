//! Núcleo de Vantare sin UI: lee un simulador (o reproduce una captura) y sirve
//! la foto actual a los overlays por un named pipe.
//!
//! Termina ordenadamente con Ctrl+C, Ctrl+Break, cerrar la consola o al llegar
//! su stdin a EOF (así lo pide el launcher `vantare`). Con stdin cerrado o nulo
//! desde el principio, termina nada más arrancar.
//!
//! `vantare-core (--replay <fixture.bin|corpus.tar.gz> [--build <versión>] [--velocidad 1.0] | --live) [--pipe <nombre>]`

const USAGE: &str = "uso: vantare-core (--replay <fixture.bin|corpus.tar.gz> [--build <versión de LMU>] \
                     [--velocidad 1.0] | --live) [--pipe <nombre>]";

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
}

fn parse(args: &[String]) -> Result<Args, String> {
    let (mut replay, mut live) = (None, false);
    let (mut build, mut speed, mut pipe) = (None, None, None);
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
            other => return Err(format!("argumento desconocido: {other}")),
        }
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
    Ok(Args { input, pipe })
}

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    use std::process::ExitCode;

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

    use vantare_runtime::adapter::{Lmu, open_replay};
    use vantare_runtime::{service, shutdown};

    let stop = shutdown::install()?;
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
    match args.input {
        Input::Live => service::run(&mut Lmu::new(), &pipe, epoch, 1.0, stop)?,
        Input::Replay { path, build, speed } => {
            let mut replay = open_replay(Path::new(&path), build.as_deref())?;
            service::run(&mut replay, &pipe, epoch, speed, stop)?;
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn main() {
    eprintln!("vantare-core solo funciona en Windows");
    std::process::exit(1);
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
}
