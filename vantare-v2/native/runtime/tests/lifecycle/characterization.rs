//! Matriz del lanzador y las decisiones de sesión Rust (#1860).
//! Overlays GPUI de producto, layout vacío guardado y pipes/raíces exclusivos.
//! El Hub sintético solo publica los marcadores actuales; el decisor de cierre
//! no ejecuta instalación.
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
            "real_overlays_stop_exits_cleanly_on_eof_before_deadline",
            real_stop,
        ),
        ("rust_session_hub_close_respects_live_state", hub_matrix),
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
        (
            "rust_session_restart_request_starts_a_new_session",
            beta_restart_live,
        ),
        (
            "rust_session_crashed_hub_retries_without_stopping_overlays",
            beta_hub_crash,
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

    fn stop(&mut self) {
        let began = Instant::now();
        self.scenario.stop();
        assert_eq!(self.scenario.exit_code(&mut self.launcher, LONG), 0);
        self.assert_clean_shutdown();
        eprintln!(
            "cierre EOF de overlays real: {} ms",
            began.elapsed().as_millis()
        );
    }

    fn assert_clean_shutdown(&self) {
        let log = self.scenario.lines("launcher.log");
        assert!(
            !log.iter().any(|line| line.contains("se le mata")),
            "{log:?}"
        );
        assert_eq!(
            log.iter()
                .filter(|line| line.as_str() == "vantare-overlays: on_app_quit completado")
                .count(),
            1,
            "el gancho de uso/analítica terminó una vez: {log:?}"
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
    for cycle in 0..3 {
        let mut real = Real::start(&format!("real-stop-{cycle}"));
        let overlays = real.ready();
        real.stop();
        assert!(!alive(overlays));
        assert_eq!(
            fs::read_to_string(real.scenario.file("layout.json")).unwrap(),
            r#"{"version":1,"instances":[]}"#
        );
    }
}

fn hub_matrix() {
    use super::session::{Action, Event, Policy, Reason, Session};
    use vantare_domain::SourceState;
    for state in [
        SourceState::Waiting,
        SourceState::Live,
        SourceState::Paused,
        SourceState::Stale,
        SourceState::Lost,
    ] {
        let now = Instant::now();
        let mut session = Session::new(
            [Policy::core(2), Policy::consumer(2), Policy::consumer(2)],
            Duration::from_secs(5),
            now,
        );
        assert_eq!(
            session.paso(
                Event::Tick {
                    permitted: true,
                    workers_done: false
                },
                now
            ),
            vec![Action::Spawn(0), Action::Spawn(1), Action::Spawn(2)]
        );
        for child in 0..3 {
            session.paso(Event::Started(child), now);
        }
        let event = if state == SourceState::Live {
            Event::Detached(2)
        } else {
            Event::Exited {
                child: 2,
                success: true,
            }
        };
        let actions = session.paso(event, now);
        if state == SourceState::Live {
            assert!(actions.is_empty());
            assert!(!session.stopping());
            assert_eq!(session.paso(Event::OpenHub(2), now), vec![Action::Spawn(2)]);
        } else {
            assert!(actions.contains(&Action::StopWorkers), "{state:?}");
            assert!(actions.contains(&Action::Close(1)), "{state:?}");
            assert!(matches!(
                session.phase,
                super::session::Phase::Stopping {
                    reason: Reason::Finished(2),
                    ..
                }
            ));
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
    // WM_CLOSE sólo retira la bandeja. Su ausencia antes del EOF prueba que el
    // cierre del supervisor no depende de ventanas ni de QuitMode::Explicit.
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
    real.assert_clean_shutdown();
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

fn beta_restart_live() {
    use super::session::{Action, Event, Policy, Session};
    let scenario = Scenario::new("rust-restart-live");
    let now = Instant::now();
    let mut session = Session::new(
        [Policy::core(2), Policy::consumer(2), Policy::consumer(2)],
        Duration::from_secs(5),
        now,
    );
    session.paso(
        Event::Tick {
            permitted: true,
            workers_done: false,
        },
        now,
    );
    for child in 0..3 {
        session.paso(Event::Started(child), now);
    }
    fs::write(scenario.file("restart-request"), b"1").unwrap();
    assert!(
        session
            .paso(
                Event::Exited {
                    child: 2,
                    success: true
                },
                now
            )
            .contains(&Action::Close(1))
    );
    assert!(super::restart::take(&scenario.dir).unwrap());
    assert!(!super::restart::take(&scenario.dir).unwrap());
    let mut restarted = Session::new(
        [Policy::core(2), Policy::consumer(2), Policy::consumer(2)],
        Duration::from_secs(5),
        now,
    );
    assert_eq!(
        restarted.paso(
            Event::Tick {
                permitted: true,
                workers_done: false
            },
            now
        ),
        vec![Action::Spawn(0), Action::Spawn(1), Action::Spawn(2)]
    );
}

fn beta_hub_crash() {
    use super::session::{Action, Event, Policy, Session};
    let now = Instant::now();
    let mut session = Session::new(
        [Policy::core(2), Policy::consumer(2), Policy::consumer(2)],
        Duration::from_secs(5),
        now,
    );
    session.paso(
        Event::Tick {
            permitted: true,
            workers_done: false,
        },
        now,
    );
    for child in 0..3 {
        session.paso(Event::Started(child), now);
    }
    let actions = session.paso(
        Event::Exited {
            child: 2,
            success: false,
        },
        now,
    );
    assert!(
        actions
            .iter()
            .any(|action| matches!(action, Action::Backoff { child: 2, .. }))
    );
    assert!(!actions.contains(&Action::Close(1)));
    assert!(!session.stopping());
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
    real.assert_clean_shutdown();
    assert!(alive(hub), "comportamiento actual: Hub fuera del Job");
    tray_actions::close_hub(hub.pid);
    real.scenario.wait_for("Hub de prueba cerrado", LONG, || {
        (!alive(hub)).then_some(())
    });
    println!("MANUAL PASS: clic Abrir Hub y clic Salir, binario normal; sin instalación real.");
    ExitCode::SUCCESS
}
