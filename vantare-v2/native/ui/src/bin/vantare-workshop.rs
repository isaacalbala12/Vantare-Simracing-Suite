//! Workshop mínimo (desarrollo): abre la ventana con uno o varios widgets
//! alimentados por una escena fija, sin núcleo, para retocarlos con
//! `workshop.ps1` (recompila y reabre al guardar un fichero de `ui/src`).
//!
//! ```text
//! vantare-workshop [--widgets standings,radar,pedals] [--pos x,y] [--escena <archivo>]
//! vantare-workshop --guardar <archivo> [--pipe <nombre>]
//! ```
//!
//! La escena por defecto es una foto real de LMU (47 coches, corpus
//! `lmu47-high-rate-60s`) versionada en `ui/fixtures/`. Para regenerarla o crear
//! otra: arrancar `vantare-core --replay <corpus>` y ejecutar `--guardar`, que
//! guarda la primera foto fresca que reciba por el pipe del núcleo.

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::{Duration, Instant};

use vantare_domain::format::Preferences;
use vantare_domain::{Capability, Snapshot};
use vantare_ui::{Kind, layout_row, run_placed, source};

const DEFAULT_SCENE: &str = include_str!("../../fixtures/lmu47.snapshot.json");
const USAGE: &str = "uso: vantare-workshop [--widgets standings,radar,pedals] [--pos x,y] [--escena <archivo>]\n     vantare-workshop --guardar <archivo> [--pipe <nombre>]";
/// Cuánto espera `--guardar` a una foto con todas las señales frescas.
const SAVE_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, PartialEq)]
enum Command {
    Show {
        widgets: Vec<Kind>,
        pos: (f32, f32),
        scene: Option<PathBuf>,
    },
    Save {
        file: PathBuf,
        pipe: Option<String>,
    },
}

fn parse(args: &[String]) -> Option<Command> {
    let mut widgets = vec![Kind::Standings, Kind::Radar, Kind::Pedals];
    let (mut pos, mut scene, mut save, mut pipe) = ((20.0, 20.0), None, None, None);
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        let value = args.next()?;
        match arg.as_str() {
            "--widgets" => {
                widgets = value
                    .split(',')
                    .map(str::parse)
                    .collect::<Result<_, _>>()
                    .ok()?;
            }
            "--pos" => {
                let (x, y) = value.split_once(',')?;
                pos = (x.parse().ok()?, y.parse().ok()?);
            }
            "--escena" => scene = Some(PathBuf::from(value)),
            "--guardar" => save = Some(PathBuf::from(value)),
            "--pipe" => pipe = Some(value.clone()),
            _ => return None,
        }
    }
    match save {
        Some(file) if scene.is_none() => Some(Command::Save { file, pipe }),
        None if pipe.is_none() => Some(Command::Show {
            widgets,
            pos,
            scene,
        }),
        _ => None,
    }
}

/// Foto con todo lo que pintan los widgets fresco (posiciones, radar y pedales).
fn is_complete(snapshot: &Snapshot) -> bool {
    let c = &snapshot.state.capabilities;
    c.positions == Capability::Fresh
        && c.spatial == Capability::Fresh
        && c.driver_inputs == Capability::Fresh
}

fn save(file: &PathBuf, pipe: Option<String>) -> Result<(), String> {
    let name = match pipe {
        Some(name) => name,
        None => vantare_ipc::default_pipe_name().map_err(|e| e.to_string())?,
    };
    let feed = source::pipe_feed(&name).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + SAVE_TIMEOUT;
    // La mejor foto vista: con todo fresco vale al instante; si no, la última
    // con posiciones frescas cuando se agote el tiempo.
    let mut best: Option<Arc<Snapshot>> = None;
    while let Some(left) = deadline.checked_duration_since(Instant::now()) {
        let Ok(snapshot) = feed.recv_timeout(left) else {
            break;
        };
        if is_complete(&snapshot) {
            best = Some(snapshot);
            break;
        }
        if snapshot.state.capabilities.positions == Capability::Fresh {
            best = Some(snapshot);
        }
    }
    let snapshot =
        best.ok_or("no llegó ninguna foto fresca por el pipe (¿vantare-core en marcha?)")?;
    let text = vantare_ipc::snapshot_to_json(&snapshot).map_err(|e| e.to_string())?;
    std::fs::write(file, text).map_err(|e| format!("escribir {}: {e}", file.display()))?;
    println!(
        "escena guardada en {} ({} coches)",
        file.display(),
        snapshot.state.cars.len()
    );
    Ok(())
}

fn show(widgets: &[Kind], pos: (f32, f32), scene: Option<PathBuf>) -> Result<(), String> {
    let text = match scene {
        Some(path) => {
            std::fs::read_to_string(&path).map_err(|e| format!("leer {}: {e}", path.display()))?
        }
        None => DEFAULT_SCENE.to_owned(),
    };
    let snapshot = vantare_ipc::snapshot_from_json(&text).map_err(|e| e.to_string())?;
    // Una sola foto: los widgets la conservan; el emisor vive hasta que se cierre la ventana.
    let (sender, receiver) = flume::bounded(1);
    sender.send(Arc::new(snapshot)).map_err(|e| e.to_string())?;
    run_placed(layout_row(widgets, pos), receiver, Preferences::default());
    drop(sender);
    Ok(())
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(command) = parse(&args) else {
        eprintln!("{USAGE}");
        return ExitCode::from(2);
    };
    let result = match command {
        Command::Show {
            widgets,
            pos,
            scene,
        } => show(&widgets, pos, scene),
        Command::Save { file, pipe } => save(&file, pipe),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("vantare-workshop: {error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).into()).collect()
    }

    #[test]
    fn the_default_scene_is_a_real_lmu_snapshot_that_every_widget_can_draw() {
        let snapshot = vantare_ipc::snapshot_from_json(DEFAULT_SCENE).expect("escena válida");
        assert_eq!(snapshot.state.cars.len(), 47);
        assert_eq!(snapshot.origin.source.simulator, "lmu");
        assert!(
            is_complete(&snapshot),
            "posiciones, radar y pedales frescos"
        );
    }

    #[test]
    fn arguments_choose_widgets_position_and_scene() {
        assert_eq!(
            parse(&args(&[])),
            Some(Command::Show {
                widgets: vec![Kind::Standings, Kind::Radar, Kind::Pedals],
                pos: (20.0, 20.0),
                scene: None
            })
        );
        assert_eq!(
            parse(&args(&[
                "--widgets",
                "radar",
                "--pos",
                "100,50",
                "--escena",
                "a.json"
            ])),
            Some(Command::Show {
                widgets: vec![Kind::Radar],
                pos: (100.0, 50.0),
                scene: Some("a.json".into())
            })
        );
        assert_eq!(
            parse(&args(&["--guardar", "s.json", "--pipe", "mio"])),
            Some(Command::Save {
                file: "s.json".into(),
                pipe: Some("mio".into())
            })
        );
        assert_eq!(parse(&args(&["--widgets", "mapa"])), None);
        assert_eq!(parse(&args(&["--pos", "10"])), None);
        assert_eq!(
            parse(&args(&["--pipe", "x"])),
            None,
            "--pipe solo con --guardar"
        );
        assert_eq!(
            parse(&args(&["--guardar", "s.json", "--escena", "e.json"])),
            None
        );
        assert_eq!(parse(&args(&["--widgets"])), None);
    }
}
