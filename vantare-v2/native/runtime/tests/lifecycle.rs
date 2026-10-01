//! Caída, bloqueo, reconexión y cierre del launcher `vantare` con procesos de
//! verdad. Sin arnés de `libtest`: este mismo ejecutable hace de núcleo y de
//! overlays falsos (`lifecycle fake-core ...`), que hablan por un pipe real con
//! `vantare-ipc`, y los escenarios corren uno tras otro.

// Sin `#[test]` (arnés propio), clippy no lo trata como código de pruebas.
#![allow(clippy::unwrap_used, clippy::cast_possible_truncation)]

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::panic::{self, AssertUnwindSafe};
use std::path::PathBuf;
use std::process::{Child, Command, ExitCode, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::{env, thread};

use vantare_domain::{Quality, Snapshot};
use vantare_ipc::{Publisher, Subscriber};

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("fake-core") => fake_core(&args[1..]),
        Some("fake-crash") => fake_crash(&args[1..]),
        Some("fake-overlays") => fake_overlays(&args[1..]),
        _ if args.iter().any(|arg| arg == "fake-engineer") => fake_engineer(&args),
        _ => run_scenarios(&args),
    }
}

// --- procesos falsos -------------------------------------------------------

/// Valor de `--nombre` en la lista de argumentos de un proceso falso.
fn opt(args: &[String], name: &str) -> String {
    let at = args
        .iter()
        .position(|a| a == name)
        .unwrap_or_else(|| panic!("falta {name}"));
    args[at + 1].clone()
}

fn note(path: &str, line: &str) {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .unwrap();
    // Una sola escritura por línea: `writeln!` escribe texto y salto por separado
    // y dos procesos anexando a la vez intercalaban sus líneas.
    file.write_all(
        format!(
            "{line}
"
        )
        .as_bytes(),
    )
    .unwrap();
}

/// Contrato de los hijos sin ventana: leer stdin hasta EOF significa "termina".
fn stdin_closed() -> Arc<AtomicBool> {
    let closed = Arc::new(AtomicBool::new(false));
    let flag = Arc::clone(&closed);
    thread::spawn(move || {
        let _ = std::io::stdin().read_to_end(&mut Vec::new());
        flag.store(true, Ordering::Release);
    });
    closed
}

fn fake_core(args: &[String]) -> ExitCode {
    let (pipe, status) = (opt(args, "--pipe"), opt(args, "--status"));
    // Época nueva en cada arranque: mayor que la de cualquier núcleo anterior.
    let epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64;
    note(
        &status,
        &format!("core pid={} epoch={epoch}", std::process::id()),
    );
    let closed = stdin_closed();
    let Ok(mut publisher) = Publisher::new(&pipe, |_| true) else {
        return ExitCode::FAILURE;
    };
    let mut sequence = 0;
    while !closed.load(Ordering::Acquire) {
        sequence += 1;
        let mut snapshot = Snapshot {
            epoch,
            sequence,
            ..Snapshot::default()
        };
        // Fotos grandes: un par que no lee llena el búfer del pipe en pocas.
        snapshot.state.session.track_name = Quality::Reliable("x".repeat(20_000));
        publisher.publish(Arc::new(snapshot)).unwrap();
        thread::sleep(Duration::from_millis(10));
    }
    drop(publisher);
    note(&status, "closed core");
    ExitCode::SUCCESS
}

fn fake_crash(args: &[String]) -> ExitCode {
    note(
        &opt(args, "--status"),
        &format!("crash pid={}", std::process::id()),
    );
    ExitCode::from(1)
}

/// Tercer hijo sintético: prueba supervisor/EOF/Job, nunca lee juego ni audio.
fn fake_engineer(args: &[String]) -> ExitCode {
    let status = opt(args, "--status");
    note(&status, &format!("engineer pid={}", std::process::id()));
    if args.iter().any(|arg| arg == "--crash") {
        return ExitCode::FAILURE;
    }
    let closed = stdin_closed();
    let hang = args.iter().any(|arg| arg == "--hang");
    while hang || !closed.load(Ordering::Acquire) {
        thread::sleep(Duration::from_millis(10));
    }
    note(&status, "closed engineer");
    ExitCode::SUCCESS
}

fn fake_overlays(args: &[String]) -> ExitCode {
    let (pipe, status) = (opt(args, "--pipe"), opt(args, "--status"));
    note(&status, &format!("overlays pid={}", std::process::id()));
    if args.iter().any(|a| a == "--hang") {
        // Se conecta, saluda y no vuelve a leer ni atiende el cierre.
        #[cfg(windows)]
        {
            let hello = br#"{"hello":{"min_version":1,"max_version":1,"cursor":null}}"#;
            let mut frame = u32::try_from(hello.len()).unwrap().to_le_bytes().to_vec();
            frame.extend_from_slice(hello);
            let path = format!(r"\\.\pipe\{pipe}");
            let mut pipe = loop {
                match OpenOptions::new().read(true).write(true).open(&path) {
                    Ok(pipe) => break pipe,
                    Err(_) => thread::sleep(Duration::from_millis(50)),
                }
            };
            pipe.write_all(&frame).unwrap();
            note(&status, "overlays hung");
            loop {
                thread::sleep(Duration::from_mins(1));
            }
        }
        #[cfg(unix)]
        {
            use vantare_ipc::transport::{Event, IO_TIMEOUT, connect};

            let stop = Arc::new(Event::new().unwrap());
            let mut connection = loop {
                match connect(&pipe, Arc::clone(&stop), IO_TIMEOUT) {
                    Ok(connection) => break connection,
                    Err(error)
                        if matches!(
                            error.kind(),
                            std::io::ErrorKind::NotFound | std::io::ErrorKind::ConnectionRefused
                        ) =>
                    {
                        thread::sleep(Duration::from_millis(50));
                    }
                    Err(error) => panic!("conectar overlays de prueba: {error}"),
                }
            };
            let hello = br#"{"hello":{"min_version":1,"max_version":1,"cursor":null}}"#;
            let mut frame = u32::try_from(hello.len()).unwrap().to_le_bytes().to_vec();
            frame.extend_from_slice(hello);
            connection.write_all(&frame).unwrap();
            let mut header = [0; 4];
            connection.read_exact(&mut header).unwrap();
            let length = u32::from_le_bytes(header) as usize;
            assert!(
                length <= 1 << 20,
                "respuesta IPC demasiado grande: {length}"
            );
            let mut response = vec![0; length];
            connection.read_exact(&mut response).unwrap();
            note(&status, "overlays hung");
            loop {
                thread::sleep(Duration::from_mins(1));
            }
        }
    }
    let log = opt(args, "--log");
    let closed = stdin_closed();
    let mut subscriber = Subscriber::connect(&pipe, |_| true).unwrap();
    let mut epoch = 0;
    while !closed.load(Ordering::Acquire) {
        if let Some(snapshot) = subscriber.next(Duration::from_millis(100))
            && snapshot.epoch != epoch
        {
            epoch = snapshot.epoch;
            note(
                &log,
                &format!("epoch={epoch} sequence={}", snapshot.sequence),
            );
        }
    }
    drop(subscriber);
    note(&status, "closed overlays");
    ExitCode::SUCCESS
}

// --- escenarios ------------------------------------------------------------

struct Scenario {
    dir: PathBuf,
    pipe: String,
    instance: String,
}

/// Launcher en marcha; si el escenario falla, se le mata y el Job se lleva a los hijos.
struct Launcher(Child);

impl Drop for Launcher {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

impl Scenario {
    fn new(tag: &str) -> Self {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        let id = format!(
            "{}-{}-{tag}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        );
        let dir = env::temp_dir().join(format!("vantare-lifecycle-{id}"));
        fs::create_dir_all(&dir).unwrap();
        Self {
            dir,
            pipe: format!("vantare-lifecycle-{id}"),
            instance: id,
        }
    }

    fn file(&self, name: &str) -> String {
        self.dir.join(name).to_string_lossy().into_owned()
    }

    fn lines(&self, name: &str) -> Vec<String> {
        fs::read_to_string(self.file(name))
            .map(|text| text.lines().map(String::from).collect())
            .unwrap_or_default()
    }

    /// `(pid, época)` de cada arranque de `who` en `status`.
    fn starts(&self, who: &str) -> Vec<(u32, u64)> {
        let field = |line: &str, key: &str| {
            line.split_whitespace()
                .find_map(|part| part.strip_prefix(key))
                .and_then(|value| value.parse::<u64>().ok())
        };
        self.lines("status")
            .iter()
            .filter(|line| line.starts_with(&format!("{who} pid=")))
            .map(|line| {
                (
                    field(line, "pid=").unwrap() as u32,
                    field(line, "epoch=").unwrap_or(0),
                )
            })
            .collect()
    }

    fn launcher_command(&self, launcher_args: &[&str], core: &str, overlays: &[&str]) -> Command {
        let me = env::current_exe().unwrap();
        let mut command = Command::new(env!("CARGO_BIN_EXE_vantare"));
        command
            .args([
                "--core-bin",
                me.to_str().unwrap(),
                "--overlays-bin",
                me.to_str().unwrap(),
            ])
            .args(["--instancia", &self.instance, "--plazo", "1500"])
            .args(launcher_args)
            .args([
                "--",
                core,
                "--pipe",
                &self.pipe,
                "--status",
                &self.file("status"),
                "--",
            ])
            .args([
                "fake-overlays",
                "--pipe",
                &self.pipe,
                "--status",
                &self.file("status"),
            ])
            .args(["--log", &self.file("overlays.log")])
            .args(overlays)
            .stdin(Stdio::null())
            .stderr(File::create(self.file("launcher.log")).unwrap());
        command
    }

    fn launch(&self, launcher_args: &[&str], core: &str, overlays: &[&str]) -> Launcher {
        Launcher(
            self.launcher_command(launcher_args, core, overlays)
                .spawn()
                .unwrap(),
        )
    }

    /// Espera a que `probe` devuelva algo; si no, falla con el contexto del escenario.
    fn wait_for<T>(
        &self,
        what: &str,
        timeout: Duration,
        mut probe: impl FnMut() -> Option<T>,
    ) -> T {
        let deadline = Instant::now() + timeout;
        loop {
            if let Some(value) = probe() {
                return value;
            }
            assert!(
                Instant::now() < deadline,
                "tiempo agotado esperando: {what}\n--- status\n{}\n--- overlays.log\n{}\n--- launcher.log\n{}",
                self.lines("status").join("\n"),
                self.lines("overlays.log").join("\n"),
                self.lines("launcher.log").join("\n"),
            );
            thread::sleep(Duration::from_millis(50));
        }
    }

    /// Espera a que el launcher salga y devuelve su código.
    fn exit_code(&self, launcher: &mut Launcher, timeout: Duration) -> i32 {
        self.wait_for("la salida del launcher", timeout, || {
            launcher.0.try_wait().unwrap()
        })
        .code()
        .unwrap()
    }

    fn stop(&self) {
        let status = Command::new(env!("CARGO_BIN_EXE_vantare"))
            .args(["--parar", "--instancia", &self.instance])
            .status()
            .unwrap();
        assert!(status.success());
    }

    /// Época y secuencia más recientes que publica el núcleo, vistas por un
    /// suscriptor propio del escenario.
    fn observe(&self, subscriber: &mut Subscriber) -> (u64, u64) {
        let snapshot = self.wait_for("el núcleo publicando", LONG, || {
            subscriber.next(Duration::from_millis(100))
        });
        (snapshot.epoch, snapshot.sequence)
    }

    /// El núcleo publica al menos 30 fotos más sin reiniciarse. El plazo es un
    /// watchdog de bloqueo, no un presupuesto de CPU del equipo que ejecuta el test.
    fn assert_core_progresses(&self, subscriber: &mut Subscriber) {
        let (epoch, before) = self.observe(subscriber);
        self.wait_for("30 fotos más del núcleo sin reinicio", LONG, || {
            let snapshot = subscriber.next(Duration::from_millis(100))?;
            assert_eq!(epoch, snapshot.epoch, "el núcleo no debía reiniciarse");
            (snapshot.sequence >= before + 30).then_some(())
        });
    }
}

impl Drop for Scenario {
    fn drop(&mut self) {
        assert!(self.dir.is_absolute() && self.dir.parent() == Some(env::temp_dir().as_path()));
        assert!(
            self.dir
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("vantare-lifecycle-")
        );
        let _ = fs::remove_dir_all(&self.dir);
    }
}

#[cfg(windows)]
fn alive(pid: u32) -> bool {
    let out = Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .output()
        .unwrap();
    String::from_utf8_lossy(&out.stdout).contains(&format!("\"{pid}\""))
}

#[cfg(unix)]
fn alive(pid: u32) -> bool {
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

#[cfg(windows)]
fn kill(pid: u32) {
    let status = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/F"])
        .stdout(Stdio::null())
        .status()
        .unwrap();
    assert!(status.success(), "taskkill {pid}");
}

#[cfg(unix)]
fn kill(pid: u32) {
    let status = Command::new("kill")
        .args(["-KILL", &pid.to_string()])
        .stdout(Stdio::null())
        .status()
        .unwrap();
    assert!(status.success(), "kill -KILL {pid}");
}

// Bajo carga, el SO puede tardar en ejecutar el launcher incluso después de
// que los hijos hayan cerrado. No confundir este watchdog con --plazo (1,5 s),
// que sigue comprobando el cierre forzado de los hijos colgados.
const LONG: Duration = Duration::from_mins(1);

/// Núcleo y overlays arrancados y conectados; devuelve el launcher.
fn running(scenario: &Scenario, launcher_args: &[&str], overlays: &[&str]) -> Launcher {
    let launcher = scenario.launch(launcher_args, "fake-core", overlays);
    scenario.wait_for("overlays recibiendo", LONG, || {
        (!scenario.lines("overlays.log").is_empty()).then_some(())
    });
    launcher
}

fn killing_the_core_keeps_overlays_and_the_new_epoch_is_accepted() {
    let scenario = Scenario::new("core");
    let _launcher = running(&scenario, &[], &[]);
    let (core, first_epoch) = scenario.starts("core")[0];
    let (overlays, _) = scenario.starts("overlays")[0];

    kill(core);

    let restarted = scenario.wait_for("núcleo reiniciado", LONG, || {
        scenario.starts("core").get(1).copied()
    });
    assert!(restarted.1 > first_epoch, "época nueva mayor");
    scenario.wait_for("overlays acepta la época nueva", LONG, || {
        scenario
            .lines("overlays.log")
            .iter()
            .any(|l| l.starts_with(&format!("epoch={} ", restarted.1)))
            .then_some(())
    });
    assert_eq!(
        scenario.starts("overlays").len(),
        1,
        "overlays no se reinició"
    );
    assert!(alive(overlays), "overlays sigue vivo");
}

fn killing_overlays_leaves_the_core_publishing() {
    let scenario = Scenario::new("overlays");
    let _launcher = running(&scenario, &[], &[]);
    let (core, epoch) = scenario.starts("core")[0];
    let (overlays, _) = scenario.starts("overlays")[0];
    let mut watcher = Subscriber::connect(&scenario.pipe, |_| true).unwrap();

    kill(overlays);

    scenario.wait_for("overlays reiniciado", LONG, || {
        (scenario.starts("overlays").len() == 2).then_some(())
    });
    scenario.assert_core_progresses(&mut watcher);
    assert_eq!(
        scenario.starts("core"),
        [(core, epoch)],
        "el núcleo no se tocó"
    );
    assert!(alive(core));
    // El overlays nuevo se conecta a la misma época.
    scenario.wait_for("overlays nuevo conectado", LONG, || {
        (scenario.lines("overlays.log").len() == 2).then_some(())
    });
}

fn a_hung_overlays_does_not_block_the_core_and_is_killed_on_stop() {
    let scenario = Scenario::new("hung");
    let mut launcher = scenario.launch(&[], "fake-core", &["--hang"]);
    scenario.wait_for("overlays colgado conectado", LONG, || {
        scenario
            .lines("status")
            .iter()
            .any(|l| l == "overlays hung")
            .then_some(())
    });
    let mut watcher = Subscriber::connect(&scenario.pipe, |_| true).unwrap();
    // 30 fotos de 20 KB desbordan el búfer del pipe del colgado (64 KB).
    scenario.assert_core_progresses(&mut watcher);
    let (hung, _) = scenario.starts("overlays")[0];
    assert!(alive(hung));

    scenario.stop();

    assert_eq!(scenario.exit_code(&mut launcher, LONG), 0);
    assert!(
        !alive(hung),
        "el colgado no atiende el cierre: debe morir por el plazo"
    );
    assert!(
        scenario
            .lines("status")
            .contains(&"closed core".to_string())
    );
    assert!(
        scenario
            .lines("launcher.log")
            .iter()
            .any(|l| l.contains("no terminó"))
    );
}

fn a_second_instance_starts_nothing() {
    let scenario = Scenario::new("single");
    let mut first = running(&scenario, &[], &[]);
    let started = scenario.lines("status");

    let mut second = scenario.launch(&[], "fake-core", &[]);
    assert_eq!(scenario.exit_code(&mut second, LONG), 0);
    assert!(
        scenario
            .lines("launcher.log")
            .iter()
            .all(|l| !l.contains("cayó"))
    );
    assert_eq!(
        scenario.lines("status"),
        started,
        "la segunda instancia no arrancó nada"
    );

    scenario.stop();
    assert_eq!(scenario.exit_code(&mut first, LONG), 0);
}

fn stop_closes_overlays_before_the_core() {
    let scenario = Scenario::new("order");
    let mut launcher = running(&scenario, &[], &[]);

    scenario.stop();

    assert_eq!(scenario.exit_code(&mut launcher, LONG), 0);
    let status = scenario.lines("status");
    let position = |what: &str| {
        status
            .iter()
            .position(|l| l == what)
            .unwrap_or_else(|| panic!("falta {what}: {status:?}"))
    };
    assert!(position("closed overlays") < position("closed core"));
}

fn the_restart_budget_runs_out_and_everything_stops() {
    let scenario = Scenario::new("budget");
    let mut launcher = scenario.launch(&["--reinicios", "2"], "fake-crash", &[]);

    assert_eq!(scenario.exit_code(&mut launcher, LONG), 1);
    let log = scenario.lines("launcher.log");
    assert!(
        log.iter()
            .any(|l| l.contains("presupuesto de reinicios agotado")),
        "{log:?}"
    );
    let crashes = scenario
        .lines("status")
        .iter()
        .filter(|l| l.starts_with("crash "))
        .count();
    assert_eq!(crashes, 3, "arranque inicial y dos reinicios");
    assert!(
        scenario
            .lines("status")
            .contains(&"closed overlays".to_string()),
        "overlays cerrado"
    );
}

#[cfg(windows)]
fn children_die_with_the_launcher() {
    let scenario = Scenario::new("job");
    let launcher = running(&scenario, &[], &[]);
    let (core, _) = scenario.starts("core")[0];
    let (overlays, _) = scenario.starts("overlays")[0];

    assert!(alive(core) && alive(overlays));
    drop(launcher); // muerte abrupta: solo el Job Object puede llevarse a los hijos

    scenario.wait_for("hijos muertos", LONG, || {
        (!alive(core) && !alive(overlays)).then_some(())
    });
}

fn launch_engineer(scenario: &Scenario, extra: &[&str], budget: u32) -> Launcher {
    let me = env::current_exe().unwrap();
    let mut command = scenario.launcher_command(
        &[
            "--engineer",
            &scenario.file("cursor.json"),
            "--engineer-bin",
            me.to_str().unwrap(),
            "--reinicios",
            &budget.to_string(),
        ],
        "fake-core",
        &[],
    );
    command
        .args(["--", "fake-engineer", "--status", &scenario.file("status")])
        .args(extra);
    Launcher(command.spawn().unwrap())
}

fn engineer_restart_is_isolated_and_stop_closes_it_before_overlays_and_core() {
    let scenario = Scenario::new("engineer-restart");
    let mut launcher = launch_engineer(&scenario, &[], 2);
    let first = scenario.wait_for("Engineer arrancado", LONG, || {
        scenario.starts("engineer").first().copied()
    });
    scenario.wait_for("overlays conectado", LONG, || {
        (!scenario.lines("overlays.log").is_empty()).then_some(())
    });
    let core = scenario.starts("core");
    let overlays = scenario.starts("overlays");
    kill(first.0);
    scenario.wait_for("Engineer reiniciado", LONG, || {
        scenario.starts("engineer").get(1).copied()
    });
    let mut watcher = Subscriber::connect(&scenario.pipe, |_| true).unwrap();
    scenario.assert_core_progresses(&mut watcher);
    assert_eq!(scenario.starts("core"), core);
    assert_eq!(scenario.starts("overlays"), overlays);
    scenario.stop();
    assert_eq!(scenario.exit_code(&mut launcher, LONG), 0);
    let status = scenario.lines("status");
    let at = |message: &str| status.iter().position(|line| line == message).unwrap();
    assert!(
        at("closed engineer") < at("closed overlays") && at("closed overlays") < at("closed core")
    );
}

fn engineer_restart_budget_closes_every_child_after_exactly_two_retries() {
    let scenario = Scenario::new("engineer-budget");
    let mut launcher = launch_engineer(&scenario, &["--crash"], 2);
    assert_eq!(scenario.exit_code(&mut launcher, LONG), 1);
    assert_eq!(
        scenario.starts("engineer").len(),
        3,
        "arranque inicial y dos reinicios\nstatus: {:?}\nlauncher: {:?}",
        scenario.lines("status"),
        scenario.lines("launcher.log"),
    );
    let status = scenario.lines("status");
    assert!(
        status.contains(&"closed overlays".into()) && status.contains(&"closed core".into()),
        "status: {status:?}\nlauncher: {:?}",
        scenario.lines("launcher.log"),
    );
    assert!(
        scenario
            .lines("launcher.log")
            .iter()
            .any(|line| line.contains("Engineer: presupuesto de reinicios agotado"))
    );
    for who in ["engineer", "overlays", "core"] {
        for (pid, _) in scenario.starts(who) {
            assert!(!alive(pid), "{who} (pid {pid}) debía estar muerto");
        }
    }
}

fn a_hung_engineer_is_killed_by_the_grace_deadline() {
    let scenario = Scenario::new("engineer-hung");
    let mut launcher = launch_engineer(&scenario, &["--hang"], 2);
    let engineer = scenario
        .wait_for("Engineer colgado arrancado", LONG, || {
            scenario.starts("engineer").first().copied()
        })
        .0;
    scenario.stop();
    assert_eq!(scenario.exit_code(&mut launcher, LONG), 0);
    assert!(!alive(engineer));
    assert!(
        scenario
            .lines("launcher.log")
            .iter()
            .any(|line| line.contains("Engineer no terminó"))
    );
    assert!(scenario.lines("status").contains(&"closed core".into()));
}

#[cfg(windows)]
fn engineer_dies_in_the_same_job_when_launcher_is_killed() {
    let scenario = Scenario::new("engineer-job");
    let launcher = launch_engineer(&scenario, &[], 2);
    let engineer = scenario
        .wait_for("Engineer en Job", LONG, || {
            scenario.starts("engineer").first().copied()
        })
        .0;
    let core = scenario
        .wait_for("núcleo en Job", LONG, || {
            scenario.starts("core").first().copied()
        })
        .0;
    let overlays = scenario
        .wait_for("overlays en Job", LONG, || {
            scenario.starts("overlays").first().copied()
        })
        .0;
    drop(launcher);
    scenario.wait_for("tres hijos muertos por Job", LONG, || {
        (!alive(engineer) && !alive(core) && !alive(overlays)).then_some(())
    });
}

fn run_scenarios(filters: &[String]) -> ExitCode {
    let mut scenarios: Vec<(&str, fn())> = vec![
        (
            "engineer_restart_is_isolated_and_stop_closes_it_before_overlays_and_core",
            engineer_restart_is_isolated_and_stop_closes_it_before_overlays_and_core,
        ),
        (
            "engineer_restart_budget_closes_every_child_after_exactly_two_retries",
            engineer_restart_budget_closes_every_child_after_exactly_two_retries,
        ),
        (
            "a_hung_engineer_is_killed_by_the_grace_deadline",
            a_hung_engineer_is_killed_by_the_grace_deadline,
        ),
    ];
    #[cfg(windows)]
    scenarios.push((
        "engineer_dies_in_the_same_job_when_launcher_is_killed",
        engineer_dies_in_the_same_job_when_launcher_is_killed,
    ));
    scenarios.push((
        "killing_the_core_keeps_overlays_and_the_new_epoch_is_accepted",
        killing_the_core_keeps_overlays_and_the_new_epoch_is_accepted,
    ));
    scenarios.push((
        "killing_overlays_leaves_the_core_publishing",
        killing_overlays_leaves_the_core_publishing,
    ));
    scenarios.push((
        "a_hung_overlays_does_not_block_the_core_and_is_killed_on_stop",
        a_hung_overlays_does_not_block_the_core_and_is_killed_on_stop,
    ));
    scenarios.push((
        "a_second_instance_starts_nothing",
        a_second_instance_starts_nothing,
    ));
    scenarios.push((
        "stop_closes_overlays_before_the_core",
        stop_closes_overlays_before_the_core,
    ));
    scenarios.push((
        "the_restart_budget_runs_out_and_everything_stops",
        the_restart_budget_runs_out_and_everything_stops,
    ));
    #[cfg(windows)]
    scenarios.push((
        "children_die_with_the_launcher",
        children_die_with_the_launcher,
    ));
    let filters: Vec<&String> = filters.iter().filter(|a| !a.starts_with('-')).collect();
    let mut failed = 0;
    println!("\nrunning {} tests", scenarios.len());
    for (name, scenario) in scenarios {
        if !filters.is_empty() && !filters.iter().any(|f| name.contains(f.as_str())) {
            continue;
        }
        let began = Instant::now();
        if panic::catch_unwind(AssertUnwindSafe(scenario)).is_ok() {
            println!("test {name} ... ok ({:.1}s)", began.elapsed().as_secs_f32());
        } else {
            println!("test {name} ... FAILED");
            failed += 1;
        }
    }
    println!(
        "\ntest result: {}. {failed} failed",
        if failed == 0 { "ok" } else { "FAILED" }
    );
    if failed == 0 {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
