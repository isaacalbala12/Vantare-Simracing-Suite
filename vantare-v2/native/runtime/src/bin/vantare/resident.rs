//! El supervisor conserva atajos y cadenas aunque el Hub cierre su ventana.
use super::{launcher, triggers_win};
use launcher::discovery::{Discovery, Sources};
use launcher::{
    Document,
    chain::{Action, Chain},
    files,
    triggers::Hotkey,
};
use std::io::Write;
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};
use vantare_ipc::launcher::{Decision, Registration, Request, Status, request_path, status_path};

pub struct Resident {
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
    processes: launcher::processes::Shared,
    close_on_exit: Arc<Mutex<Vec<String>>>,
}

impl Resident {
    pub fn request_shutdown(&self) {
        self.stop.store(true, Ordering::Release);
    }

    pub fn poll_shutdown(&mut self) -> std::io::Result<bool> {
        self.request_shutdown();
        if self
            .thread
            .as_ref()
            .is_some_and(thread::JoinHandle::is_finished)
            && let Some(worker) = self.thread.take()
            && worker.join().is_err()
        {
            return Err(std::io::Error::other(
                "Launcher residente terminó con panic",
            ));
        }
        Ok(self.thread.is_none())
    }

    /// Las apps del perfil pueden salir del Job. Al vencer P el supervisor
    /// conserva sus handles originales y aplica sólo `Close::Started`, incluso
    /// si el worker quedó bloqueado antes de llegar al cleanup normal. Sólo
    /// solicita terminar: después de P no espera a que el proceso salga.
    /// Reintenta el registro de procesos tres veces a 20 ms antes de rendirse;
    /// esa tolerancia acotada de 60 ms no renueva el presupuesto de sesión.
    pub fn force_cleanup(&self) -> std::io::Result<()> {
        self.force_cleanup_with_retry(|| thread::sleep(Duration::from_millis(20)))
    }

    fn force_cleanup_with_retry(&self, mut wait: impl FnMut()) -> std::io::Result<()> {
        let profiles = self
            .close_on_exit
            .try_lock()
            .map_err(|_| std::io::Error::other("políticas Launcher ocupadas al cerrar"))?
            .clone();
        let mut attempts = 0;
        let mut processes = loop {
            match self.processes.try_lock() {
                Ok(processes) => break processes,
                Err(std::sync::TryLockError::WouldBlock) if attempts < 3 => {
                    attempts += 1;
                    wait();
                }
                Err(_) => {
                    return Err(std::io::Error::other(
                        "procesos Launcher ocupados al cerrar",
                    ));
                }
            }
        };
        let mut first = None;
        for profile in profiles {
            if let Err(error) = processes.request_close_profile(&profile) {
                first.get_or_insert(error);
            }
        }
        first.map_or(Ok(()), |error| Err(std::io::Error::other(error)))
    }

    pub fn start(path: PathBuf, profile: Option<String>, startup: bool) -> std::io::Result<Self> {
        let stop = Arc::new(AtomicBool::new(false));
        let cancellation = stop.clone();
        let mut owner = Owner::new(path, startup);
        let processes = Arc::clone(&owner.processes);
        let close_on_exit = Arc::clone(&owner.close_on_exit);
        let worker = thread::Builder::new()
            .name("launcher-residente".into())
            .spawn(move || {
                owner.reload();
                if let Some(profile) = profile {
                    owner.launch(&profile);
                }
                let mut ticks = 0;
                while !cancellation.load(Ordering::Acquire) {
                    if ticks % 10 == 0 {
                        owner.reload();
                    }
                    for id in triggers_win::pending() {
                        if let Some((_, profile)) =
                            owner.hotkeys.iter().find(|(key, _)| *key == id).cloned()
                        {
                            owner.launch(&profile);
                        }
                    }
                    owner.request();
                    owner.progress();
                    if ticks % 10 == 0 {
                        owner.publish();
                    }
                    ticks += 1;
                    thread::sleep(Duration::from_millis(50));
                }
                owner.clear_hotkeys();
                if let Some(mut chain) = owner.chain.take()
                    && let Err(error) = chain.shutdown()
                {
                    let _written =
                        writeln!(std::io::stderr(), "cerrar Launcher residente: {error}");
                }
                if let Ok(mut processes) = owner.processes.lock() {
                    for profile in &owner.document.profiles {
                        if profile.effective_policy().exit == launcher::policy::Close::Started
                            && let Err(error) = processes.close_profile(&profile.id)
                        {
                            let _written = writeln!(
                                std::io::stderr(),
                                "cerrar aplicaciones de {}: {error}",
                                profile.id
                            );
                        }
                    }
                }
                // El cierre no revoca Run: esa preferencia debe sobrevivir hasta el siguiente login.
                owner.status.updated_ms = 0;
                owner.write_status();
            })?;
        Ok(Self {
            stop,
            thread: Some(worker),
            processes,
            close_on_exit,
        })
    }
}

impl Drop for Resident {
    fn drop(&mut self) {
        self.request_shutdown();
        if let Some(worker) = self.thread.take()
            && worker.join().is_err()
        {
            let _written = writeln!(std::io::stderr(), "Launcher residente terminó con panic");
        }
    }
}

struct Owner {
    path: PathBuf,
    startup: bool,
    bytes: Option<Vec<u8>>,
    document: Document,
    hotkeys: Vec<(i32, String)>,
    status: Status,
    chain: Option<Chain>,
    decision_serial: u64,
    chain_decision: Option<u64>,
    processes: launcher::processes::Shared,
    close_on_exit: Arc<Mutex<Vec<String>>>,
}

fn action_from_label(label: &str) -> Option<Action> {
    [
        Action::Trust,
        Action::Reuse,
        Action::Restart,
        Action::Cancel,
        Action::Stop,
        Action::Continue,
        Action::Leave,
        Action::CloseStarted,
    ]
    .into_iter()
    .find(|candidate| candidate.label() == label)
}

impl Owner {
    fn new(path: PathBuf, startup: bool) -> Self {
        Self {
            path,
            startup,
            bytes: None,
            document: Document::default(),
            hotkeys: vec![],
            status: Status::default(),
            chain: None,
            decision_serial: vantare_ipc::launcher::now_ms(),
            chain_decision: None,
            processes: Arc::new(Mutex::new(launcher::processes::Processes::default())),
            close_on_exit: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn clear_hotkeys(&mut self) {
        for (id, _) in self.hotkeys.drain(..) {
            triggers_win::unregister(id);
        }
        // Un mensaje ya encolado con el ID anterior no puede lanzar el perfil nuevo.
        triggers_win::pending();
    }

    fn reload(&mut self) {
        self.reload_with_metadata(|path| std::fs::metadata(path));
    }

    fn reload_with_metadata(
        &mut self,
        metadata: impl FnOnce(&std::path::Path) -> std::io::Result<std::fs::Metadata>,
    ) {
        let (missing, bytes) = match metadata(&self.path) {
            Ok(_) => match files::read(&self.path, files::MAX_DOCUMENT) {
                Ok(bytes) => (false, bytes),
                Err(error) => {
                    self.status.error = Some(error);
                    return;
                }
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (true, vec![]),
            Err(error) => {
                self.status.error = Some(format!("leer Launcher: {error}"));
                return;
            }
        };
        if self.bytes.as_ref() == Some(&bytes)
            && self.status.error.is_none()
            && self
                .status
                .profiles
                .iter()
                .all(|registration| registration.error.is_none())
        {
            return;
        }
        let parsed = if missing {
            Ok(Document::default())
        } else {
            Document::from_bytes(&bytes).map_err(|error| error.to_string())
        };
        let document = match parsed {
            Ok(document) => document,
            Err(error) => {
                self.status.error = Some(error);
                return;
            }
        };
        self.clear_hotkeys();
        self.status.error = None;
        self.status.profiles.clear();
        for (index, profile) in document.profiles.iter().enumerate() {
            let mut registration = Registration {
                profile: profile.id.clone(),
                hotkey: profile.hotkey.clone(),
                ..Registration::default()
            };
            match Hotkey::parse(&profile.hotkey) {
                Ok(Some(hotkey)) => {
                    if self.status.profiles.iter().any(|registered| {
                        registered.registered
                            && Hotkey::parse(&registered.hotkey).ok().flatten() == Some(hotkey)
                    }) {
                        registration.error = Some("atajo asignado a otro perfil".into());
                        self.status.profiles.push(registration);
                        continue;
                    }
                    let result = i32::try_from(index + 1)
                        .map_err(|_| "demasiados atajos".to_owned())
                        .and_then(|id| {
                            triggers_win::register(id, hotkey).map_err(|error| {
                                format!(
                                    "atajo {} en conflicto o no disponible: {error}",
                                    profile.hotkey
                                )
                            })?;
                            self.hotkeys.push((id, profile.id.clone()));
                            Ok(())
                        });
                    registration.registered = result.is_ok();
                    registration.error = result.err();
                }
                Ok(None) => {}
                Err(error) => registration.error = Some(error),
            }
            self.status.profiles.push(registration);
        }
        self.sync_startup(&document);
        self.bytes = Some(bytes);
        self.document = document;
        self.remember_close_policy();
        self.publish();
    }

    fn remember_close_policy(&self) {
        if let Ok(mut profiles) = self.close_on_exit.lock() {
            *profiles = self
                .document
                .profiles
                .iter()
                .filter(|profile| {
                    profile.effective_policy().exit == launcher::policy::Close::Started
                })
                .map(|profile| profile.id.clone())
                .collect();
        }
    }

    fn sync_startup(&mut self, document: &Document) {
        let startup_profile = document
            .profiles
            .iter()
            .find(|p| p.launch_on_windows_startup);
        if self.startup {
            let command = startup_profile
                .map(|profile| {
                    std::env::current_exe().and_then(|exe| {
                        triggers_win::startup_command(&exe, &self.path, &profile.id)
                    })
                })
                .transpose();
            let result = command.and_then(|command| {
                triggers_win::sync_run(
                    triggers_win::RUN_KEY,
                    triggers_win::RUN_VALUE,
                    command.as_deref(),
                )
            });
            match result {
                Ok(()) => self.status.startup_profile = startup_profile.map(|p| p.id.clone()),
                Err(error) => self.status.error = Some(format!("inicio Windows: {error}")),
            }
        }
    }

    fn launch(&mut self, id: &str) {
        if self.chain.is_some() {
            self.status.error = Some("ya hay una cadena residente activa".into());
            return;
        }
        let Some(profile) = self.document.profiles.iter().find(|p| p.id == id).cloned() else {
            self.status.error = Some("perfil inexistente".into());
            return;
        };
        match Chain::start(
            self.document.clone(),
            profile,
            |apps| Discovery::scan(apps, Sources::system()),
            self.processes.clone(),
            None,
        ) {
            Ok(chain) => {
                self.status.error = None;
                self.chain = Some(chain);
            }
            Err(error) => self.status.error = Some(error),
        }
        self.publish();
    }

    fn request(&mut self) {
        let path = request_path(&self.path);
        if !path.exists() {
            return;
        }
        let request = files::read(&path, 4096).and_then(|bytes| {
            serde_json::from_slice::<Request>(&bytes)
                .map_err(|error| format!("petición Launcher: {error}"))
        });
        if let Err(error) = std::fs::remove_file(path) {
            self.status.error = Some(format!("consumir petición: {error}"));
            return;
        }
        match request {
            Ok(Request::Launch { profile }) => self.launch(&profile),
            Ok(Request::Answer { decision, action }) => {
                // El descarte de Parar/Continuar cancela, aunque no tenga botón Cancel.
                // El ID sigue siendo obligatorio; una decisión de cierre conserva sus opciones.
                let cancel_dismissed = action == Action::Cancel.label()
                    && self.status.decision.as_ref().is_some_and(|current| {
                        current.id == decision
                            && !current.actions.contains(&action)
                            && !current
                                .actions
                                .iter()
                                .any(|label| label == Action::Leave.label())
                    });
                let selected = self
                    .status
                    .decision
                    .as_ref()
                    .filter(|d| {
                        d.id == decision && (d.actions.contains(&action) || cancel_dismissed)
                    })
                    .and_then(|_| action_from_label(&action));
                if let (Some(chain), Some(action), Some(local_id)) =
                    (&self.chain, selected, self.chain_decision)
                {
                    let result = if cancel_dismissed {
                        chain.cancel();
                        Ok(())
                    } else {
                        chain.answer(local_id, action)
                    };
                    match result {
                        Ok(()) => {
                            self.status.decision = None;
                            self.chain_decision = None;
                        }
                        Err(error) => self.status.error = Some(error),
                    }
                } else {
                    self.status.error = Some("decisión residente caducada o inválida".into());
                }
            }
            Err(error) => self.status.error = Some(error),
        }
        self.publish();
    }

    fn progress(&mut self) {
        let Some(chain) = &self.chain else {
            return;
        };
        let mut changed = false;
        for progress in chain.progress.try_iter() {
            self.status.progress = progress.message;
            if let Some(decision) = progress.decision {
                self.decision_serial = self.decision_serial.saturating_add(1);
                self.chain_decision = Some(decision.id);
                self.status.decision = Some(Decision {
                    id: self.decision_serial,
                    message: decision.message,
                    actions: decision
                        .actions
                        .iter()
                        .map(|action| action.label().into())
                        .collect(),
                });
            }
            changed = true;
        }
        if chain.finished()
            && let Some(mut chain) = self.chain.take()
        {
            if let Err(error) = chain.shutdown() {
                self.status.error = Some(error);
            }
            self.status.decision = None;
            self.chain_decision = None;
        }
        if changed {
            self.publish();
        }
    }

    fn publish(&mut self) {
        self.status.version = 1;
        self.status.updated_ms = vantare_ipc::launcher::now_ms();
        self.write_status();
    }

    fn write_status(&self) {
        let path = status_path(&self.path);
        let result = serde_json::to_vec(&self.status)
            .map_err(|error| error.to_string())
            .and_then(|bytes| {
                let current = if path.exists() {
                    Some(files::read(&path, files::MAX_DOCUMENT)?)
                } else {
                    None
                };
                files::save(&path, &bytes, current.as_deref())
            });
        if let Err(error) = result {
            let _written = writeln!(std::io::stderr(), "estado Launcher residente: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, sync::mpsc};

    #[test]
    fn launcher_action_labels_round_trip_through_resident_decoder() {
        for expected in [
            Action::Trust,
            Action::Reuse,
            Action::Restart,
            Action::Cancel,
            Action::Stop,
            Action::Continue,
            Action::Leave,
            Action::CloseStarted,
        ] {
            let bytes = serde_json::to_vec(&Request::Answer {
                decision: 42,
                action: expected.label().into(),
            })
            .expect("petición real del buzón");
            let Request::Answer { decision, action } =
                serde_json::from_slice(&bytes).expect("leer petición real")
            else {
                panic!("Answer")
            };
            assert_eq!(decision, 42);
            assert_eq!(action_from_label(&action), Some(expected));
        }
        assert_eq!(action_from_label("acción desconocida"), None);
    }

    #[test]
    fn future_launcher_document_is_rejected_without_rewriting_it() {
        let dir = std::env::temp_dir().join(format!(
            "r12-future-{}",
            vantare_services::random_id().expect("documento aislado del residente")
        ));
        fs::create_dir(&dir).expect("documento aislado del residente");
        let path = dir.join("launcher.json");
        let document = Document {
            version: 2,
            ..Document::default()
        };
        let bytes = serde_json::to_vec_pretty(&document).expect("documento aislado del residente");
        fs::write(&path, &bytes).expect("documento aislado del residente");
        let mut owner = Owner::new(path.clone(), false);
        owner.reload();
        assert!(owner.status.error.is_some());
        assert!(owner.document.profiles.is_empty());
        assert_eq!(
            fs::read(&path).expect("documento aislado del residente"),
            bytes
        );
        fs::remove_dir_all(dir).expect("documento aislado del residente");
    }

    #[test]
    fn resident_restores_archived_import_provenance_without_rewriting() {
        let dir = std::env::temp_dir().join(format!(
            "r12-origin-{}",
            vantare_services::random_id().expect("documento aislado del residente")
        ));
        fs::create_dir(&dir).expect("documento aislado del residente");
        let path = dir.join("launcher.json");
        let mut value =
            serde_json::to_value(Document::default()).expect("documento aislado del residente");
        value["profiles"] =
            serde_json::json!([launcher::Profile::new("legacy".into(), "Importado".into())]);
        value["wails_import"] = serde_json::json!({"source":"D:/VantareServer/qa/archive.json", "launcher":{"launcherProfiles":[{"id":"legacy"}]}});
        let bytes = serde_json::to_vec_pretty(&value).expect("documento aislado del residente");
        fs::write(&path, &bytes).expect("documento aislado del residente");
        let mut owner = Owner::new(path.clone(), false);
        owner.reload();
        let imported = owner.document.profiles[0].imported;
        let unchanged = fs::read(&path).expect("documento aislado del residente") == bytes;
        fs::remove_dir_all(dir).expect("documento aislado del residente");
        assert!(unchanged);
        assert!(imported);
    }

    fn failure_decision_owner(root: &std::path::Path) -> Owner {
        let mut owner = Owner::new(root.join("launcher.json"), false);
        let mut profile = launcher::Profile::new("qa".into(), "QA".into());
        profile.policy = Some(launcher::policy::Policy {
            failure: launcher::policy::Failure::Ask,
            ..launcher::policy::Policy::default()
        });
        for name in ["fallo", "no-lanzar"] {
            let executable = root.join(format!("{name}.exe"));
            fs::write(&executable, b"invalid QA PE").expect("fixture");
            let app_id = owner
                .document
                .add_app(name.into(), executable)
                .expect("app QA");
            profile.steps.push(launcher::Step {
                app_id,
                delay_seconds: 0,
                args_override: None,
            });
        }
        let found = Discovery::scan(&owner.document.apps, Sources::default());
        owner.chain = Some(
            Chain::start(
                owner.document.clone(),
                profile,
                move |_| found,
                owner.processes.clone(),
                None,
            )
            .expect("cadena QA"),
        );
        let decision = loop {
            let progress = owner
                .chain
                .as_ref()
                .expect("cadena")
                .progress
                .recv_timeout(Duration::from_secs(5))
                .expect("decisión tras fallo de spawn");
            if let Some(decision) = progress.decision {
                break decision;
            }
        };
        assert_eq!(
            decision.actions,
            [
                launcher::chain::Action::Stop,
                launcher::chain::Action::Continue
            ]
        );
        owner.chain_decision = Some(decision.id);
        owner.status.decision = Some(Decision {
            id: 42,
            message: decision.message,
            actions: decision
                .actions
                .iter()
                .map(|action| action.label().into())
                .collect(),
        });
        owner
    }

    #[test]
    fn concurrent_status_clears_running_when_the_finished_worker_has_no_events_left() {
        let root = std::env::temp_dir().join(format!("resident-running-{}",
            vantare_services::random_id().unwrap()));
        fs::create_dir(&root).unwrap();
        let mut owner = failure_decision_owner(&root);
        let read_running = |settings: &std::path::Path| {
            let value: serde_json::Value = serde_json::from_slice(&fs::read(status_path(settings)).unwrap()).unwrap();
            value["running"].clone()
        };
        owner.publish();
        let while_waiting = read_running(&owner.path);
        let chain = owner.chain.as_mut().unwrap();
        chain.shutdown().unwrap();
        let _drained: Vec<_> = chain.progress.try_iter().collect();
        assert!(chain.finished());
        owner.progress();
        assert!(owner.chain.is_none(), "se recoge el worker aunque no queden eventos");
        let after_finished = read_running(&owner.path);
        drop(owner);
        fs::remove_dir_all(root).unwrap();
        assert_eq!(while_waiting, serde_json::Value::Bool(true));
        assert_eq!(after_finished, serde_json::Value::Bool(false));
    }

    #[test]
    fn dismiss_cancel_stops_the_matching_failure_decision_but_rejects_a_stale_one() {
        let root = std::env::temp_dir().join(format!(
            "resident-dismiss-{}",
            vantare_services::random_id().expect("id QA")
        ));
        fs::create_dir(&root).expect("raíz QA");
        let mut owner = failure_decision_owner(&root);
        for id in [41, 42] {
            fs::write(
                request_path(&owner.path),
                serde_json::to_vec(&Request::Answer {
                    decision: id,
                    action: launcher::chain::Action::Cancel.label().into(),
                })
                .expect("petición QA"),
            )
            .expect("buzón QA");
            owner.request();
            if id == 41 {
                assert_eq!(
                    owner
                        .status
                        .decision
                        .as_ref()
                        .expect("no cancelar otro ID")
                        .id,
                    42
                );
                assert!(!owner.chain.as_ref().expect("cadena esperando").finished());
            }
        }
        assert!(
            owner.status.decision.is_none(),
            "descartar debe cancelar esta decisión aunque Cancel no sea un botón"
        );
        let mut cancelled = false;
        loop {
            let result = owner
                .chain
                .as_ref()
                .expect("cadena")
                .progress
                .recv_timeout(Duration::from_secs(5));
            match result {
                Ok(progress) => {
                    assert_ne!(progress.step, Some(1), "no lanzar el siguiente paso");
                    if progress.step.is_none()
                        && progress.status == launcher::chain::Status::Cancelled
                    {
                        assert!(!progress.success);
                        cancelled = true;
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    panic!("el worker debe terminar al cancelar")
                }
            }
        }
        assert!(
            cancelled,
            "evento terminal Cancelled antes del cierre del canal"
        );
        owner
            .chain
            .take()
            .expect("cadena")
            .shutdown()
            .expect("join QA");
        fs::remove_dir_all(root).expect("limpiar QA");
    }

    struct ReleaseWorker(mpsc::Sender<()>);
    impl Drop for ReleaseWorker {
        fn drop(&mut self) {
            let _released = self.0.send(());
        }
    }

    #[test]
    fn nonblocking_shutdown_keeps_the_final_atomic_status_cleanup() {
        let dir = std::env::temp_dir().join(format!(
            "resident-p2-{}",
            vantare_services::random_id().expect("id")
        ));
        fs::create_dir(&dir).expect("raíz propia");
        let path = dir.join("launcher.json");
        let mut resident =
            Resident::start(path.clone(), None, false).expect("residente sin registro Startup");
        resident.request_shutdown();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while !resident.poll_shutdown().expect("recoger sólo al terminar") {
            assert!(
                std::time::Instant::now() < deadline,
                "cleanup normal termina"
            );
            thread::yield_now();
        }
        let status: Status =
            serde_json::from_slice(&fs::read(status_path(&path)).expect("documento final visible"))
                .expect("estado final completo, sin aplicar TTL al heartbeat cero de cierre");
        assert_eq!(status.updated_ms, 0);
        assert!(resident.thread.is_none());
        drop(resident);
        fs::remove_dir_all(dir).expect("limpiar sólo raíz propia");
    }

    #[test]
    fn forced_cleanup_closes_owned_profile_apps_even_when_the_worker_is_blocked() {
        force_profile_cleanup(false);
    }

    #[test]
    fn forced_cleanup_retries_a_busy_process_registry_and_closes_the_owned_app() {
        force_profile_cleanup(true);
    }

    fn force_profile_cleanup(contended: bool) {
        use std::os::windows::{
            io::{AsHandle, AsRawHandle},
            process::CommandExt,
        };
        use std::process::{Command, Stdio};
        let mut child = Command::new("cmd.exe")
            .args(["/D", "/C", "set /p line="])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(0x0800_0000)
            .spawn()
            .expect("app propia de perfil");
        let _input = child.stdin.take();
        let observed = child
            .as_handle()
            .try_clone_to_owned()
            .expect("identidad por handle");
        let processes = Arc::new(Mutex::new(launcher::processes::Processes::default()));
        processes.lock().expect("registro").record(
            "rig",
            "fixture",
            std::path::Path::new("cmd.exe"),
            child,
        );
        let (release, wait) = mpsc::channel();
        let (ready, held) = mpsc::channel();
        let (unlocked, released) = mpsc::channel();
        let worker_processes = Arc::clone(&processes);
        let worker = thread::spawn(move || {
            let guard = contended.then(|| worker_processes.lock().expect("registro ocupado"));
            ready.send(()).expect("barrera antes del cierre");
            let _released = wait.recv();
            drop(guard);
            let _notified = unlocked.send(());
        });
        held.recv_timeout(Duration::from_secs(5))
            .expect("worker listo");
        let mut resident = Resident {
            stop: Arc::new(AtomicBool::new(false)),
            thread: Some(worker),
            processes,
            close_on_exit: Arc::new(Mutex::new(vec!["rig".into()])),
        };
        let release = ReleaseWorker(release);
        resident.request_shutdown();
        assert!(!resident.poll_shutdown().expect("worker todavía bloqueado"));
        if contended {
            let mut retries = 0;
            resident
                .force_cleanup_with_retry(|| {
                    retries += 1;
                    release
                        .0
                        .send(())
                        .expect("liberar el registro en el primer reintento");
                    released
                        .recv_timeout(Duration::from_secs(5))
                        .expect("registro libre");
                })
                .expect("Close::Started tras recuperar el registro");
            assert_eq!(retries, 1, "el primer try_lock encuentra contención real");
        } else {
            resident
                .force_cleanup()
                .expect("Close::Started sin depender del worker ni del Job");
        }
        // La espera pertenece al test, nunca al camino forzado del supervisor.
        assert_eq!(
            super::super::win::wait_any(&[observed.as_raw_handle()], Some(Duration::from_secs(5)))
                .expect("salida de app propia"),
            Some(0)
        );
        if !contended {
            release.0.send(()).expect("liberar fixture");
        }
        // Drop normal recoge el worker liberado; no queda ningún hilo del test.
        drop(resident);
    }

    #[test]
    fn forced_cleanup_gives_up_after_three_retries_of_a_busy_registry() {
        let processes = Arc::new(Mutex::new(launcher::processes::Processes::default()));
        let resident = Resident {
            stop: Arc::new(AtomicBool::new(false)),
            thread: None,
            processes: Arc::clone(&processes),
            close_on_exit: Arc::new(Mutex::new(vec!["rig".into()])),
        };
        let held = processes
            .lock()
            .expect("registro ocupado durante todo el cierre");
        let mut retries = 0;
        assert!(resident.force_cleanup_with_retry(|| retries += 1).is_err());
        assert_eq!(retries, 3, "no hay espera ilimitada después de P");
        drop(held);
    }

    #[test]
    fn removal_between_existence_and_metadata_is_a_missing_document() {
        let dir =
            std::env::temp_dir().join(format!("vantare-resident-remove-{}", std::process::id()));
        fs::create_dir(&dir).expect("directorio propio");
        let path = dir.join("launcher.json");
        fs::write(&path, b"{}").expect("archivo propio");
        let mut owner = Owner::new(path, false);
        owner.reload_with_metadata(|path| {
            fs::remove_file(path).expect("eliminación concurrente controlada");
            fs::metadata(path)
        });
        let error = owner.status.error.clone();
        let empty = owner.document.profiles.is_empty();
        fs::remove_dir_all(dir).expect("limpiar directorio propio");
        assert!(
            error.is_none(),
            "un archivo ausente no es JSON corrupto: {error:?}"
        );
        assert!(empty);
    }

    #[test]
    fn ipc_launch_consumes_request_and_runs_the_shared_chain_without_hub() {
        // Las apps detached nacen bajo el Job del supervisor, también en el arnés.
        super::super::win::adopt_self_in_job().expect("Job de sesión con breakaway permitido");
        let dir =
            std::env::temp_dir().join(format!("vantare-resident-chain-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("directorio propio");
        let settings = dir.join("launcher.json");
        let executable = dir.join("fixture cmd.exe");
        let system = PathBuf::from(std::env::var_os("SystemRoot").expect("Windows"))
            .join("System32/cmd.exe");
        fs::copy(system, &executable).expect("ejecutable real aislado");
        let mut owner = Owner::new(settings.clone(), false);
        let app = owner
            .document
            .add_app("Fixture".into(), executable.clone())
            .expect("app");
        owner.document.apps.last_mut().expect("app").args =
            vec!["/d".into(), "/c".into(), "exit 0".into()];
        let mut profile = launcher::Profile::new("rig".into(), "Rig".into());
        profile.reuse_running = false;
        profile.steps.push(launcher::Step {
            app_id: app,
            delay_seconds: 0,
            args_override: None,
        });
        owner.document.profiles.push(profile);
        let request = Request::Launch {
            profile: "rig".into(),
        };
        fs::write(
            request_path(&settings),
            serde_json::to_vec(&request).expect("petición"),
        )
        .expect("buzón");
        owner.request();
        assert!(!request_path(&settings).exists());
        let chain = owner.chain.as_ref().expect("cadena creada sin Hub");
        let mut launched = false;
        loop {
            let event = chain
                .progress
                .recv_timeout(Duration::from_secs(20))
                .expect("progreso real");
            assert_ne!(
                event.status,
                launcher::chain::Status::Failed,
                "{}",
                event.message
            );
            launched |= event.status == launcher::chain::Status::Launching;
            if event.status == launcher::chain::Status::Done {
                assert!(event.success, "{}", event.message);
                break;
            }
        }
        assert!(launched);
        owner
            .chain
            .take()
            .expect("cadena")
            .shutdown()
            .expect("join");
        owner
            .processes
            .lock()
            .expect("registro")
            .close_profile("rig")
            .expect("cerrar solo propia");
        fs::remove_file(status_path(&settings)).expect("limpiar estado");
        fs::remove_file(executable).expect("limpiar fixture");
        fs::remove_dir_all(dir).expect("limpiar directorio propio y locks del SO");
    }

    #[test]
    fn reload_releases_hotkeys_reports_real_conflicts_and_recovers() {
        let dir = std::env::temp_dir().join(format!("vantare-resident-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("directorio propio");
        let path = dir.join("launcher.json");
        let (reserved, receive) = mpsc::channel();
        let (release, wait) = mpsc::channel();
        let competitor = thread::spawn(move || {
            let combo = (b'0'..=b'9')
                .find_map(|key| {
                    let raw = format!("ctrl+alt+shift+{}", char::from(key));
                    let hotkey = Hotkey::parse(&raw).expect("parsear").expect("atajo");
                    triggers_win::register(700, hotkey).ok().map(|()| raw)
                })
                .expect("una combinación libre");
            reserved.send(combo).expect("publicar reserva");
            wait.recv_timeout(Duration::from_secs(20))
                .expect("liberar reserva");
            triggers_win::unregister(700);
        });
        let combo = receive
            .recv_timeout(Duration::from_secs(10))
            .expect("reserva real en otro hilo");
        let mut document = Document::default();
        let mut profile = launcher::Profile::new("rig".into(), "Rig".into());
        profile.hotkey = combo;
        document.profiles.push(profile);
        let mut store = launcher::Store::load(path.clone()).expect("store aislado");
        store.replace(document.clone()).expect("persistir");
        let mut owner = Owner::new(path.clone(), false);
        owner.reload();
        assert!(owner.hotkeys.is_empty());
        assert!(owner.status.profiles[0].error.is_some());
        release.send(()).expect("liberar otro hilo");
        competitor.join().expect("cerrar competidor");
        owner.reload();
        assert_eq!(owner.hotkeys.len(), 1);
        assert!(owner.status.profiles[0].registered);
        fs::write(&path, b"{").expect("corrupción aislada");
        owner.reload();
        assert_eq!(
            owner.hotkeys.len(),
            1,
            "conservar última configuración válida"
        );
        assert!(owner.status.error.is_some());
        fs::write(&path, []).expect("archivo vacío corrupto");
        owner.reload();
        assert!(owner.status.error.is_some());
        fs::write(&path, serde_json::to_vec(&document).expect("JSON")).expect("restaurar");
        owner.reload();
        assert!(owner.status.error.is_none());
        document.profiles[0].hotkey.clear();
        fs::write(&path, serde_json::to_vec(&document).expect("JSON")).expect("desactivar");
        owner.reload();
        assert!(owner.hotkeys.is_empty());
        assert!(!owner.status.profiles[0].registered);
        assert!(vantare_ipc::launcher::read_status(&path).is_some());
        fs::remove_file(&path).expect("borrar ajustes propios");
        owner.reload();
        assert!(owner.status.profiles.is_empty());
        fs::remove_file(status_path(&path)).expect("limpiar estado");
        fs::remove_dir_all(dir).expect("limpiar directorio propio y locks del SO");
    }
}
