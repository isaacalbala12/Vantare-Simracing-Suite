#![cfg_attr(windows, windows_subsystem = "windows")]
//! Never run on the server, including version queries.
use rune::{App, AppSpec, RunOptions, WindowSpec};
use std::io::Read;
use vantare_inicio_rune::{FONTS, State, setup, view};
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
    std::process::ExitCode::SUCCESS
}
