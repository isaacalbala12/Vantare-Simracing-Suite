#![cfg_attr(windows, windows_subsystem = "windows")]
//! `--dev`: ventana interactiva con recarga JSON y selección del registro.
//! `dev.ps1` recompila Rust y conserva la selección. Sin `--dev`, abre uno o varios widgets
//! alimentados por una escena fija, sin núcleo, para retocarlos con
//! `workshop.ps1` (recompila y reabre al guardar un fichero de `ui/src`).
//!
//! ```text
//! vantare-workshop --dev [--widget <nombre>] [--escena <archivo>]
//! vantare-workshop [--widgets standings,radar,pedals] [--pos x,y] [--escena <archivo>]
//! vantare-workshop --guardar <archivo> [--pipe <nombre>]
//! ```
//!
//! La escena por defecto es una foto real de LMU (47 coches, corpus
//! `lmu47-high-rate-60s`) versionada en `ui/fixtures/`. Para regenerarla o crear
//! otra: arrancar `vantare-core --replay <corpus>` y ejecutar `--guardar`, que
//! guarda la primera foto fresca que reciba por el pipe del núcleo.

use std::io::Write;
use vantare_ipc::product;

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::{Duration, Instant};

use vantare_domain::format::Preferences;
use vantare_domain::{Capability, Snapshot};
use vantare_ui::{Kind, layout_row, run_placed, source};

const DEFAULT_SCENE: &str = include_str!("../../fixtures/lmu47.snapshot.json");
const USAGE: &str = "uso: vantare-workshop --dev [--widget <nombre>] [--escena <archivo>]\n     vantare-workshop [--widgets <lista> | --widget <nombre>] [--pos x,y] [--escena <archivo>]\n     vantare-workshop --guardar <archivo> [--pipe <nombre>]\n     con feature parity-capture: --widget <nombre> --escena <foto.json> --captura <png>";
/// Cuánto espera `--guardar` a una foto con todas las señales frescas.
const SAVE_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, PartialEq)]
enum Command {
    Dev {
        widget: Option<Kind>,
        scene: Option<PathBuf>,
    },
    #[cfg(feature = "parity-capture")]
    Capture {
        widget: Kind,
        scene: PathBuf,
        output: PathBuf,
    },
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
    let (mut pos, mut scene, mut save, mut pipe) = ((20.0_f32, 20.0_f32), None, None, None);
    let (mut single, mut multiple, mut positioned) = (None, false, false);
    let mut dev = false;
    #[cfg(feature = "parity-capture")]
    let mut capture = None;
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        if arg == "--dev" {
            if dev {
                return None;
            }
            dev = true;
            continue;
        }
        let value = args.next()?;
        match arg.as_str() {
            "--widgets" => {
                multiple = true;
                widgets = value
                    .split(',')
                    .map(str::parse)
                    .collect::<Result<_, _>>()
                    .ok()?;
            }
            "--widget" => single = Some(value.parse().ok()?),
            "--pos" => {
                positioned = true;
                let (x, y) = value.split_once(',')?;
                pos = (x.parse().ok()?, y.parse().ok()?);
            }
            "--escena" => scene = Some(PathBuf::from(value)),
            "--guardar" => save = Some(PathBuf::from(value)),
            "--pipe" => pipe = Some(value.clone()),
            #[cfg(feature = "parity-capture")]
            "--captura" => capture = Some(PathBuf::from(value)),
            _ => return None,
        }
    }
    if widgets.is_empty()
        || (single.is_some() && multiple)
        || !pos.0.is_finite()
        || !pos.1.is_finite()
    {
        return None;
    }
    #[cfg(feature = "parity-capture")]
    if let Some(output) = capture {
        if dev || save.is_some() || pipe.is_some() || multiple || positioned {
            return None;
        }
        return Some(Command::Capture {
            widget: single?,
            scene: scene?,
            output,
        });
    }
    if dev {
        if save.is_some() || pipe.is_some() || multiple || positioned {
            return None;
        }
        return Some(Command::Dev {
            widget: single,
            scene,
        });
    }
    if save.is_some() && (single.is_some() || multiple || positioned) {
        return None;
    }
    if let Some(widget) = single {
        widgets = vec![widget];
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
    let _written = writeln!(
        std::io::stdout(),
        "escena guardada en {} ({} coches)",
        file.display(),
        snapshot.state.cars.len()
    );
    Ok(())
}

fn load_scene(scene: Option<PathBuf>) -> Result<Vec<Snapshot>, String> {
    let text = match scene {
        Some(path) => {
            std::fs::read_to_string(&path).map_err(|e| format!("leer {}: {e}", path.display()))?
        }
        None => DEFAULT_SCENE.to_owned(),
    };
    vantare_ui::workshop::snapshots_from_json(&text)
}

fn show(widgets: &[Kind], pos: (f32, f32), scene: Option<PathBuf>) -> Result<(), String> {
    let snapshots = load_scene(scene)?;
    // Caben todas antes de arrancar GPUI; el feed las entrega en orden sin coalescer.
    let (sender, receiver) = flume::bounded(snapshots.len());
    for snapshot in snapshots {
        sender.send(Arc::new(snapshot)).map_err(|e| e.to_string())?;
    }
    run_placed(layout_row(widgets, pos), receiver, Preferences::default());
    drop(sender);
    Ok(())
}

fn main() -> ExitCode {
    if product::print_version() {
        return ExitCode::SUCCESS;
    }
    vantare_services::diagnostics::install_panic_hook("vantare-workshop");
    let args: Vec<String> = std::env::args().skip(1).collect();
    #[cfg(feature = "parity-capture")]
    if let [flag, path] = args.as_slice()
        && flag == "--capture-batch"
    {
        return vantare_ui::capture::run_batch(std::path::Path::new(path));
    }
    let Some(command) = parse(&args) else {
        let _written = writeln!(std::io::stderr(), "{USAGE}");
        return ExitCode::from(2);
    };
    let result = match command {
        Command::Dev { widget, scene } => vantare_ui::workshop::run(widget, scene),
        #[cfg(feature = "parity-capture")]
        Command::Capture {
            widget,
            scene,
            output,
        } => {
            return match load_scene(Some(scene)) {
                Ok(mut snapshots) => {
                    // QA de paridad: VANTARE_CAPTURE_UNTIL=<n> corta la escena en
                    // la foto n y VANTARE_CAPTURE_SETTINGS=<json> usa los ajustes
                    // que ofrece el Workshop (por defecto, los del registro).
                    if let Some(until) = std::env::var("VANTARE_CAPTURE_UNTIL")
                        .ok()
                        .and_then(|v| v.parse::<usize>().ok())
                    {
                        snapshots.truncate(until.saturating_add(1));
                    }
                    let settings = if let Ok(json) = std::env::var("VANTARE_CAPTURE_SETTINGS") {
                        serde_json::from_str::<vantare_ui::Settings>(&json)
                            .map(|s| s.normalized())
                            .map_err(|e| e.to_string())
                    } else {
                        // Los mismos ajustes de partida que el Workshop del Hub.
                        let mut settings = vantare_ui::Settings::default_for(widget);
                        match &mut settings {
                            vantare_ui::Settings::Standings(standings) => {
                                standings.row_count = 8;
                                standings.apply_session_presets();
                                standings.practice_columns =
                                    Some(vantare_ui::standings::vantare_standard_session_template(
                                        vantare_ui::session::Session::Practice,
                                    ));
                                standings.qualifying_columns =
                                    Some(vantare_ui::standings::vantare_standard_session_template(
                                        vantare_ui::session::Session::Qualifying,
                                    ));
                                standings.class_scope = "all-classes".into();
                                standings.columns =
                                    Some(vantare_ui::standings::vantare_template("standard"));
                            }
                            vantare_ui::Settings::Relative(relative) => {
                                relative.class_scope = "all".into();
                            }
                            _ => {}
                        }
                        Ok(settings)
                    };
                    match settings {
                        Ok(settings) => vantare_ui::capture::run_configured_sequence(
                            settings,
                            Preferences::default(),
                            &snapshots,
                            output,
                        ),
                        Err(error) => {
                            let _written = writeln!(
                                std::io::stderr(),
                                "vantare-workshop: ajustes de captura: {error}"
                            );
                            ExitCode::FAILURE
                        }
                    }
                }
                Err(error) => {
                    let _written = writeln!(std::io::stderr(), "vantare-workshop: {error}");
                    ExitCode::FAILURE
                }
            };
        }
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
            let _written = writeln!(std::io::stderr(), "vantare-workshop: {error}");
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
    fn dev_uses_the_registry_and_rejects_other_modes() {
        assert!(matches!(
            parse(&args(&["--dev"])),
            Some(Command::Dev { .. })
        ));
        for &widget in Kind::ALL {
            assert_eq!(
                parse(&args(&[
                    "--dev",
                    "--widget",
                    widget.name(),
                    "--escena",
                    "s.json"
                ])),
                Some(Command::Dev {
                    widget: Some(widget),
                    scene: Some("s.json".into())
                })
            );
        }
        for bad in [
            vec!["--dev", "--widgets", "radar"],
            vec!["--dev", "--guardar", "s.json"],
            vec!["--dev", "--pipe", "p"],
            vec!["--dev", "--pos", "0,0"],
            vec!["--dev", "--dev"],
            vec!["--dev", "--widget", "unknown"],
            vec!["--dev", "--widget"],
            vec![
                "--dev",
                "--widget",
                "radar",
                "--escena",
                "s.json",
                "--captura",
                "s.png",
            ],
        ] {
            assert_eq!(parse(&args(&bad)), None, "{bad:?}");
        }
    }

    #[test]
    fn the_default_scene_is_a_real_lmu_snapshot_that_every_widget_can_draw() {
        let snapshot =
            vantare_ipc::snapshot_from_fixture_json(DEFAULT_SCENE).expect("escena válida");
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
        assert_eq!(parse(&args(&["--widgets", ""])), None);
        assert_eq!(
            parse(&args(&["--widget", "radar", "--widgets", "pedals"])),
            None
        );
        assert_eq!(parse(&args(&["--pos", "NaN,0"])), None);
        assert_eq!(
            parse(&args(&["--guardar", "s.json", "--widget", "radar"])),
            None
        );
        assert_eq!(
            parse(&args(&["--widget", "pedals"])),
            Some(Command::Show {
                widgets: vec![Kind::Pedals],
                pos: (20.0, 20.0),
                scene: None,
            })
        );
    }
}

#[cfg(all(test, feature = "parity-capture"))]
mod capture_tests {
    use super::*;

    #[test]
    fn capture_requires_one_widget_and_an_explicit_scene() {
        let args = |list: &[&str]| list.iter().map(|s| (*s).into()).collect::<Vec<String>>();
        assert_eq!(
            parse(&args(&[
                "--widget",
                "radar",
                "--escena",
                "r.json",
                "--captura",
                "r.png"
            ])),
            Some(Command::Capture {
                widget: Kind::Radar,
                scene: "r.json".into(),
                output: "r.png".into()
            })
        );
        for bad in [
            vec!["--captura", "r.png"],
            vec!["--widget", "radar", "--captura", "r.png"],
            vec![
                "--widgets",
                "radar,pedals",
                "--escena",
                "r.json",
                "--captura",
                "r.png",
            ],
            vec![
                "--widget",
                "radar",
                "--escena",
                "r.json",
                "--captura",
                "r.png",
                "--guardar",
                "s.json",
            ],
            vec![
                "--widget",
                "radar",
                "--escena",
                "r.json",
                "--captura",
                "r.png",
                "--pos",
                "10,10",
            ],
        ] {
            assert_eq!(parse(&args(&bad)), None, "{bad:?}");
        }
    }
}

#[cfg(all(test, not(feature = "parity-capture")))]
mod product_tests {
    #[test]
    fn capture_is_not_a_product_command() {
        assert_eq!(super::parse(&["--captura".into(), "r.png".into()]), None);
    }
}
