//! El job lifecycle actual descarga GPUI, no el artefacto del job Rune.
//! En un PC Windows: VANTARE_RUNE_OVERLAYS_EXE apunta al exe Rune;
//! VANTARE_LIFECYCLE_HARNESS, al arnés runtime compilado (harness=false).
//! Los escenarios se mantienen allí para reutilizar sus hijos y ayudas reales.
#![cfg(windows)]
use std::{env, path::PathBuf, process::Command};

fn run(name: &str) {
    assert_ne!(env::var_os("VANTARE_SIN_GRAFICOS").as_deref(), Some(std::ffi::OsStr::new("1")),
        "el servidor no ejecuta Rune; usar un PC Windows con escritorio");
    let harness = PathBuf::from(env::var_os("VANTARE_LIFECYCLE_HARNESS")
        .expect("falta la ruta al arnés lifecycle de runtime"));
    let image = PathBuf::from(env::var_os("VANTARE_RUNE_OVERLAYS_EXE")
        .expect("falta la ruta a vantare-overlays-rune.exe"));
    assert!(harness.is_file(), "{}", harness.display());
    assert!(image.is_file(), "{}", image.display());
    let output = Command::new(harness).args(["rune-lifecycle", name]).output().unwrap();
    assert!(output.status.success(), "{}\n{}",
        String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
}

#[test]
#[ignore = "Requiere escritorio Windows y las rutas VANTARE_RUNE_OVERLAYS_EXE/VANTARE_LIFECYCLE_HARNESS; CI lifecycle solo descarga GPUI"]
fn rune_control_stdin_eof_is_orderly() { run("eof"); }

#[test]
#[ignore = "Requiere escritorio Windows y las rutas VANTARE_RUNE_OVERLAYS_EXE/VANTARE_LIFECYCLE_HARNESS; CI lifecycle solo descarga GPUI"]
fn rune_restarts_after_a_crash() { run("restart"); }

#[test]
#[ignore = "Requiere escritorio Windows y las rutas VANTARE_RUNE_OVERLAYS_EXE/VANTARE_LIFECYCLE_HARNESS; CI lifecycle solo descarga GPUI"]
fn rune_exit_zero_closes_the_session() { run("exit-zero"); }

#[test]
#[ignore = "Requiere escritorio Windows y las rutas VANTARE_RUNE_OVERLAYS_EXE/VANTARE_LIFECYCLE_HARNESS; CI lifecycle solo descarga GPUI"]
fn rune_session_has_a_single_instance() { run("single"); }
