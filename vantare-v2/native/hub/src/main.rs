#![cfg_attr(windows, windows_subsystem = "windows")]
#![forbid(unsafe_code)]

use std::io::Write;
use vantare_ipc::product;

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use vantare_hub::orbit::theme::{AppearanceSettings, Palette, Scheme};
use vantare_hub::{Section, shell::Options};

fn log_start_error(generation: Option<&Path>, error: &str) {
    let path = generation
        .filter(|root| root.join("data").is_dir())
        .map_or_else(
            || std::env::temp_dir().join(format!("VantareHub-{}.log", std::process::id())),
            |generation| generation.join("data/hub-startup.log"),
        );
    let mut options = std::fs::OpenOptions::new();
    if let Ok(mut log) = options.create(true).append(true).open(path) {
        let _written = writeln!(log, "{error}");
    }
}

fn redirect_installed_hub(
    executable: &Path,
    data_root: Option<&std::ffi::OsStr>,
) -> Option<ExitCode> {
    let generation = vantare_hub::installed_generation(executable)?;
    let data = std::fs::canonicalize(generation.join("data"))
        .map_err(|error| log_start_error(Some(generation), &format!("raíz de datos: {error}")))
        .ok();
    let supplied = data_root.and_then(|root| std::fs::canonicalize(Path::new(root)).ok());
    if data.is_some() && data == supplied {
        return None;
    }
    let root = generation.ancestors().nth(2).expect("generación instalada");
    if std::env::var("VANTARE_HUB_REDIRECTED").as_deref() == Ok("1") {
        log_start_error(
            Some(generation),
            "abre Vantare desde su acceso directo: redirección repetida",
        );
        return Some(ExitCode::FAILURE);
    }
    let launcher = root.join("Vantare.exe");
    if let Err(error) = std::process::Command::new(&launcher)
        .arg("--root")
        .arg("-Root")
        .arg(root)
        .current_dir(root)
        .env_remove("VANTARE_NATIVE_DATA_ROOT")
        .env_remove("VANTARE_BOOT_TOKEN")
        .env_remove("VANTARE_BETA_ROOT")
        .env_remove("VANTARE_APPEARANCE_FILE")
        .env_remove("VANTARE_BACKGROUND_STARTUP")
        .env_remove("VANTARE_INTERACTIVE_STARTUP")
        .env("VANTARE_HUB_REDIRECTED", "1")
        .spawn()
    {
        let message = format!("abre Vantare desde su acceso directo: {error}");
        log_start_error(Some(generation), &message);
        return Some(ExitCode::FAILURE);
    }
    Some(ExitCode::SUCCESS)
}

fn capture_appearance(value: &str) -> Result<AppearanceSettings, String> {
    let (palette, scheme) = value
        .split_once('-')
        .ok_or("apariencia requiere paleta-esquema")?;
    let palette = match palette {
        "vantare" => Palette::Vantare,
        "classic" => Palette::Classic,
        "deepseek" => Palette::DeepSeek,
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
    demo: bool,
    data_dir: Option<PathBuf>,
    layout: Option<PathBuf>,
    engineer: Option<PathBuf>,
    launcher_file: Option<PathBuf>,
) -> Result<(PathBuf, PathBuf, PathBuf, PathBuf), String> {
    let demo_root = if demo && capture_root.is_none() && data_dir.is_none() {
        Some(
            std::env::temp_dir()
                .join("vantare-hub-demo")
                .join(vantare_services::random_id().map_err(|error| error.to_string())?),
        )
    } else {
        None
    };
    let data_dir = data_dir.or_else(|| demo_root.as_ref().map(|root| root.join("data")));
    let layout = layout.or_else(|| demo_root.as_ref().map(|root| root.join("layout.json")));
    let engineer = engineer.or_else(|| demo_root.as_ref().map(|root| root.join("engineer.json")));
    let launcher_file =
        launcher_file.or_else(|| demo_root.as_ref().map(|root| root.join("launcher.json")));
    let data_dir = if let Some(root) = capture_root {
        root.join("data")
    } else {
        match data_dir {
            Some(path) => path,
            None => vantare_ipc::paths::Root::from_env()
                .map_err(|error| error.to_string())?
                .hub(),
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
    vantare_ipc::paths::Root::from_env()
        .map(|root| root.engineer())
        .map_err(|error| error.to_string())
}

#[allow(clippy::struct_excessive_bools)] // Banderas independientes de la línea de órdenes.
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
    capture_collapsed: bool,
    capture_zoom: Option<u16>,
    demo_requested: bool,
}

impl RawOptions {
    #[allow(clippy::too_many_lines)] // Una rama por argumento; dividirla no la aclara.
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
            capture_collapsed: false,
            capture_zoom: None,
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
                "--collapsed" if !parsed.capture_collapsed => parsed.capture_collapsed = true,
                "--zoom" if parsed.capture_zoom.is_none() => {
                    let zoom = args
                        .next()
                        .and_then(|value| value.parse::<u16>().ok())
                        .filter(|zoom| matches!(zoom, 90 | 100 | 110 | 125))
                        .ok_or("--zoom admite 90, 100, 110 o 125")?;
                    parsed.capture_zoom = Some(zoom);
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
            capture_collapsed,
            capture_zoom,
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
        if (capture_collapsed || capture_zoom.is_some()) && capture_name.is_none() {
            return Err("--collapsed y --zoom requieren --capture".into());
        }
        let mut capture = capture_name
            .as_deref()
            .map(vantare_hub::demo::CaptureState::parse)
            .transpose()?;
        if capture_collapsed && let Some(capture) = capture.as_mut() {
            capture.sidebar = Some(false);
            capture.column_open = false;
        }
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
            demo_requested,
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
            capture_zoom,
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

#[cfg(feature = "parity-capture")]
fn capture_batch(path: &Path) -> Result<(), String> {
    let requests = vantare_ui::capture_batch::read(path)?;
    let mut options = Vec::new();
    for request in requests {
        if request.widget.is_some() || request.settings.is_some() || request.until.is_some() {
            return Err("widget/settings/until son del Workshop".into());
        }
        let mut args = vec![
            "--capture".into(),
            request.scene,
            "--out".into(),
            request.output.to_string_lossy().into_owned(),
        ];
        if let Some(appearance) = request.appearance {
            args.extend(["--appearance".into(), appearance]);
        }
        if let Some([w, h]) = request.size {
            args.extend(["--size".into(), format!("{w}x{h}")]);
        }
        if let Some(zoom) = request.zoom {
            args.extend(["--zoom".into(), zoom.to_string()]);
        }
        if request.collapsed {
            args.push("--collapsed".into());
        }
        let mut parsed = parse(&args)?;
        if let Some(state) = parsed.capture.as_mut() {
            if request.parameters.keys().any(|key| key != "calendar")
                || (!request.parameters.is_empty() && !state.name.starts_with("calendario-r6-"))
            {
                return Err("parameters solo admite calendar en escenas calendario-r6-*".into());
            }
            state.parameters = request.parameters;
        }
        options.push(parsed);
    }
    vantare_hub::capture::run_many(options)
}

#[allow(clippy::too_many_lines)] // El probe QA sale antes de abrir ventana; conserva el arranque en un punto.
fn main() -> ExitCode {
    let Ok(executable) = std::env::current_exe()
        .and_then(|path| vantare_hub::canonical_executable(&path))
        .inspect_err(|error| log_start_error(None, &format!("resolver ejecutable: {error}")))
    else {
        return ExitCode::FAILURE;
    };
    if let Some(result) = redirect_installed_hub(
        &executable,
        std::env::var_os("VANTARE_NATIVE_DATA_ROOT").as_deref(),
    ) {
        return result;
    }
    #[cfg(feature = "installer-qa")]
    if std::env::args().nth(1).as_deref() == Some("--qa-data-root") {
        let result = parse(&[]);
        if let Err(error) = &result {
            eprintln!("{error}");
        }
        if let Ok(options) = result
            && vantare_installer::engine::context::qa_path(&options.data_dir).is_ok()
        {
            println!("{}", options.data_dir.display());
            return ExitCode::SUCCESS;
        }
        return ExitCode::FAILURE;
    }
    if product::print_version() {
        return ExitCode::SUCCESS;
    }
    vantare_services::diagnostics::install_panic_hook("vantare-hub");
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let [flag, path] = args.as_slice()
        && flag == "--capture-batch"
    {
        #[cfg(feature = "parity-capture")]
        return match capture_batch(std::path::Path::new(path)) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                let _written = writeln!(std::io::stderr(), "vantare-hub: {error}");
                ExitCode::FAILURE
            }
        };
        #[cfg(not(feature = "parity-capture"))]
        {
            let _ = path;
            let _written = writeln!(
                std::io::stderr(),
                "reconstruye con --features parity-capture"
            );
            return ExitCode::from(2);
        }
    }
    if args.as_slice() == ["--kit"] {
        return match vantare_hub::orbit::run_kit() {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                let _written = writeln!(std::io::stderr(), "kit Orbit: {error}");
                ExitCode::FAILURE
            }
        };
    }
    let options = match parse(&args) {
        Ok(options) => options,
        Err(error) => {
            let _written = writeln!(std::io::stderr(),
                "{error}
uso: vantare-hub [--demo] [--workshop|--studio|--strategy|--analysis|--launcher|--engineer] [opciones locales]
     vantare-hub --capture PANTALLA --out PNG [--demo] [--size WxH] [--zoom 125] [--collapsed] [--appearance PALETA-dark|PALETA-light]
     paletas: vantare, classic, deepseek, rose, grove, ocean, ember, iris, mono"
            );
            return ExitCode::from(2);
        }
    };
    if let Some(state) = options.capture.clone() {
        let Some(output) = options.capture_output.clone() else {
            let _written = writeln!(std::io::stderr(), "vantare-hub: falta PNG de salida");
            return ExitCode::from(2);
        };
        #[cfg(feature = "parity-capture")]
        {
            return match vantare_hub::capture::run(options, state, output) {
                Ok(()) => ExitCode::SUCCESS,
                Err(error) => {
                    let _written = writeln!(std::io::stderr(), "vantare-hub: {error}");
                    ExitCode::FAILURE
                }
            };
        }
        #[cfg(not(feature = "parity-capture"))]
        {
            let _ = (state, output);
            let _written = writeln!(
                std::io::stderr(),
                "vantare-hub: reconstruye con --features parity-capture"
            );
            return ExitCode::from(2);
        }
    }
    match vantare_hub::shell::run(options) {
        Ok(code) => ExitCode::from(code),
        Err(error) => {
            let _written = writeln!(std::io::stderr(), "vantare-hub: {error}");
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
            ("classic", Palette::Classic),
            ("deepseek", Palette::DeepSeek),
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
    fn demo_without_data_dir_defaults_all_documents_to_a_fresh_qa_directory() {
        let first = parse(&["--demo".into()]).expect("QA demo");
        let second = parse(&["--demo".into()]).expect("another QA demo");
        assert_ne!(first.data_dir, second.data_dir);
        let qa = first.data_dir.parent().expect("QA parent");
        assert!(qa.starts_with(std::env::temp_dir().join("vantare-hub-demo")));
        assert_eq!(first.layout, qa.join("layout.json"));
        assert_eq!(first.engineer, qa.join("engineer.json"));
        assert_eq!(first.launcher_file, qa.join("launcher.json"));
        assert!(!qa.exists(), "argument parsing performs no writes");
        let explicit = parse(&["--demo".into(), "--data-dir".into(), "qa-explicit".into()])
            .expect("explicit QA directory");
        assert_eq!(explicit.data_dir, PathBuf::from("qa-explicit"));
    }

    #[test]
    fn calendar_writer_and_reader_share_beta_layout_path() {
        let root = std::env::temp_dir().join("vantare-calendar-beta-contract");
        let data = root.join("data");
        let options = parse(&[
            "--data-dir".into(),
            data.join("hub").to_string_lossy().into_owned(),
            "--layout".into(),
            data.join("Vantare/native/layout.json")
                .to_string_lossy()
                .into_owned(),
        ])
        .expect("argumentos de la generación Rust");
        // El overlay no recibe --layout: lo resuelve desde la raíz heredada.
        let overlay_layout = data.join("Vantare/native/layout.json");
        let expected = root.join("data/Vantare/native/session-alerts-feed.json");
        assert_eq!(
            vantare_hub::calendar::Calendar::alert_path(&options.layout),
            expected
        );
        assert_eq!(
            vantare_ui::session_alerts::calendar::path_for_layout(&overlay_layout),
            expected
        );
        assert_ne!(expected.parent(), Some(options.data_dir.as_path()));
    }

    #[test]
    fn calendar_without_overrides_uses_the_platform_native_directory() {
        let root = vantare_ui::paths::default_data_dir().expect("raíz de datos");
        let expected_layout = root.join("Vantare/native/layout.json");
        let expected_feed = root.join("Vantare/native/session-alerts-feed.json");
        let hub = parse(&[]).expect("Hub sin overrides");
        let overlay_layout = vantare_ui::layout::default_path().expect("overlay sin overrides");
        assert_eq!(hub.layout, expected_layout);
        assert_eq!(overlay_layout, expected_layout);
        assert_eq!(
            vantare_hub::calendar::Calendar::alert_path(&hub.layout),
            expected_feed
        );
        assert_eq!(
            vantare_ui::session_alerts::calendar::path_for_layout(&overlay_layout),
            expected_feed
        );
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
