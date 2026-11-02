//! Matriz previa a la sesión única (#1860, paso 0).
//! Overlays GPUI de producto, layout vacío guardado y pipes/raíces exclusivos.
//! El Hub sintético solo publica los marcadores actuales; el decisor de cierre
//! es Run-BetaHub extraído sin cambios de beta.ps1. No ejecuta instalación.
use super::{LONG, Launcher, Process, Scenario, alive, creation_time, kill, note, opt};
use std::os::windows::process::CommandExt;
use std::{
    env,
    fs::{self, File},
    io::{Read, Write},
    path::PathBuf,
    process::{Command, ExitCode, Stdio},
    time::{Duration, Instant},
};
use vantare_ipc::Subscriber;
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM},
    System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
    UI::WindowsAndMessaging::{EnumWindows, GetClassNameW, GetWindowThreadProcessId},
};

#[path = "tray_actions.rs"]
mod tray_actions;

pub(super) fn tray_hub_process(args: &[String]) -> ExitCode {
    tray_actions::hub_process(args)
}

pub(super) fn scenarios() -> Vec<(&'static str, fn())> {
    vec![
        (
            "real_overlays_stop_records_the_current_three_second_kill",
            real_stop,
        ),
        (
            "real_overlays_hub_idle_live_and_paused_characterization",
            hub_matrix,
        ),
        (
            "real_overlays_tray_hub_is_unowned_and_restart_is_unconsumed",
            tray_hub,
        ),
        (
            "real_overlays_restart_backoff_and_single_instance",
            restart_and_single,
        ),
        (
            "real_overlays_tray_close_does_not_quit_gpui",
            tray_window_close,
        ),
        (
            "real_overlays_tray_open_and_quit_leave_the_hub_alive",
            tray_open_and_quit,
        ),
        ("real_overlays_die_with_the_supervisor_job", real_job),
        (
            "normal_overlays_ignore_the_qa_handler_entry",
            normal_ignores_qa,
        ),
    ]
}

pub(super) fn fake_hub(args: &[String]) -> ExitCode {
    let root = PathBuf::from(opt(args, "--root"));
    note(
        &opt(args, "--status"),
        &format!("hub pid={}", std::process::id()),
    );
    std::io::stdin().read_to_end(&mut Vec::new()).unwrap();
    if args.iter().any(|arg| arg == "--restart") {
        fs::write(root.join("restart-request"), "1").unwrap();
    }
    fs::write(root.join("hub-exit"), opt(args, "--exit")).unwrap();
    ExitCode::SUCCESS
}

struct Real {
    launcher: Launcher,
    scenario: Scenario,
}

impl Real {
    fn start(tag: &str) -> Self {
        tray_actions::assert_shell();
        let scenario = Scenario::new(tag);
        let bin = scenario.dir.join("bin");
        fs::create_dir(&bin).unwrap();
        // El lector de derechos autentica la imagen hermana vantare-core.exe.
        // Es el núcleo sintético existente, no un overlays que finja leer stdin.
        fs::copy(env::current_exe().unwrap(), bin.join("vantare-core.exe")).unwrap();
        let variant = if tag == "tray-open-quit" {
            "qa"
        } else {
            "normal"
        };
        let overlays = PathBuf::from(env!("CARGO_BIN_EXE_vantare"))
            .parent()
            .unwrap()
            .join("lifecycle")
            .join(variant)
            .join("vantare-overlays.exe");
        assert!(
            overlays.is_file(),
            "preparar los overlays normal/QA con runtime/tests/lifecycle/build-overlays.ps1"
        );
        fs::copy(overlays, bin.join("vantare-overlays.exe")).unwrap();
        fs::copy(env::current_exe().unwrap(), bin.join("vantare-hub.exe")).unwrap();
        fs::write(
            scenario.file("layout.json"),
            r#"{"version":1,"instances":[]}"#,
        )
        .unwrap();
        let mut command = Command::new(env!("CARGO_BIN_EXE_vantare"));
        command
            .args(["--instancia", &scenario.instance, "--core-bin"])
            .arg(bin.join("vantare-core.exe"))
            .arg("--overlays-bin")
            .arg(bin.join("vantare-overlays.exe"))
            .args([
                "--",
                "fake-core",
                "--pipe",
                &scenario.pipe,
                "--status",
                &scenario.file("status"),
                "--",
                "--start-hidden",
                "--layout",
                &scenario.file("layout.json"),
            ])
            .env("VANTARE_NATIVE_DATA_ROOT", &scenario.dir)
            .env("LOCALAPPDATA", &scenario.dir)
            .stdin(Stdio::null())
            .stderr(File::create(scenario.file("launcher.log")).unwrap())
            .creation_flags(0x0800_0000);
        let launcher = Launcher(command.spawn().unwrap());
        let real = Self { launcher, scenario };
        real.ready();
        real
    }

    fn overlay(&self) -> Option<Process> {
        use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
        let pid = self
            .scenario
            .lines("launcher.log")
            .iter()
            .rev()
            .find_map(|line| {
                line.strip_prefix("vantare: overlays en marcha (pid ")?
                    .strip_suffix(')')?
                    .parse()
                    .ok()
            })?;
        // SAFETY: PID observado; OpenProcess se valida y su handle se posee una vez.
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if handle.is_null() {
            return None;
        }
        let handle = unsafe { OwnedHandle::from_raw_handle(handle) };
        Some(Process {
            pid,
            created: creation_time(handle.as_raw_handle()),
        })
    }

    fn ready(&self) -> Process {
        self.scenario
            .wait_for("bandeja del overlays REAL creada por GPUI", LONG, || {
                let process = self.overlay()?;
                tray(process.pid).map(|_| process)
            })
    }

    fn hub(&self, marker: &str, restart: bool) -> Launcher {
        let mut command = Command::new(env::current_exe().unwrap());
        command.args([
            "fake-hub",
            "--root",
            self.scenario.dir.to_str().unwrap(),
            "--status",
            &self.scenario.file("status"),
            "--exit",
            marker,
        ]);
        if restart {
            command.arg("--restart");
        }
        Launcher(
            command
                .stdin(Stdio::piped())
                .creation_flags(0x0800_0000)
                .spawn()
                .unwrap(),
        )
    }

    fn beta(&self, hub: &Launcher) -> Launcher {
        let script =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/lifecycle/beta-session.ps1");
        Launcher(
            Command::new("pwsh")
                .args(["-NoProfile", "-File"])
                .arg(script)
                .arg("-Root")
                .arg(&self.scenario.dir)
                .args([
                    "-HubPid",
                    &hub.0.id().to_string(),
                    "-SupervisorPid",
                    &self.launcher.0.id().to_string(),
                    "-Supervisor",
                    env!("CARGO_BIN_EXE_vantare"),
                    "-Instance",
                    &self.scenario.instance,
                ])
                .stderr(File::create(self.scenario.file("beta.log")).unwrap())
                .creation_flags(0x0800_0000)
                .spawn()
                .unwrap(),
        )
    }

    fn stop(&mut self) {
        self.scenario.stop();
        assert_eq!(self.scenario.exit_code(&mut self.launcher, LONG), 0);
        let log = self.scenario.lines("launcher.log");
        // CAMBIA EN PASO 1: hoy el proceso real ignora EOF y WM_CLOSE y se mata.
        assert!(
            log.iter()
                .any(|line| line.contains("overlays no terminó en 3s: se le mata")),
            "{log:?}"
        );
    }
}

fn tray(pid: u32) -> Option<HWND> {
    struct Search {
        pid: u32,
        window: HWND,
    }
    unsafe extern "system" fn visit(window: HWND, data: LPARAM) -> i32 {
        // SAFETY: EnumWindows síncrono, data apunta al Search exclusivo de abajo.
        let search = unsafe { &mut *(data as *mut Search) };
        let mut owner = 0;
        let mut class = [0_u16; 64];
        unsafe {
            GetWindowThreadProcessId(window, &raw mut owner);
        }
        if owner == search.pid {
            let len = unsafe { GetClassNameW(window, class.as_mut_ptr(), 64) };
            if String::from_utf16_lossy(&class[..usize::try_from(len).unwrap()])
                == "VantareOverlaysTray"
            {
                search.window = window;
                return 0;
            }
        }
        1
    }
    let mut search = Search {
        pid,
        window: std::ptr::null_mut(),
    };
    // SAFETY: contexto válido durante toda la enumeración síncrona.
    unsafe {
        EnumWindows(Some(visit), (&raw mut search) as LPARAM);
    }
    (!search.window.is_null()).then_some(search.window)
}

fn real_stop() {
    let mut real = Real::start("real-stop");
    let overlays = real.ready();
    real.stop();
    assert!(!alive(overlays));
    assert_eq!(
        fs::read_to_string(real.scenario.file("layout.json")).unwrap(),
        r#"{"version":1,"instances":[]}"#
    );
}

fn hub_matrix() {
    use vantare_domain::SourceState;
    // CAMBIA EN PASO 4: Paused/Stale de una carrera ya no deberán parar overlays.
    for (state, marker, stops) in [
        (SourceState::Waiting, "idle", true),
        (SourceState::Live, "live", false),
        (SourceState::Paused, "idle", true),
        (SourceState::Stale, "idle", true),
        (SourceState::Lost, "idle", true),
    ] {
        // Son las salidas actuales del Hub falso. El predicado real y su
        // flanco se prueban en hub::lifecycle, sin importar fuente entre crates.
        let mut real = Real::start(&format!("hub-{state:?}"));
        let process = real.ready();
        let mut hub = real.hub(marker, false);
        // Un reinicio que dejó un Hub de bandeja se descarta al arrancar beta.
        fs::write(real.scenario.file("restart-request"), "1").unwrap();
        let mut beta = real.beta(&hub);
        real.scenario
            .wait_for("bucle de producto observa Hub", LONG, || {
                real.scenario
                    .lines("beta-actions")
                    .contains(&"stage".into())
                    .then_some(())
            });
        assert!(!real.scenario.dir.join("restart-request").exists());
        if state == SourceState::Waiting {
            let mut second = real.beta(&hub);
            assert_ne!(real.scenario.exit_code(&mut second, LONG), 0);
            assert_eq!(
                real.scenario
                    .lines("beta-actions")
                    .iter()
                    .filter(|line| *line == "hub")
                    .count(),
                1,
                "el segundo arranque choca con beta-session.lock, no abre ni enfoca otro Hub"
            );
            assert!(alive(process));
        }
        drop(hub.0.stdin.take());
        assert!(hub.0.wait().unwrap().success());
        assert_eq!(
            real.scenario.exit_code(&mut beta, LONG),
            0,
            "{:?}",
            real.scenario.lines("beta.log")
        );
        assert_eq!(
            real.scenario.lines("beta-actions").contains(&"stop".into()),
            stops
        );
        if stops {
            assert_eq!(real.scenario.exit_code(&mut real.launcher, LONG), 0);
            assert!(!alive(process));
            assert!(
                real.scenario
                    .lines("launcher.log")
                    .iter()
                    .any(|line| line.contains("overlays no terminó en 3s"))
            );
        } else {
            assert!(alive(process));
            real.stop();
        }
    }
}

fn tray_hub() {
    let mut real = Real::start("tray-hub");
    let overlays = real.ready();
    // Hub abierto fuera del dueño beta, como CREATE_BREAKAWAY_FROM_JOB en tray.rs.
    let mut hub = real.hub("idle", true);
    drop(hub.0.stdin.take());
    assert!(hub.0.wait().unwrap().success());
    assert_eq!(
        fs::read_to_string(real.scenario.file("hub-exit")).unwrap(),
        "idle"
    );
    assert!(real.scenario.dir.join("restart-request").is_file());
    // Barrera observable: el supervisor sigue publicando, no una espera arbitraria.
    let mut watcher = Subscriber::connect(&real.scenario.pipe, |_| true).unwrap();
    real.scenario.assert_core_progresses(&mut watcher);
    assert!(alive(overlays));
    assert!(real.launcher.0.try_wait().unwrap().is_none());
    // CAMBIA EN PASO 4: cerrar/reiniciar desde ese Hub tendrá dueño único.
    real.stop();
}

fn restart_and_single() {
    let mut real = Real::start("real-restart-single");
    let first = real.ready();
    let core = real.scenario.starts("core");
    let began = Instant::now();
    kill(first);
    let next = real
        .scenario
        .wait_for("overlays REAL rearrancado", LONG, || {
            let process = real.overlay()?;
            (process != first && tray(process.pid).is_some()).then_some(process)
        });
    assert!(began.elapsed() >= Duration::from_millis(250));
    let began = Instant::now();
    kill(next);
    let next = real
        .scenario
        .wait_for("segundo rearranque REAL con backoff", LONG, || {
            let process = real.overlay()?;
            (process != next && tray(process.pid).is_some()).then_some(process)
        });
    assert!(began.elapsed() >= Duration::from_millis(500));
    let log = real.scenario.lines("launcher.log");
    assert!(
        log.iter()
            .any(|line| line.contains("overlays: reinicio en 250ms")),
        "{log:?}"
    );
    assert!(
        log.iter()
            .any(|line| line.contains("overlays: reinicio en 500ms")),
        "{log:?}"
    );
    assert_eq!(real.scenario.starts("core"), core);
    for with_hub in [false, true] {
        let _hub = with_hub.then(|| real.hub("idle", false));
        let status = Command::new(env!("CARGO_BIN_EXE_vantare"))
            .args(["--instancia", &real.scenario.instance])
            .env("VANTARE_NATIVE_DATA_ROOT", &real.scenario.dir)
            .env("LOCALAPPDATA", &real.scenario.dir)
            .creation_flags(0x0800_0000)
            .status()
            .unwrap();
        assert!(status.success());
        assert_eq!(real.ready(), next);
        assert_eq!(real.scenario.starts("core"), core);
    }
    real.stop();
}

fn tray_window_close() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_CLOSE};
    let mut real = Real::start("tray-window-close");
    let process = real.ready();
    // El supervisor actual manda esto además de cerrar stdin. Cerrar la bandeja
    // retira su icono pero no envía Action::Quit al host GPUI (paso 1 usa EOF).
    let window = tray(process.pid).unwrap();
    // SAFETY: HWND observado del hijo propio; mensaje sin punteros.
    assert_ne!(unsafe { PostMessageW(window, WM_CLOSE, 0, 0) }, 0);
    real.scenario.wait_for("bandeja retirada", LONG, || {
        tray(process.pid).is_none().then_some(())
    });
    assert!(alive(process));
    real.stop();
}

fn real_job() {
    let real = Real::start("real-job");
    let overlay = real.ready();
    let core = real.scenario.starts("core")[0].0;
    drop(real.launcher);
    real.scenario
        .wait_for("overlays REAL y núcleo muertos por Job", LONG, || {
            (!alive(overlay) && !alive(core)).then_some(())
        });
}

fn tray_open_and_quit() {
    tray_actions::assert_no_existing_hub();
    let mut real = Real::start("tray-open-quit");
    let overlay = real.ready();
    assert_eq!(tray_actions::invoke(&real, 2), 1); // Abrir Hub, manejador real.
    let hub = real
        .scenario
        .wait_for("Hub abierto por la bandeja REAL", LONG, || {
            real.scenario.starts("hub").first().copied()
        })
        .0;
    let _hub_guard = tray_actions::HubGuard(hub);
    assert!(alive(hub));
    assert_eq!(tray_actions::invoke(&real, 2), 1); // Restaura, no duplica.
    real.scenario
        .wait_for("Hub existente restaurado por bandeja", LONG, || {
            tray_actions::hub_visible(hub.pid).then_some(())
        });
    let mut watcher = Subscriber::connect(&real.scenario.pipe, |_| true).unwrap();
    real.scenario.assert_core_progresses(&mut watcher);
    assert_eq!(real.scenario.starts("hub").len(), 1);
    tray_actions::close_hub(hub.pid);
    real.scenario
        .wait_for("X del Hub de bandeja", LONG, || (!alive(hub)).then_some(()));
    real.scenario.assert_core_progresses(&mut watcher);
    assert!(
        alive(overlay),
        "CAMBIA EN PASO 4: el Hub de bandeja no para la sesión"
    );
    assert_eq!(tray_actions::invoke(&real, 2), 1);
    let hub = real
        .scenario
        .wait_for("Hub reabierto por bandeja", LONG, || {
            real.scenario.starts("hub").get(1).copied()
        })
        .0;
    let _second_hub_guard = tray_actions::HubGuard(hub);
    assert_eq!(tray_actions::invoke(&real, 3), 1); // Salir → cx.quit() real.
    assert_eq!(real.scenario.exit_code(&mut real.launcher, LONG), 0);
    assert!(!alive(overlay));
    assert!(
        alive(hub),
        "CAMBIA EN PASO 4: hoy Salir deja el Hub fuera del Job"
    );
    assert!(
        !real
            .scenario
            .lines("launcher.log")
            .iter()
            .any(|line| line.contains("overlays no terminó"))
    );
    tray_actions::close_hub(hub.pid);
    real.scenario
        .wait_for("Hub falso cerrado", LONG, || (!alive(hub)).then_some(()));
}

fn normal_ignores_qa() {
    let mut real = Real::start("qa-disabled");
    let overlay = real.ready();
    assert_eq!(tray_actions::invoke(&real, 2), 0);
    assert_eq!(tray_actions::invoke(&real, 3), 0);
    assert!(real.scenario.starts("hub").is_empty());
    assert!(
        alive(overlay),
        "el binario normal no tiene entrada de prueba"
    );
    real.stop();
}

/// Prueba opt-in para Isaac: nunca se ejecuta por el gate automático.
pub(super) fn manual_tray() -> ExitCode {
    tray_actions::assert_no_existing_hub();
    let mut real = Real::start("manual-tray");
    let overlay = real.ready();
    println!(
        "PRUEBA MANUAL: raíz temporal {}",
        real.scenario.dir.display()
    );
    println!(
        "Supervisor PID {}, overlays normal PID {}",
        real.launcher.0.id(),
        overlay.pid
    );
    println!("En su icono, clic físico → Abrir Hub. Después pulsa Intro aquí.");
    std::io::stdout().flush().unwrap();
    if std::io::stdin().read_line(&mut String::new()).unwrap() == 0 {
        return ExitCode::FAILURE;
    }
    let hub = real
        .scenario
        .wait_for("Abrir Hub físico", LONG, || {
            real.scenario.starts("hub").first().copied()
        })
        .0;
    let _hub_guard = tray_actions::HubGuard(hub);
    assert!(alive(hub));
    println!(
        "Hub falso PID {} abierto (ventana de prueba sin contenido).",
        hub.pid
    );
    println!("En el mismo icono, clic físico → Salir de Vantare. Después pulsa Intro.");
    std::io::stdout().flush().unwrap();
    if std::io::stdin().read_line(&mut String::new()).unwrap() == 0 {
        return ExitCode::FAILURE;
    }
    assert_eq!(real.scenario.exit_code(&mut real.launcher, LONG), 0);
    assert!(!alive(overlay));
    assert!(alive(hub), "comportamiento actual: Hub fuera del Job");
    tray_actions::close_hub(hub.pid);
    real.scenario.wait_for("Hub de prueba cerrado", LONG, || {
        (!alive(hub)).then_some(())
    });
    println!("MANUAL PASS: clic Abrir Hub y clic Salir, binario normal; sin instalación real.");
    ExitCode::SUCCESS
}
