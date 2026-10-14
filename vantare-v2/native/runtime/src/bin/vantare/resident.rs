//! El supervisor conserva atajos y cadenas aunque el Hub cierre su ventana.
use super::{launcher, triggers_win};
use launcher::{
    Document,
    chain::Chain,
    discovery::{Discovery, Sources},
    files,
    triggers::Hotkey,
};
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
}

impl Resident {
    pub fn start(path: PathBuf, profile: Option<String>, startup: bool) -> std::io::Result<Self> {
        let stop = Arc::new(AtomicBool::new(false));
        let cancellation = stop.clone();
        let worker = thread::Builder::new()
            .name("launcher-residente".into())
            .spawn(move || {
                let mut owner = Owner::new(path, startup);
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
                    eprintln!("cerrar Launcher residente: {error}");
                }
                if let Ok(mut processes) = owner.processes.lock() {
                    for profile in &owner.document.profiles {
                        if profile.effective_policy().exit == launcher::policy::Close::Started
                            && let Err(error) = processes.close_profile(&profile.id)
                        {
                            eprintln!("cerrar aplicaciones de {}: {error}", profile.id);
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
        })
    }
}

impl Drop for Resident {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.thread.take()
            && worker.join().is_err()
        {
            eprintln!("Launcher residente terminó con panic");
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
            serde_json::from_slice::<Document>(&bytes)
                .map_err(|error| format!("Launcher inválido: {error}"))
        }
        .and_then(|document| {
            document.validate()?;
            Ok(document)
        });
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
        self.publish();
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
        let discovery = Discovery::scan(&self.document.apps, Sources::system());
        match Chain::start_detached(
            self.document.clone(),
            profile,
            discovery,
            self.processes.clone(),
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
                let selected = self
                    .status
                    .decision
                    .as_ref()
                    .filter(|d| d.id == decision && d.actions.contains(&action))
                    .and_then(|_| {
                        [
                            launcher::chain::Action::Trust,
                            launcher::chain::Action::Reuse,
                            launcher::chain::Action::Restart,
                            launcher::chain::Action::Cancel,
                            launcher::chain::Action::Stop,
                            launcher::chain::Action::Continue,
                            launcher::chain::Action::Leave,
                            launcher::chain::Action::CloseStarted,
                        ]
                        .into_iter()
                        .find(|candidate| candidate.label() == action)
                    });
                if let (Some(chain), Some(action), Some(local_id)) =
                    (&self.chain, selected, self.chain_decision)
                {
                    match chain.answer(local_id, action) {
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
            eprintln!("estado Launcher residente: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, sync::mpsc};

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
            launched |= event.status == launcher::chain::Status::Launching;
            if event.status == launcher::chain::Status::Done {
                assert!(event.success);
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
