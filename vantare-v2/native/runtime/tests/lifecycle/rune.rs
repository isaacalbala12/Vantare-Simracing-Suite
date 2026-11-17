//! Escenarios opt-in del proceso Rune real. Nunca se añaden a la tanda GPUI.
use super::{LONG, Real, alive, kill};
use std::os::windows::process::CommandExt;
use std::{
    env,
    ffi::OsStr,
    process::{Command, ExitCode},
    time::{Duration, Instant},
};
use windows_sys::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_CLOSE};

pub(super) fn run(name: &str) -> ExitCode {
    assert_ne!(
        env::var_os("VANTARE_SIN_GRAFICOS").as_deref(),
        Some(OsStr::new("1")),
        "prohibido ejecutar gráficos en el servidor"
    );
    match name {
        "eof" => eof(),
        "restart" => restart(),
        "exit-zero" => exit_zero(),
        "single" => single(),
        _ => panic!("escenario Rune desconocido: {name}"),
    }
    ExitCode::SUCCESS
}

fn eof() {
    let mut real = Real::start_rune("rune-eof");
    let overlay = real.ready();
    let core = real.scenario.starts("core")[0].0;
    real.stop(); // El launcher cierra stdin (--control-stdin), sin matar al hijo.
    assert!(!alive(overlay));
    assert!(!alive(core));
}

fn restart() {
    let mut real = Real::start_rune("rune-restart");
    let mut overlay = real.ready();
    let core = real.scenario.starts("core");
    for delay in [250, 500] {
        let began = Instant::now();
        kill(overlay);
        let next = real.ready();
        assert_ne!(overlay, next);
        assert!(began.elapsed() >= Duration::from_millis(delay));
        let expected = format!("overlays: reinicio en {delay}ms");
        assert!(
            real.scenario
                .lines("launcher.log")
                .iter()
                .any(|line| line.contains(&expected))
        );
        assert_eq!(real.scenario.starts("core"), core);
        overlay = next;
    }
    real.stop();
    assert!(!alive(overlay));
}

fn exit_zero() {
    let mut real = Real::start_rune("rune-zero");
    let overlay = real.ready();
    let core = real.scenario.starts("core")[0].0;
    let window = super::rune_window(overlay.pid).unwrap();
    // Ventana propia oculta. WM_CLOSE recorre host::close y termina Rune con 0.
    // SAFETY: HWND del hijo identificado por PID; el mensaje no lleva punteros.
    assert_ne!(unsafe { PostMessageW(window, WM_CLOSE, 0, 0) }, 0);
    assert_eq!(real.scenario.exit_code(&mut real.launcher, LONG), 0);
    real.assert_clean_shutdown();
    assert!(!alive(overlay));
    assert!(!alive(core));
    assert!(
        !real
            .scenario
            .lines("launcher.log")
            .iter()
            .any(|line| line.contains("overlays: reinicio"))
    );
}

fn single() {
    let mut real = Real::start_rune("rune-single");
    let overlay = real.ready();
    let core = real.scenario.starts("core");
    let status = Command::new(super::super::launcher_exe())
        .args(["--instancia", &real.scenario.instance, "--overlays-bin"])
        .arg(real.scenario.dir.join("bin/vantare-overlays-rune.exe"))
        .env("VANTARE_NATIVE_DATA_ROOT", &real.scenario.dir)
        .env("LOCALAPPDATA", &real.scenario.dir)
        .creation_flags(0x0800_0000)
        .status()
        .unwrap();
    assert!(status.success());
    assert_eq!(real.ready(), overlay);
    assert_eq!(real.scenario.starts("core"), core);
    assert_eq!(
        real.scenario
            .lines("launcher.log")
            .iter()
            .filter(|line| line.starts_with("vantare: overlays en marcha (pid "))
            .count(),
        1
    );
    real.stop();
}
