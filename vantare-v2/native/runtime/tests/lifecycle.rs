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
    writeln!(file, "{line}").unwrap();
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

fn fake_overlays(args: &[String]) -> ExitCode {
    let (pipe, status) = (opt(args, "--pipe"), opt(args, "--status"));
    note(&status, &format!("overlays pid={}", std::process::id()));
    if args.iter().any(|a| a == "--hang") {
        // Se conecta, saluda y no vuelve a leer ni atiende el cierre.
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
    fn observe(subscriber: &mut Subscriber) -> (u64, u64) {
        let snapshot = subscriber
            .next(Duration::from_secs(5))
            .expect("el núcleo debía estar publicando");
        (snapshot.epoch, snapshot.sequence)
    }

    /// El núcleo sigue publicando: su secuencia avanza en ~1 s.
    fn assert_core_progresses(subscriber: &mut Subscriber) {
        let (epoch, before) = Self::observe(subscriber);
        thread::sleep(Duration::from_secs(1));
        let (epoch_after, after) = Self::observe(subscriber);
        assert_eq!(epoch, epoch_after, "el núcleo no debía reiniciarse");
        assert!(
            after >= before + 30,
            "el núcleo se ha frenado: {before} -> {after}"
        );
    }
}

impl Drop for Scenario {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}

fn alive(pid: u32) -> bool {
    let out = Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .output()
        .unwrap();
    String::from_utf8_lossy(&out.stdout).contains(&format!("\"{pid}\""))
}

fn kill(pid: u32) {
    let status = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/F"])
        .stdout(Stdio::null())
        .status()
        .unwrap();
    assert!(status.success(), "taskkill {pid}");
}

const LONG: Duration = Duration::from_secs(20);

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
    Scenario::assert_core_progresses(&mut watcher);
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
    // Con 20 KB por foto el búfer del pipe del colgado se llena en segundos.
    thread::sleep(Duration::from_secs(1));
    Scenario::assert_core_progresses(&mut watcher);
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
    assert_eq!(scenario.exit_code(&mut second, Duration::from_secs(10)), 0);
    assert!(
        scenario
            .lines("launcher.log")
            .iter()
            .all(|l| !l.contains("cayó"))
    );
    thread::sleep(Duration::from_millis(500));
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

fn run_scenarios(filters: &[String]) -> ExitCode {
    let scenarios: [(&str, fn()); 7] = [
        (
            "killing_the_core_keeps_overlays_and_the_new_epoch_is_accepted",
            killing_the_core_keeps_overlays_and_the_new_epoch_is_accepted,
        ),
        (
            "killing_overlays_leaves_the_core_publishing",
            killing_overlays_leaves_the_core_publishing,
        ),
        (
            "a_hung_overlays_does_not_block_the_core_and_is_killed_on_stop",
            a_hung_overlays_does_not_block_the_core_and_is_killed_on_stop,
        ),
        (
            "a_second_instance_starts_nothing",
            a_second_instance_starts_nothing,
        ),
        (
            "stop_closes_overlays_before_the_core",
            stop_closes_overlays_before_the_core,
        ),
        (
            "the_restart_budget_runs_out_and_everything_stops",
            the_restart_budget_runs_out_and_everything_stops,
        ),
        (
            "children_die_with_the_launcher",
            children_die_with_the_launcher,
        ),
    ];
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
