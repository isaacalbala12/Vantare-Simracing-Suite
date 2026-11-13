#![cfg_attr(windows, windows_subsystem = "windows")]
//! Never run on the server, including version queries.
use rune::{App, AppSpec, RunOptions, WindowSpec};
use std::io::{Read, Write};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use vantare_inicio_rune::{FONTS, State, assets_ready, setup, view};
const PROVENANCE: &str = concat!(
    "VANTARE_BUILD;sha=",
    env!("VANTARE_BUILD_SHA"),
    ";dirty=",
    env!("VANTARE_BUILD_DIRTY"),
    ";rune=d5338988a7c1b3377adb60853815b6d0843dae7c;rust=",
    env!("VANTARE_BUILD_RUST"),
    ";profile=release;opt-level=3;lto=false;codegen-units=16;debug=false;features=default;scenario=inicio-base-collapsed"
);
fn main() -> std::process::ExitCode {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args != ["--medicion-inicio", "--control-stdin"] {
        eprintln!("uso: --medicion-inicio --control-stdin");
        return std::process::ExitCode::from(2);
    }
    eprintln!("{PROVENANCE}");
    let ready_path =
        std::env::var_os("VANTARE_MEASUREMENT_READY_FILE").map(std::path::PathBuf::from);
    if ready_path.as_ref().is_some_and(|path| !path.is_absolute()) {
        eprintln!("ruta de medición no absoluta");
        return std::process::ExitCode::from(2);
    }
    let failed = Arc::new(AtomicBool::new(false));
    let report_failure = failed.clone();
    rune::run_windows_with(RunOptions::default(), move |_| {
        let spec = AppSpec {
            fonts: FONTS,
            families: ("Inter", "Space Mono"),
            setup: Some(setup),
            min_size: Some((1280.0, 720.0)),
            ..AppSpec::new(
                "Vantare · Inicio Rune",
                (1440.0, 900.0),
                State::default,
                view,
            )
        };
        let app = App::new(spec);
        let ready_handle = app.handle();
        let mut marked = false;
        let app = app.on_frame_drawn(move |runtime| {
            if !marked && assets_ready(&runtime.state) {
                marked = true;
                if let Some(path) = &ready_path {
                    let result = std::fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(path)
                        .and_then(|mut file| file.write_all(br#"{"ready":true,"engine":"rune"}"#));
                    if let Err(error) = result {
                        eprintln!("VANTARE_MEASUREMENT_READY_FAILED: {error}");
                        report_failure.store(true, Ordering::Release);
                        ready_handle.quit();
                    }
                }
            }
        });
        let handle = app.handle();
        std::thread::Builder::new()
            .name("rune-parent-watch".into())
            .spawn(move || {
                let mut buffer = [0u8; 256];
                loop {
                    match std::io::stdin().read(&mut buffer) {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {}
                    }
                }
                handle.quit();
            })
            .expect("stdin supervisor");
        vec![WindowSpec::from_app("rune-inicio", app)]
    });
    if failed.load(Ordering::Acquire) {
        std::process::ExitCode::from(2)
    } else {
        std::process::ExitCode::SUCCESS
    }
}
