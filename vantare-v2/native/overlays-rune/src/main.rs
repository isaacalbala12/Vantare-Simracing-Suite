#![cfg_attr(windows, windows_subsystem = "windows")]
use std::{ffi::OsStr, process::ExitCode};
use vantare_overlays_rune::{
    feed::DataFeed,
    host::{self, Rights, Shared},
    options::{self, Source},
    supervisor::Supervisor,
};

const GRAPHICS_DISABLED: &str = "Overlays Rune: gráficos desactivados por VANTARE_SIN_GRAFICOS; no se crea ventana ni dispositivo.";

// No inicializar Rune, leer sus argumentos ni crear hilos antes de este guard.
fn main() -> ExitCode {
    if graphics_disabled(std::env::var_os("VANTARE_SIN_GRAFICOS").as_deref()) {
        eprintln!("{GRAPHICS_DISABLED}");
        return ExitCode::FAILURE;
    }

    match start() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("overlays-rune: {error}");
            ExitCode::FAILURE
        }
    }
}

fn start() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.first().is_some_and(|a| a == "--capture-scene") {
        // Same binary, before supervisor, feed, rights, App or window creation.
        return vantare_overlays_rune::standings::capture::run(&args[1..]);
    }
    let options = options::parse(args)?;
    // La campaña numérica llega con los pintores; nunca ignorar esa opción.
    if options.benchmark_count.is_some() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "campañas pendientes de los pintores Relative",
        )
        .into());
    }
    let shared = Shared::new(options.source == Source::Local);
    let _parent = options
        .controlled
        .then(|| Supervisor::stdin(shared.clone()))
        .transpose()?;
    let _rights = match &options.source {
        Source::Local => None,
        Source::Pipe(name) => {
            let name = name
                .clone()
                .map_or_else(vantare_ipc::default_pipe_name, Ok)?;
            let core = std::env::current_exe()?.with_file_name("vantare-core.exe");
            Some(Rights::start(
                vantare_ipc::control::Feed::connect(&name, core)?,
                shared.clone(),
            )?)
        }
    };
    if shared.close_reason().is_some() {
        return Ok(());
    }
    let path = options
        .layout
        .map_or_else(vantare_ipc::layout::default_path, Ok)?;
    let appearance = std::env::var_os("VANTARE_APPEARANCE_FILE").map(std::path::PathBuf::from);
    let _data = DataFeed::start(
        options.source,
        path,
        appearance,
        options.start_hidden,
        shared.clone(),
    )?;
    host::run(shared, options.start_hidden).map_err(Into::into)
}

fn graphics_disabled(value: Option<&OsStr>) -> bool {
    value == Some(OsStr::new("1"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Cx, El, Env, Runtime, col, text};

    #[test]
    fn server_guard_rejects_graphics_without_reading_arguments() {
        assert!(graphics_disabled(Some(OsStr::new("1"))));
        assert!(!graphics_disabled(None));
        assert!(!graphics_disabled(Some(OsStr::new("0"))));
    }

    // Runtime calcula layout y accesibilidad en CPU; no usar rune::run, App,
    // ventanas ni Painter/preview GPU dentro del servidor o de la CI.
    #[test]
    fn rune_layout_is_available_without_a_window_or_device() {
        fn view(_: &(), _: &mut Cx<()>) -> El {
            col()
                .w_full()
                .h_full()
                .child(text("Relative").key("widget"))
        }
        let mut runtime = Runtime::new((), view, (320.0, 200.0), Env::new(true, 1.0));
        runtime.frame(0.0);
        assert!(runtime.find("widget").is_some());
    }
}
