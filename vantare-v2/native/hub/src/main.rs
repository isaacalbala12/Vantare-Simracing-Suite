#![forbid(unsafe_code)]

#[path = "../../packaging/version.rs"]
mod product;

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use vantare_hub::orbit::theme::{AppearanceSettings, Palette, Scheme};
use vantare_hub::{Section, shell::Options};

fn capture_appearance(value: &str) -> Result<AppearanceSettings, String> {
    let (palette, scheme) = value
        .split_once('-')
        .ok_or("apariencia requiere paleta-esquema")?;
    let palette = match palette {
        "vantare" => Palette::Vantare,
        "rose" => Palette::Rose,
        "grove" => Palette::Grove,
        "ocean" => Palette::Ocean,
        "ember" => Palette::Ember,
        "iris" => Palette::Iris,
        "mono" => Palette::Mono,
        _ => return Err("paleta de captura desconocida".into()),
    };
    let scheme = match scheme {
        "dark" => Scheme::Dark,
        "light" => Scheme::Light,
        _ => return Err("esquema de captura debe ser dark o light".into()),
    };
    Ok(AppearanceSettings {
        palette,
        scheme,
        ..Default::default()
    })
}

fn persistence_paths(
    capture_root: Option<&Path>,
    data_dir: Option<PathBuf>,
    layout: Option<PathBuf>,
    engineer: Option<PathBuf>,
    launcher_file: Option<PathBuf>,
) -> Result<(PathBuf, PathBuf, PathBuf, PathBuf), String> {
    let data_dir = if let Some(root) = capture_root {
        root.join("data")
    } else {
        match data_dir {
            Some(path) => path,
            None => vantare_ui::paths::default_data_dir()
                .map_err(str::to_owned)?
                .join("VantareNative")
                .join("hub"),
        }
    };
    let (layout, engineer, launcher_file) = if let Some(root) = capture_root {
        (
            root.join("layout.json"),
            root.join("engineer.json"),
            root.join("launcher.json"),
        )
    } else {
        (
            match layout {
                Some(path) => path,
                None => vantare_ui::layout::default_path().map_err(|error| error.to_string())?,
            },
            match engineer {
                Some(path) => path,
                None => default_engineer_path()?,
            },
            match launcher_file {
                Some(path) => path,
                None => vantare_hub::launcher::default_path()?,
            },
        )
    };
    Ok((data_dir, layout, engineer, launcher_file))
}

fn default_engineer_path() -> Result<PathBuf, String> {
    vantare_ui::paths::default_data_dir()
        .map(|root| root.join("Vantare/native/engineer.json"))
        .map_err(str::to_owned)
}

struct RawOptions {
    controlled: bool,
    data_dir: Option<PathBuf>,
    scene: Option<PathBuf>,
    layout: Option<PathBuf>,
    engineer: Option<PathBuf>,
    pipe: Option<String>,
    recordings: Option<PathBuf>,
    launcher_file: Option<PathBuf>,
    section: Section,
    explicit_section: bool,
    capture_name: Option<String>,
    capture_output: Option<PathBuf>,
    capture_appearance: Option<AppearanceSettings>,
    capture_size: Option<(u32, u32)>,
    demo_requested: bool,
}

impl RawOptions {
    fn parse(args: &[String]) -> Result<Self, String> {
        let mut parsed = Self {
            controlled: false,
            data_dir: None,
            scene: None,
            layout: None,
            engineer: None,
            pipe: None,
            recordings: None,
            launcher_file: None,
            section: Section::Home,
            explicit_section: false,
            capture_name: None,
            capture_output: None,
            capture_appearance: None,
            capture_size: None,
            demo_requested: false,
        };
        let mut args = args.iter();
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--control-stdin" if !parsed.controlled => parsed.controlled = true,
                "--demo" if !parsed.demo_requested => parsed.demo_requested = true,
                "--capture" if parsed.capture_name.is_none() => {
                    parsed.capture_name =
                        Some(args.next().ok_or("falta nombre de pantalla")?.clone());
                }
                "--out" if parsed.capture_output.is_none() => {
                    parsed.capture_output =
                        Some(PathBuf::from(args.next().ok_or("falta PNG de salida")?));
                }
                "--appearance" if parsed.capture_appearance.is_none() => {
                    parsed.capture_appearance = Some(capture_appearance(
                        args.next().ok_or("falta apariencia de captura")?,
                    )?);
                }
                "--size" if parsed.capture_size.is_none() => {
                    parsed.capture_size = Some(capture_size(
                        args.next().ok_or("falta tamaño de captura WxH")?,
                    )?);
                }
                "--workshop" if parsed.section == Section::Home => {
                    parsed.section = Section::Workshop;
                    parsed.explicit_section = true;
                }
                "--studio" if parsed.section == Section::Home => {
                    parsed.section = Section::Studio;
                    parsed.explicit_section = true;
                }
                "--analysis" if parsed.section == Section::Home => {
                    parsed.section = Section::Analysis;
                    parsed.explicit_section = true;
                }
                "--recordings" if parsed.recordings.is_none() => {
                    parsed.recordings = Some(PathBuf::from(
                        args.next().ok_or("falta directorio de grabaciones")?,
                    ));
                }
                "--launcher" if parsed.section == Section::Home => {
                    parsed.section = Section::Launcher;
                    parsed.explicit_section = true;
                }
                "--launcher-file" if parsed.launcher_file.is_none() => {
                    parsed.launcher_file =
                        Some(PathBuf::from(args.next().ok_or("falta archivo Launcher")?));
                }
                "--engineer" if parsed.section == Section::Home => {
                    parsed.section = Section::Engineer;
                    parsed.explicit_section = true;
                }
                "--engineer-settings" if parsed.engineer.is_none() => {
                    parsed.engineer =
                        Some(PathBuf::from(args.next().ok_or("falta ajustes Engineer")?));
                }
                "--strategy" if parsed.section == Section::Home => {
                    parsed.section = Section::Strategy;
                    parsed.explicit_section = true;
                }
                "--data-dir" if parsed.data_dir.is_none() => {
                    parsed.data_dir = Some(PathBuf::from(args.next().ok_or("falta directorio")?));
                }
                "--layout" if parsed.layout.is_none() => {
                    parsed.layout = Some(PathBuf::from(args.next().ok_or("falta layout")?));
                }
                "--scene" if parsed.scene.is_none() => {
                    parsed.scene = Some(PathBuf::from(args.next().ok_or("falta escena")?));
                }
                "--pipe" if parsed.pipe.is_none() => {
                    let name = args.next().ok_or("falta nombre de pipe")?;
                    if name.trim().is_empty() {
                        return Err("pipe vacío".into());
                    }
                    parsed.pipe = Some(name.clone());
                }
                _ => return Err("argumento desconocido o repetido".into()),
            }
        }
        Ok(parsed)
    }

    fn finish(self) -> Result<Options, String> {
        let Self {
            controlled,
            data_dir,
            scene,
            layout,
            engineer,
            pipe,
            recordings,
            launcher_file,
            mut section,
            explicit_section,
            capture_name,
            capture_output,
            capture_appearance,
            capture_size,
            demo_requested,
        } = self;
        if capture_name.is_some() != capture_output.is_some() {
            return Err("--capture requiere --out".into());
        }
        if capture_appearance.is_some() && capture_name.is_none() {
            return Err("--appearance requiere --capture".into());
        }
        if capture_size.is_some() && capture_name.is_none() {
            return Err("--size requiere --capture".into());
        }
        let capture = capture_name
            .as_deref()
            .map(vantare_hub::demo::CaptureState::parse)
            .transpose()?;
        if capture.is_some()
            && (explicit_section
                || controlled
                || data_dir.is_some()
                || scene.is_some()
                || layout.is_some()
                || engineer.is_some()
                || pipe.is_some()
                || recordings.is_some()
                || launcher_file.is_some())
        {
            return Err("--capture usa datos aislados y no admite rutas persistentes".into());
        }
        let demo = (demo_requested || capture.is_some())
            .then(vantare_hub::demo::DemoData::load)
            .transpose()?;
        let capture_root = capture.as_ref().map(|state| {
            let ticks = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |duration| duration.as_nanos());
            std::env::temp_dir()
                .join("vantare-hub-parity")
                .join(format!("{}-{ticks}-{}", std::process::id(), state.name))
        });
        if let Some(state) = &capture {
            section = state.section;
        }
        let (data_dir, layout_path, engineer_path, launcher_path) = persistence_paths(
            capture_root.as_deref(),
            data_dir,
            layout,
            engineer,
            launcher_file,
        )?;
        Ok(Options {
            controlled,
            data_dir,
            scene,
            layout: layout_path,
            engineer: engineer_path,
            section,
            pipe: if capture.is_some() {
                Some("isa1430-parity-no-producer".into())
            } else {
                pipe
            },
            recordings: if capture.is_some() {
                capture_root.as_ref().map(|root| root.join("recordings"))
            } else {
                recordings
            },
            launcher_file: launcher_path,
            demo,
            capture,
            capture_output,
            capture_appearance,
            capture_size,
        })
    }
}

fn capture_size(value: &str) -> Result<(u32, u32), String> {
    let (width, height) = value.split_once('x').ok_or("usa --size WxH")?;
    let dimension = |value: &str| {
        value
            .parse::<u32>()
            .ok()
            .filter(|size| (1..=8192).contains(size))
            .ok_or("dimensión de captura fuera de 1..=8192")
    };
    Ok((dimension(width)?, dimension(height)?))
}

fn parse(args: &[String]) -> Result<Options, String> {
    RawOptions::parse(args)?.finish()
}

fn main() -> ExitCode {
    if product::print_version() {
        return ExitCode::SUCCESS;
    }
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.as_slice() == ["--kit"] {
        return match vantare_hub::orbit::run_kit() {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("kit Orbit: {error}");
                ExitCode::FAILURE
            }
        };
    }
    let options = match parse(&args) {
        Ok(options) => options,
        Err(error) => {
            eprintln!(
                "{error}
uso: vantare-hub [--demo] [--workshop|--studio|--strategy|--analysis|--launcher|--engineer] [opciones locales]
     vantare-hub --capture PANTALLA --out PNG [--demo] [--size WxH] [--appearance PALETA-dark|PALETA-light]
     paletas: vantare, rose, grove, ocean, ember, iris, mono"
            );
            return ExitCode::from(2);
        }
    };
    if let Some(state) = options.capture.clone() {
        let Some(output) = options.capture_output.clone() else {
            eprintln!("vantare-hub: falta PNG de salida");
            return ExitCode::from(2);
        };
        #[cfg(feature = "parity-capture")]
        {
            return match vantare_hub::capture::run(options, state, output) {
                Ok(()) => ExitCode::SUCCESS,
                Err(error) => {
                    eprintln!("vantare-hub: {error}");
                    ExitCode::FAILURE
                }
            };
        }
        #[cfg(not(feature = "parity-capture"))]
        {
            let _ = (state, output);
            eprintln!("vantare-hub: reconstruye con --features parity-capture");
            return ExitCode::from(2);
        }
    }
    match vantare_hub::shell::run(options) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("vantare-hub: {error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_size_is_explicit_validated_and_capture_only() {
        let capture = ["--capture", "inicio-base", "--out", "capture.png"];
        let args = |extra: &[&str]| {
            capture
                .iter()
                .chain(extra)
                .map(|arg| (*arg).to_owned())
                .collect::<Vec<_>>()
        };
        assert_eq!(
            parse(&args(&[])).expect("tamaño habitual").capture_size,
            None
        );
        for (value, expected) in [("900x600", (900, 600)), ("1280x720", (1280, 720))] {
            assert_eq!(
                parse(&args(&["--size", value]))
                    .expect("tamaño explícito")
                    .capture_size,
                Some(expected)
            );
        }
        for extra in [
            vec!["--size"],
            vec!["--size", "900"],
            vec!["--size", "0x600"],
            vec!["--size", "900x-1"],
            vec!["--size", "8193x600"],
            vec!["--size", "900x600x1"],
            vec!["--size", "900x600", "--size", "1280x720"],
        ] {
            assert!(parse(&args(&extra)).is_err(), "{extra:?}");
        }
        assert!(parse(&["--size".into(), "900x600".into()]).is_err());
    }
    #[test]
    fn capture_appearance_resolves_the_requested_palette_and_scheme() {
        for (name, palette) in [
            ("vantare", Palette::Vantare),
            ("rose", Palette::Rose),
            ("grove", Palette::Grove),
            ("ocean", Palette::Ocean),
            ("ember", Palette::Ember),
            ("iris", Palette::Iris),
            ("mono", Palette::Mono),
        ] {
            for (name_scheme, scheme) in [("dark", Scheme::Dark), ("light", Scheme::Light)] {
                let options = parse(&[
                    "--capture".into(),
                    "inicio-base".into(),
                    "--out".into(),
                    "capture.png".into(),
                    "--appearance".into(),
                    format!("{name}-{name_scheme}"),
                ])
                .expect("apariencia de captura");
                let settings = options.capture_appearance.expect("apariencia explícita");
                assert_eq!(
                    settings,
                    AppearanceSettings {
                        palette,
                        scheme,
                        ..Default::default()
                    }
                );
                let theme = vantare_hub::orbit::theme::Theme::from_settings(settings);
                assert_eq!((theme.palette, theme.scheme), (palette, scheme));
            }
        }
        assert!(
            parse(&["--demo".into()])
                .expect("demo normal")
                .capture_appearance
                .is_none()
        );
        assert!(
            parse(&[
                "--capture".into(),
                "inicio-base".into(),
                "--out".into(),
                "capture.png".into()
            ])
            .expect("captura predeterminada")
            .capture_appearance
            .is_none()
        );
    }

    #[test]
    fn capture_appearance_rejects_invalid_repeated_and_non_capture_options() {
        for tail in [
            vec!["--appearance"],
            vec!["--appearance", "unknown-dark"],
            vec!["--appearance", "vantare"],
            vec!["--appearance", "vantare-system"],
            vec!["--appearance", "vantare-light-extra"],
            vec!["--appearance", "vantare-dark", "--appearance", "mono-light"],
        ] {
            let args = ["--capture", "inicio-base", "--out", "capture.png"]
                .into_iter()
                .chain(tail)
                .map(String::from)
                .collect::<Vec<_>>();
            assert!(parse(&args).is_err());
        }
        assert!(parse(&["--appearance".into(), "vantare-dark".into()]).is_err());
        assert!(parse(&["--demo".into(), "--appearance".into(), "mono-light".into()]).is_err());
    }

    #[test]
    fn options_select_local_data_and_scene_and_reject_incomplete_or_repeated_values() {
        let args = |items: &[&str]| {
            items
                .iter()
                .map(|item| (*item).into())
                .collect::<Vec<String>>()
        };
        let options = parse(&args(&[
            "--workshop",
            "--data-dir",
            "local",
            "--scene",
            "capture.jsonl",
            "--control-stdin",
            "--pipe",
            "hub-test",
            "--layout",
            "layout-local.json",
            "--engineer-settings",
            "engineer-local.json",
        ]))
        .expect("opciones");
        assert_eq!(options.section, Section::Workshop);
        assert_eq!(options.layout, PathBuf::from("layout-local.json"));
        assert_eq!(options.engineer, PathBuf::from("engineer-local.json"));
        assert!(options.controlled);
        assert_eq!(options.pipe.as_deref(), Some("hub-test"));
        assert_eq!(options.data_dir, PathBuf::from("local"));
        assert_eq!(options.scene, Some(PathBuf::from("capture.jsonl")));
        assert_eq!(
            parse(&args(&["--strategy", "--data-dir", "local"]))
                .expect("Strategy entry")
                .section,
            Section::Strategy
        );
        for bad in [
            vec!["--data-dir"],
            vec!["--recordings"],
            vec!["--recordings", "a", "--recordings", "b"],
            vec!["--analysis", "--analysis"],
            vec!["--launcher-file"],
            vec!["--launcher-file", "a", "--launcher-file", "b"],
            vec!["--launcher", "--studio"],
            vec!["--scene"],
            vec!["--layout"],
            vec!["--layout", "a", "--layout", "b"],
            vec!["--pipe"],
            vec!["--pipe", ""],
            vec!["--pipe", "a", "--pipe", "b"],
            vec!["--workshop", "--workshop"],
            vec!["--strategy", "--strategy"],
            vec!["--strategy", "--studio"],
            vec!["--control-stdin", "--control-stdin"],
            vec!["--scene", "a", "--scene", "b"],
            vec!["--engineer-settings"],
            vec!["--engineer-settings", "a", "--engineer-settings", "b"],
            vec!["--engineer", "--engineer"],
            vec!["--engineer", "--studio"],
        ] {
            assert!(parse(&args(&bad)).is_err());
        }
        let options = parse(&args(&[
            "--analysis",
            "--recordings",
            "recordings",
            "--data-dir",
            "local",
        ]))
        .expect("análisis");
        assert_eq!(options.section, Section::Analysis);
        assert_eq!(options.recordings, Some(PathBuf::from("recordings")));
    }

    #[test]
    fn launcher_selects_view_and_isolates_its_file_from_wails() {
        let args = [
            "--launcher",
            "--launcher-file",
            "local-launcher.json",
            "--data-dir",
            "hub-local",
            "--layout",
            "local-layout.json",
        ]
        .map(String::from);
        let options = parse(&args).expect("opciones Launcher");
        assert_eq!(options.section, Section::Launcher);
        assert_eq!(options.launcher_file, PathBuf::from("local-launcher.json"));
        assert!(
            vantare_hub::launcher::default_path()
                .expect("directorio de datos")
                .ends_with("Vantare/native/launcher.json")
        );
    }

    #[test]
    fn demo_opens_the_hub_with_fixture_data_without_capture_mode() {
        let options = parse(&[
            "--demo".into(),
            "--pipe".into(),
            "vantare-1437-smoke".into(),
        ])
        .expect("modo demo conectado por IPC");
        assert!(options.demo.is_some());
        assert!(options.capture.is_none());
        assert_eq!(options.section, Section::Home);
        assert_eq!(options.pipe.as_deref(), Some("vantare-1437-smoke"));
    }

    #[test]
    fn data_paths_share_the_platform_directory() {
        let root = vantare_ui::paths::default_data_dir().expect("directorio de datos");
        assert_eq!(
            vantare_ui::layout::default_path().expect("layout"),
            root.join("Vantare/native/layout.json")
        );
        assert_eq!(
            default_engineer_path().expect("Engineer"),
            root.join("Vantare/native/engineer.json")
        );
        assert_eq!(
            vantare_hub::launcher::default_path().expect("Launcher"),
            root.join("Vantare/native/launcher.json")
        );
    }

    #[test]
    fn capture_requires_reference_name_and_isolates_all_persistence_paths() {
        let args = |items: &[&str]| {
            items
                .iter()
                .map(|item| (*item).into())
                .collect::<Vec<String>>()
        };
        let options = parse(&args(&[
            "--capture",
            "inicio-base",
            "--out",
            "C:/tmp/hub-banco-evidence/inicio.png",
        ]))
        .expect("captura demo");
        assert_eq!(options.section, Section::Home);
        assert!(options.demo.is_some());
        assert!(options.data_dir.starts_with(std::env::temp_dir()));
        assert!(options.layout.starts_with(std::env::temp_dir()));
        assert!(options.engineer.starts_with(std::env::temp_dir()));
        assert!(options.launcher_file.starts_with(std::env::temp_dir()));
        assert_eq!(
            options.capture_output,
            Some(PathBuf::from("C:/tmp/hub-banco-evidence/inicio.png"))
        );
        for bad in [
            vec!["--capture", "inicio-base"],
            vec!["--capture", "no-existe", "--out", "capture.png"],
            vec![
                "--capture",
                "inicio-base",
                "--out",
                "capture.png",
                "--data-dir",
                "user-data",
            ],
            vec![
                "--capture",
                "inicio-base",
                "--out",
                "capture.png",
                "--launcher",
            ],
        ] {
            assert!(parse(&args(&bad)).is_err());
        }
    }
}
