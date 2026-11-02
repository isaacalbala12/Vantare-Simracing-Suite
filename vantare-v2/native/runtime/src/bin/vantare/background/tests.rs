use super::*;
use crate::{Instance, Program, Service, Stop, object_name, session::Policy, supervisor};
use serde::{Serialize, Serializer, ser::SerializeMap};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};
use vantare_services::storage::{Read, Store};

const MODE: &str = "VANTARE_TEST_P2_FORCED_WORKER";
const ROOT: &str = "VANTARE_TEST_P2_ROOT";
const COOPERATIVE: &str = "VANTARE_TEST_P2_COOPERATIVE";
const OLD: &[u8] = br#"{"version":1,"updated_ms":1,"profiles":[]}"#;

struct OwnedProcess(Child);
impl Drop for OwnedProcess {
    fn drop(&mut self) {
        let _killed = self.0.kill();
        let _reaped = self.0.wait();
    }
}

fn until<T>(mut observed: impl FnMut() -> Option<T>) -> T {
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        if let Some(value) = observed() {
            return value;
        }
        assert!(
            Instant::now() < deadline,
            "sin confirmación del proceso propio"
        );
        // Límite de fallo y sondeo de efectos reales, no organiza la carrera.
        thread::sleep(Duration::from_millis(5));
    }
}

#[test]
fn forced_worker_exit_releases_locks_and_keeps_documents() {
    if std::env::var_os(MODE).is_some() {
        fixture_session();
    }
    for cooperative in [false, true] {
        check_force(cooperative);
    }
}

fn check_force(cooperative: bool) {
    let id = vantare_services::random_id().expect("id");
    let root = std::env::temp_dir().join(format!("vantare-p2-force-{id}"));
    fs::create_dir(&root).expect("raíz temporal propia");
    let mut process = start_fixture(&root, cooperative);
    let pids = until(|| {
        let log = fs::read_to_string(root.join("session.log")).ok()?;
        let pids: Vec<u32> = log
            .lines()
            .filter_map(|line| {
                line.split_once(" en marcha (pid ")?
                    .1
                    .strip_suffix(')')?
                    .parse()
                    .ok()
            })
            .collect();
        (pids.len() == 3 && root.join("worker-ready").is_file()).then_some(pids)
    });
    #[cfg(windows)]
    let observed: Vec<_> = pids
        .iter()
        .map(|&pid| super::super::win::retain_process(pid).expect("handle original observado"))
        .collect();
    let instance = root.file_name().expect("instancia").to_string_lossy();
    let began = Instant::now();
    Stop::signal(&object_name("launcher-stop", &instance)).expect("parada");
    let status = until(|| process.0.try_wait().expect("estado sesión"));
    assert_eq!(
        status.code(),
        Some(1),
        "worker colgado es defecto, no éxito"
    );
    let owner = Instance::acquire(&object_name("launcher", &instance))
        .expect("cerrojo de sesión disponible tras salida forzada")
        .expect("ningún dueño retenido");
    drop(owner);
    assert!(
        began.elapsed() < Duration::from_millis(1400),
        "un P de 1 s no suma plazos por hijo: {:?}",
        began.elapsed()
    );
    eprintln!(
        "presupuesto P=1000 ms, salida observada={} ms",
        began.elapsed().as_millis()
    );
    #[cfg(windows)]
    assert!(observed.iter().all(super::super::win::process_finished));
    #[cfg(unix)]
    assert!(pids.iter().all(|pid| {
        !Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .expect("observar PID propio")
            .success()
    }));
    if cooperative {
        let log = fs::read_to_string(root.join("session.log")).expect("diagnóstico");
        assert!(!log.contains("se le mata"), "los hijos salen por EOF");
        assert!(log.contains("plazo global agotado: worker de sesión no respondió"));
    }
    check_documents_and_locks(&root);
    drop(process);
    fs::remove_dir_all(root).expect("limpiar sólo raíz propia");
}

fn start_fixture(root: &Path, cooperative: bool) -> OwnedProcess {
    let mut command = Command::new(std::env::current_exe().expect("test"));
    command
        .args([
            "--exact",
            "background::tests::forced_worker_exit_releases_locks_and_keeps_documents",
            "--nocapture",
        ])
        .env(MODE, "1")
        .env(ROOT, root)
        .env(COOPERATIVE, if cooperative { "1" } else { "0" })
        .env("VANTARE_NATIVE_DATA_ROOT", root)
        .env("LOCALAPPDATA", root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(File::create(root.join("session.log")).expect("log"));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let process = OwnedProcess(command.spawn().expect("sesión de prueba"));
    drop(command);
    process
}

fn check_documents_and_locks(root: &Path) {
    assert_eq!(
        fs::read(root.join("status.json")).expect("documento visible"),
        OLD
    );
    assert_eq!(
        fs::read(root.join("status.interrupted.tmp")).expect("temporal interrumpido"),
        b"{\"half\":"
    );
    for name in [".operation.lock", "status.json.lock"] {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(root.join(name))
            .expect("ancla del lock");
        file.try_lock()
            .expect("no queda ningún lock del proceso retenido");
    }
    // Usar las mismas APIs reales tras el corte: ningún residuo exige reparación.
    vantare_launcher::files::save(
        &root.join("status.json"),
        br#"{"recovered":true}"#,
        Some(OLD),
    )
    .expect("guardar después del corte");
    let store = Store::open(&root.join("host"), "p2-worker").expect("owner.lock liberado");
    let Read::Value(value) = store
        .read::<serde_json::Value>("roadmap")
        .expect("documento Host")
    else {
        panic!("documento íntegro previo");
    };
    assert_eq!(value, serde_json::json!({"committed":"before"}));
    store
        .save("roadmap", &serde_json::json!({"recovered":true}))
        .expect("Host vuelve a guardar");
    drop(store);
}

fn fixture_session() -> ! {
    let root = PathBuf::from(std::env::var_os(ROOT).expect("raíz propia"));
    #[cfg(windows)]
    super::super::win::adopt_self_in_job().expect("Job de esta sesión de prueba");
    let instance = root.file_name().expect("instancia").to_string_lossy();
    let instance_guard = Instance::acquire(&object_name("launcher", &instance))
        .expect("mutex")
        .expect("instancia propia");
    let stop = Stop::create(&object_name("launcher-stop", &instance)).expect("stop");
    fs::write(root.join("supervisor.pid"), std::process::id().to_string())
        .expect("identidad propia");
    let cancel = Arc::new(AtomicBool::new(false));
    let worker_root = root.clone();
    let worker = thread::spawn(move || stalled_save(&worker_root));
    let mut workers = Workers {
        fixture: Some(TestWorker {
            cancel: cancel.clone(),
            thread: worker,
        }),
        ..Default::default()
    };
    let program = || Program {
        path: std::env::current_exe().expect("test"),
        args: vec![
            "--exact".into(),
            "background::tests::stalled_child".into(),
            "--nocapture".into(),
        ],
    };
    let mut services = [
        Service::new("núcleo", program(), 0).with_policy(Policy::core(0)),
        Service::new("overlays", program(), 0),
        Service::new("diagnóstico", program(), 0).with_policy(Policy::observer()),
    ];
    let error = supervisor::run(
        &mut services,
        &stop,
        &instance_guard,
        None,
        Duration::from_secs(1),
        &mut workers,
    )
    .expect_err("worker fuera de presupuesto");
    assert_eq!(error.kind(), io::ErrorKind::TimedOut);
    assert!(
        cancel.load(Ordering::Acquire),
        "se pidió cancelar antes del corte"
    );
    assert!(
        services.iter().all(|service| service.child.is_none()),
        "todos recogidos explícitamente antes de salir, también sin Job en Unix"
    );
    std::process::exit(1);
}

#[test]
fn stalled_child() {
    if std::env::var_os(MODE).is_none() {
        return;
    }
    if std::env::var(COOPERATIVE).is_ok_and(|value| value == "1") {
        io::copy(&mut io::stdin(), &mut io::sink()).expect("EOF del supervisor");
        return;
    }
    #[cfg(windows)]
    loop {
        thread::park();
    }
    #[cfg(unix)]
    {
        let root = PathBuf::from(std::env::var_os(ROOT).expect("raíz propia"));
        let parent = fs::read_to_string(root.join("supervisor.pid")).expect("padre propio");
        let deadline = Instant::now() + Duration::from_secs(20);
        // Sólo protección de cleanup si el padre del test falla antes del kill.
        while Instant::now() < deadline
            && Command::new("kill")
                .args(["-0", parent.trim()])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .expect("padre")
                .success()
        {
            thread::sleep(Duration::from_millis(50));
        }
    }
}

fn stalled_save(root: &Path) {
    let status = root.join("status.json");
    vantare_launcher::files::save(&status, OLD, None).expect("estado inicial real");
    let _status_lock = locked(&root.join("status.json.lock"));
    let _operation_lock = locked(&root.join(".operation.lock"));
    let mut staging = File::create(root.join("status.interrupted.tmp")).expect("staging propio");
    staging
        .write_all(b"{\"half\":")
        .expect("escritura interrumpida");
    staging
        .sync_all()
        .expect("staging durable sin reemplazar documento");
    let store = Store::open(&root.join("host"), "p2-worker").expect("Store real");
    store
        .save("roadmap", &serde_json::json!({"committed":"before"}))
        .expect("commit anterior");
    store
        .save("roadmap", &Stalled(root))
        .expect("no debe terminar la serialización");
}

fn locked(path: &Path) -> File {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .expect("lock propio");
    file.try_lock().expect("tomar lock del SO");
    file
}

struct Stalled<'a>(&'a Path);
impl Serialize for Stalled<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(2))?;
        map.serialize_entry("partial", &true)?;
        fs::write(self.0.join("worker-ready"), b"1").map_err(serde::ser::Error::custom)?;
        loop {
            thread::park();
        }
    }
}
