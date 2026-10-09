//! Cadena cancelable con decisiones y propiedad de procesos de esta sesión.
use super::{
    App, CATALOG, Document, Profile, Step,
    discovery::{self, Discovery},
    is_executable,
    policy::{Close, Failure, Running},
    processes,
};
use std::fmt::Write as _;
use std::{
    process::{Child, Command, Stdio},
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver, Sender},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Status {
    Pending,
    Waiting,
    Launching,
    Ready,
    Failed,
    Cancelled,
    Done,
}
#[derive(Clone, Debug)]
pub struct Progress {
    pub step: Option<usize>,
    pub status: Status,
    pub pid: Option<u32>,
    pub message: String,
    pub success: bool,
    pub decision: Option<Decision>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    Trust,
    Reuse,
    Restart,
    Cancel,
    Stop,
    Continue,
    Leave,
    CloseStarted,
}
impl Action {
    pub fn label(self) -> &'static str {
        match self {
            Self::Trust => "Confiar y lanzar",
            Self::Reuse => "Reutilizar",
            Self::Restart => "Reiniciar",
            Self::Cancel => "Cancelar",
            Self::Stop => "Parar",
            Self::Continue => "Continuar",
            Self::Leave => "Dejar abiertas",
            Self::CloseStarted => "Cerrar solo las iniciadas",
        }
    }
}
#[derive(Clone, Debug)]
pub struct Decision {
    pub id: u64,
    pub message: String,
    pub actions: Vec<Action>,
}

struct RunContext {
    cancel: Arc<Cancellation>,
    sender: Sender<Progress>,
    answers: Receiver<(u64, Action)>,
    processes: processes::Shared,
    next_decision: AtomicU64,
    selected: Vec<usize>,
    detached: bool,
}
impl RunContext {
    fn ask(
        &self,
        step: Option<usize>,
        message: String,
        actions: &[Action],
        closing: bool,
    ) -> Result<Action, String> {
        let id = self.next_decision.fetch_add(1, Ordering::Relaxed);
        let decision = Decision {
            id,
            message: message.clone(),
            actions: actions.to_vec(),
        };
        self.sender
            .send(Progress {
                step,
                status: Status::Waiting,
                pid: None,
                message,
                success: false,
                decision: Some(decision),
            })
            .map_err(|e| format!("publicar decisión: {e}"))?;
        let started = Instant::now();
        loop {
            if self.cancel.shutdown.load(Ordering::Acquire) {
                return Ok(if closing {
                    Action::Leave
                } else {
                    Action::Cancel
                });
            }
            if !closing && self.cancel.cancelled() {
                return Ok(Action::Cancel);
            }
            match self.answers.recv_timeout(Duration::from_millis(50)) {
                Ok((reply_id, action)) if reply_id == id && actions.contains(&action) => {
                    return Ok(action);
                }
                Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Ok(if closing {
                        Action::Leave
                    } else {
                        Action::Cancel
                    });
                }
            }
            if started.elapsed() >= Duration::from_mins(2) {
                return Err("decisión caducada; no se ha cerrado ninguna app".into());
            }
        }
    }
}

#[derive(Default)]
pub struct Cancellation {
    stopped: Mutex<bool>,
    shutdown: AtomicBool,
    wake: Condvar,
}
impl Cancellation {
    pub fn cancel(&self) {
        let mut stopped = match self.stopped.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        *stopped = true;
        self.wake.notify_all();
    }
    pub fn cancelled(&self) -> bool {
        self.stopped.lock().map_or(true, |guard| *guard)
    }
    fn wait(&self, delay: Duration) -> bool {
        let Ok(stopped) = self.stopped.lock() else {
            return true;
        };
        self.wake
            .wait_timeout_while(stopped, delay, |stopped| !*stopped)
            .map_or(true, |(stopped, _)| *stopped)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RetryScope {
    Failed,
    All,
}
pub fn retry_steps(profile: &Profile, progress: &[Progress], scope: RetryScope) -> Vec<usize> {
    (0..profile.steps.len())
        .filter(|index| {
            scope == RetryScope::All
                || progress
                    .iter()
                    .rev()
                    .find(|event| {
                        event.step == Some(*index)
                            && matches!(
                                event.status,
                                Status::Ready | Status::Failed | Status::Cancelled
                            )
                    })
                    .is_some_and(|event| event.status == Status::Failed)
        })
        .collect()
}

pub struct Chain {
    pub progress: Receiver<Progress>,
    cancel: Arc<Cancellation>,
    answers: Sender<(u64, Action)>,
    worker: Option<JoinHandle<()>>,
}
impl Chain {
    pub fn start(
        document: Document,
        profile: Profile,
        discovery: Discovery,
    ) -> Result<Self, String> {
        Self::start_with_processes(
            document,
            profile,
            discovery,
            Arc::new(Mutex::new(processes::Processes::default())),
        )
    }
    pub fn start_with_processes(
        document: Document,
        profile: Profile,
        discovery: Discovery,
        processes: processes::Shared,
    ) -> Result<Self, String> {
        let selected = (0..profile.steps.len()).collect();
        Self::start_selected(document, profile, discovery, processes, selected)
    }
    pub fn start_selected(
        document: Document,
        profile: Profile,
        discovery: Discovery,
        processes: processes::Shared,
        selected: Vec<usize>,
    ) -> Result<Self, String> {
        Self::start_mode(document, profile, discovery, processes, selected, false)
    }
    /// Apps del sim-rig fuera del Job del supervisor; su política Leave sigue siendo real.
    pub fn start_detached(
        document: Document,
        profile: Profile,
        discovery: Discovery,
        processes: processes::Shared,
    ) -> Result<Self, String> {
        let selected = (0..profile.steps.len()).collect();
        Self::start_mode(document, profile, discovery, processes, selected, true)
    }
    fn start_mode(
        document: Document,
        profile: Profile,
        discovery: Discovery,
        processes: processes::Shared,
        selected: Vec<usize>,
        detached: bool,
    ) -> Result<Self, String> {
        if selected.is_empty()
            || selected.iter().any(|&index| index >= profile.steps.len())
            || selected.windows(2).any(|pair| pair[0] >= pair[1])
        {
            return Err("seleccion de reintento vacia o invalida".into());
        }
        document.validate()?;
        // Valida también el perfil temporal del lanzamiento de una sola app.
        let mut checked = document.clone();
        checked.profiles = vec![profile.clone()];
        checked.lmu_trigger_profile = None;
        checked.validate()?;
        if profile.steps.is_empty() {
            return Err("el perfil no tiene pasos".into());
        }
        let (sender, progress) = mpsc::channel();
        let cancel = Arc::new(Cancellation::default());
        let (answers, replies) = mpsc::channel();
        let context = RunContext {
            cancel: cancel.clone(),
            sender,
            answers: replies,
            processes,
            next_decision: AtomicU64::new(1),
            selected,
            detached,
        };
        let worker = thread::Builder::new()
            .name("hub-launch-chain".into())
            .spawn(move || run(&document, &profile, &discovery, &context))
            .map_err(|e| format!("arrancar cadena: {e}"))?;
        Ok(Self {
            progress,
            cancel,
            answers,
            worker: Some(worker),
        })
    }
    pub fn cancel(&self) {
        self.cancel.cancel();
    }
    pub fn answer(&self, id: u64, action: Action) -> Result<(), String> {
        self.answers
            .send((id, action))
            .map_err(|e| format!("responder decisión: {e}"))
    }
    pub fn finished(&self) -> bool {
        self.worker.as_ref().is_none_or(JoinHandle::is_finished)
    }
    pub fn prepare_shutdown(&self) {
        self.cancel.shutdown.store(true, Ordering::Release);
        self.cancel();
    }
    pub fn shutdown(&mut self) -> Result<(), String> {
        self.prepare_shutdown();
        if let Some(worker) = self.worker.take() {
            worker
                .join()
                .map_err(|_| "el worker Launcher terminó con panic")?;
        }
        Ok(())
    }
}
impl Drop for Chain {
    fn drop(&mut self) {
        if let Err(error) = self.shutdown() {
            eprintln!("cerrar cadena: {error}");
        }
    }
}

fn emit(
    sender: &Sender<Progress>,
    step: Option<usize>,
    status: Status,
    pid: Option<u32>,
    message: String,
    success: bool,
) -> bool {
    sender
        .send(Progress {
            step,
            status,
            pid,
            message,
            success,
            decision: None,
        })
        .is_ok()
}

fn command(executable: &std::path::Path, args: &[String], detached: bool) -> Result<Child, String> {
    if !is_executable(executable) {
        return Err(format!("ejecutable ausente: {}", executable.display()));
    }
    let mut command = Command::new(executable);
    command
        .args(args)
        .current_dir(executable.parent().ok_or("ejecutable sin directorio")?)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000 | if detached { 0x0100_0000 } else { 0 }); // CREATE_NO_WINDOW: no consola para helpers.
    }
    #[cfg(not(windows))]
    let _ = detached;
    command
        .spawn()
        .map_err(|e| format!("arrancar {}: {e}", executable.display()))
}

fn resolve_open(
    executable: &std::path::Path,
    app: &App,
    profile: &Profile,
    context: &RunContext,
    index: usize,
) -> Result<Option<u32>, String> {
    let running = discovery::running_all(executable)?;
    if !running.is_empty() {
        let owns = context
            .processes
            .lock()
            .map_err(|e| format!("procesos Launcher: {e}"))?
            .owns(executable, &running)?;
        let action = match profile.effective_policy().already_running {
            Running::Reuse => Action::Reuse,
            Running::Restart => Action::Restart,
            Running::Ask => {
                let actions = if owns {
                    vec![Action::Reuse, Action::Restart, Action::Cancel]
                } else {
                    vec![Action::Reuse, Action::Cancel]
                };
                context.ask(
                    Some(index),
                    format!("{} ya está abierta", app.name),
                    &actions,
                    false,
                )?
            }
        };
        match action {
            Action::Reuse => return Ok(running.first().copied()),
            Action::Restart => context
                .processes
                .lock()
                .map_err(|e| format!("procesos Launcher: {e}"))?
                .restart(executable, &running)?,
            _ => {
                context.cancel.cancel();
                return Err("cadena cancelada".into());
            }
        }
    }
    Ok(None)
}

fn launch(
    app: &App,
    step: &Step,
    profile: &Profile,
    discovery: &Discovery,
    context: &RunContext,
    index: usize,
) -> Result<u32, String> {
    let sender = &context.sender;
    let detected = discovery.app(&app.id).ok_or("app sin descubrimiento")?;
    let executable = detected
        .executable
        .as_ref()
        .filter(|path| is_executable(path))
        .ok_or("app sin ejecutable verificable")?;
    if let Some(pid) = resolve_open(executable, app, profile, context, index)? {
        return Ok(pid);
    }
    context
        .processes
        .lock()
        .map_err(|e| format!("procesos Launcher: {e}"))?
        .available()?;
    let identity =
        std::fs::canonicalize(executable).map_err(|e| format!("identidad del ejecutable: {e}"))?;
    let (program, args, steam) = effective_command(app, step, discovery)?;
    let child = command(program, &args, context.detached)?;
    let pid = child.id();
    let dispatcher = if steam {
        Some(child)
    } else {
        context
            .processes
            .lock()
            .map_err(|e| format!("procesos Launcher: {e}"))?
            .record(&profile.id, &app.id, &identity, child);
        None
    };
    if !emit(
        sender,
        Some(index),
        Status::Launching,
        Some(pid),
        app.name.clone(),
        false,
    ) {
        return Err("vista Launcher cerrada".into());
    }
    probe(executable, steam, pid, dispatcher, context)
}

// Una sola resolución para lo mostrado en la revisión y lo ejecutado después.
fn effective_command<'a>(
    app: &App,
    step: &Step,
    discovery: &'a Discovery,
) -> Result<(&'a std::path::Path, Vec<String>, bool), String> {
    let executable = discovery
        .app(&app.id)
        .and_then(|app| app.executable.as_deref())
        .ok_or("Ruta de aplicación no encontrada")?;
    let mut args = step.args_override.as_ref().unwrap_or(&app.args).clone();
    if app.id == "discord"
        && executable
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case("Update.exe"))
        && args.is_empty()
    {
        args = vec!["--processStart".into(), "Discord.exe".into()];
    }
    if let Some(steam_id) = CATALOG
        .iter()
        .find(|known| known.id == app.id)
        .and_then(|known| known.steam_id)
    {
        let steam = discovery
            .steam_executable
            .as_deref()
            .ok_or("Steam no encontrado; no se puede lanzar el juego")?;
        let mut steam_args = vec!["-applaunch".into(), steam_id.to_string()];
        steam_args.extend(args);
        Ok((steam, steam_args, true))
    } else {
        Ok((executable, args, false))
    }
}

fn probe(
    executable: &std::path::Path,
    steam: bool,
    pid: u32,
    mut dispatcher: Option<Child>,
    context: &RunContext,
) -> Result<u32, String> {
    let cancel = &context.cancel;
    let start = Instant::now();
    let grace = if steam {
        Duration::from_mins(2)
    } else {
        Duration::from_secs(3)
    };
    loop {
        if cancel.cancelled() {
            return Err("cadena cancelada".into());
        }
        if steam && let Some(game_pid) = discovery::running(executable)? {
            return Ok(game_pid);
        }
        let status = if let Some(dispatcher) = &mut dispatcher {
            dispatcher
                .try_wait()
                .map_err(|e| format!("observar dispatcher: {e}"))?
        } else {
            context
                .processes
                .lock()
                .map_err(|e| format!("procesos Launcher: {e}"))?
                .status(pid)?
        };
        if let Some(status) = status {
            if !status.success() {
                return Err(format!("{} terminó con {status}", executable.display()));
            }
            // Steam/bootstrappers pueden salir con 0: solo el ejecutable de juego confirma Steam.
            if !steam {
                return Ok(pid);
            }
        }
        if start.elapsed() >= grace {
            return if steam {
                Err("Steam no produjo un proceso de juego en 120 segundos".into())
            } else {
                Ok(pid)
            };
        }
        if cancel.wait(Duration::from_millis(50)) {
            return Err("cadena cancelada".into());
        }
    }
}

fn run(document: &Document, profile: &Profile, discovery: &Discovery, context: &RunContext) {
    if (profile.imported
        || document.wails_import.as_ref().is_some_and(|import| {
            import
                .launcher
                .get("launcherProfiles")
                .and_then(serde_json::Value::as_array)
                .is_some_and(|profiles| {
                    profiles
                        .iter()
                        .any(|old| old["id"].as_str() == Some(profile.id.as_str()))
                })
        }))
        && let Err(message) = review_import(document, profile, discovery, context)
    {
        emit(
            &context.sender,
            None,
            Status::Cancelled,
            None,
            message,
            false,
        );
        return;
    }
    let policy = profile.effective_policy();
    let retries = if policy.retry == super::policy::Retry::All {
        policy.max_retries
    } else {
        0
    };
    let mut success = false;
    for attempt in 0..=retries {
        success = run_pass(document, profile, discovery, context);
        if success || context.cancel.cancelled() || attempt == retries {
            break;
        }
        if context.cancel.wait(Duration::from_millis(250)) {
            break;
        }
    }
    finish(profile, context, success);
}

fn review_content(
    document: &Document,
    profile: &Profile,
    discovery: &Discovery,
) -> Result<(String, String), String> {
    // Contenido y comandos efectivos: también invalida la confianza si cambia discovery.
    let mut commands = Vec::new();
    let mut message = format!(
        "Este perfil viene de fuera. Revisa lo que abrirá antes de continuar:\n{}\n",
        profile.name
    );
    for step in &profile.steps {
        let app = document
            .apps
            .iter()
            .find(|app| app.id == step.app_id)
            .ok_or("Aplicación no encontrada")?;
        let executable = discovery
            .app(&app.id)
            .and_then(|app| app.executable.as_ref())
            .ok_or("Ruta de aplicación no encontrada")?;
        let (command, args, _) = effective_command(app, step, discovery)?;
        write!(message, "\n{}\nArgumentos: {args:?}\n", command.display())
            .map_err(|e| format!("Revisar argumentos: {e}"))?;
        commands.push((executable, command, args));
    }
    let mut content = profile.clone();
    // Estadísticas de uso no cambian las instrucciones que el usuario ha revisado.
    content.launch_count = 0;
    content.last_launched_at = None;
    content.avg_chain_duration_ms = 0;
    let bytes = serde_json::to_vec(&(content, commands, &discovery.steam_executable))
        .map_err(|e| format!("Revisar perfil: {e}"))?;
    Ok((vantare_services::content_hash(&bytes), message))
}

fn review_import(
    document: &Document,
    profile: &Profile,
    discovery: &Discovery,
    context: &RunContext,
) -> Result<(), String> {
    let root = vantare_services::diagnostics::data_root()
        .map_err(|_| "No se pudo guardar la confianza del perfil")?
        .join("launcher-trust");
    review_at(document, profile, discovery, context, &root)
}

fn review_at(
    document: &Document,
    profile: &Profile,
    discovery: &Discovery,
    context: &RunContext,
    root: &std::path::Path,
) -> Result<(), String> {
    let (hash, message) = review_content(document, profile, discovery)?;
    let path = root.join(format!(
        "{}.json",
        vantare_services::content_hash(profile.id.as_bytes())
    ));
    let saved = if path
        .try_exists()
        .map_err(|e| format!("Leer confianza: {e}"))?
    {
        Some(super::files::read(&path, 64)?)
    } else {
        None
    };
    if saved.as_deref() == Some(hash.as_bytes()) {
        return Ok(());
    }
    if context.ask(None, message, &[Action::Trust, Action::Cancel], false)? != Action::Trust
        || context.cancel.cancelled()
    {
        return Err("Lanzamiento cancelado; no se abrió ninguna aplicación".into());
    }
    std::fs::create_dir_all(root).map_err(|e| format!("Guardar confianza: {e}"))?;
    super::files::save(&path, hash.as_bytes(), saved.as_deref())
}

fn run_pass(
    document: &Document,
    profile: &Profile,
    discovery: &Discovery,
    context: &RunContext,
) -> bool {
    let cancel = &context.cancel;
    let sender = &context.sender;
    let policy = profile.effective_policy();
    let mut success = true;
    for (index, step) in profile
        .steps
        .iter()
        .enumerate()
        .filter(|(index, _)| context.selected.contains(index))
    {
        let delay = if index == 0 {
            policy.first_step_delay
        } else {
            step.delay_seconds
        };
        if !emit(
            sender,
            Some(index),
            Status::Pending,
            None,
            format!("{} · espera {delay} s", step.app_id),
            false,
        ) {
            return false;
        }
        if cancel.wait(Duration::from_secs(u64::from(delay))) {
            success = false;
            break;
        }
        let Some(app) = document.apps.iter().find(|app| app.id == step.app_id) else {
            success = false;
            break;
        };
        let mut result = Err("paso no ejecutado".into());
        let retries = if policy.retry == super::policy::Retry::Failed {
            policy.max_retries
        } else {
            0
        };
        for attempt in 0..=retries {
            if cancel.cancelled() {
                break;
            }
            result = launch(app, step, profile, discovery, context, index);
            if result.is_ok() || cancel.cancelled() {
                break;
            }
            if attempt < retries && cancel.wait(Duration::from_millis(250)) {
                break;
            }
        }
        match result {
            Ok(pid) => {
                if !emit(
                    sender,
                    Some(index),
                    Status::Ready,
                    Some(pid),
                    app.name.clone(),
                    true,
                ) {
                    return false;
                }
            }
            Err(message) => {
                success = false;
                if !emit(
                    sender,
                    Some(index),
                    if cancel.cancelled() {
                        Status::Cancelled
                    } else {
                        Status::Failed
                    },
                    None,
                    message,
                    false,
                ) {
                    return false;
                }
                if cancel.cancelled() {
                    break;
                }
                let action = failure_action(profile, &app.name, index, context);
                if action != Action::Continue {
                    break;
                }
            }
        }
    }
    success
}

fn finish(profile: &Profile, context: &RunContext, success: bool) {
    let cancel = &context.cancel;
    let sender = &context.sender;
    let cancelled = cancel.cancelled();
    if cancelled
        && !cancel.shutdown.load(Ordering::Acquire)
        && let Err(error) = close_cancelled(profile, &profile.effective_policy(), context)
    {
        emit(sender, None, Status::Failed, None, error, false);
    }
    emit(
        sender,
        None,
        if cancelled {
            Status::Cancelled
        } else {
            Status::Done
        },
        None,
        if cancelled {
            "Cadena cancelada"
        } else if success {
            "Cadena completada"
        } else {
            "Cadena terminada con errores"
        }
        .into(),
        success && !cancelled,
    );
}

fn failure_action(profile: &Profile, name: &str, index: usize, context: &RunContext) -> Action {
    match profile.effective_policy().failure {
        Failure::Continue => Action::Continue,
        Failure::Ask if index + 1 < profile.steps.len() => context
            .ask(
                Some(index),
                format!("{name} ha fallado. ¿Continuar con el siguiente paso?"),
                &[Action::Stop, Action::Continue],
                false,
            )
            .unwrap_or_else(|error| {
                emit(
                    &context.sender,
                    Some(index),
                    Status::Failed,
                    None,
                    error,
                    false,
                );
                Action::Stop
            }),
        Failure::Stop | Failure::Ask => Action::Stop,
    }
}

fn close_cancelled(
    profile: &Profile,
    policy: &super::policy::Policy,
    context: &RunContext,
) -> Result<(), String> {
    if !context
        .processes
        .lock()
        .map_err(|e| format!("procesos Launcher: {e}"))?
        .has_profile(&profile.id)?
    {
        return Ok(());
    }
    let action = match policy.cancel {
        Close::Leave => Action::Leave,
        Close::Started => Action::CloseStarted,
        Close::Ask => context.ask(
            None,
            format!("¿Cerrar las aplicaciones iniciadas por {}?", profile.name),
            &[Action::Leave, Action::CloseStarted],
            true,
        )?,
    };
    if action == Action::CloseStarted {
        context
            .processes
            .lock()
            .map_err(|e| format!("procesos Launcher: {e}"))?
            .close_profile(&profile.id)?;
    }
    Ok(())
}

#[cfg(test)]
mod trust_tests {
    use super::*;
    #[test]
    fn cancel_never_remembers_trust_and_content_change_requires_review_again() {
        let root = std::env::temp_dir().join(format!(
            "vantare-trust-{}",
            vantare_services::random_id().expect("test id")
        ));
        let document = Document::default();
        let mut profile = Profile::new("outside".into(), "Externo".into());
        profile.imported = true;
        profile.steps.push(Step {
            app_id: "obs".into(),
            delay_seconds: 0,
            args_override: None,
        });
        let mut discovery = Discovery::default();
        discovery.apps.push(discovery::Detected {
            id: "obs".into(),
            executable: Some(root.join("must-not-execute.exe")),
            source: "test",
            availability: discovery::Availability::default(),
        });
        let (sender, events) = mpsc::channel();
        let (answers, replies) = mpsc::channel();
        let context = RunContext {
            cancel: Arc::new(Cancellation::default()),
            sender,
            answers: replies,
            processes: Arc::new(Mutex::new(processes::Processes::default())),
            next_decision: AtomicU64::new(1),
            selected: vec![0],
            detached: false,
        };
        answers.send((1, Action::Cancel)).expect("cancel");
        assert!(review_at(&document, &profile, &discovery, &context, &root).is_err());
        assert!(!root.exists());
        let decision = events
            .try_recv()
            .expect("review")
            .decision
            .expect("decision");
        assert_eq!(decision.actions, [Action::Trust, Action::Cancel]);
        assert!(decision.message.contains("must-not-execute.exe"));
        answers.send((2, Action::Trust)).expect("trust");
        review_at(&document, &profile, &discovery, &context, &root).expect("accepted");
        events.try_recv().expect("second review");
        review_at(&document, &profile, &discovery, &context, &root).expect("remembered");
        assert!(events.try_recv().is_err());
        profile.steps[0].args_override = Some(vec!["changed".into()]);
        answers.send((3, Action::Cancel)).expect("cancel changed");
        assert!(review_at(&document, &profile, &discovery, &context, &root).is_err());
        assert!(
            events
                .try_recv()
                .expect("changed review")
                .message
                .contains("changed")
        );
        answers.send((4, Action::Trust)).expect("trust changed");
        review_at(&document, &profile, &discovery, &context, &root)
            .expect("new trust replaces old hash");
        std::fs::remove_dir_all(root).expect("cleanup");
    }
    #[test]
    fn reviewed_content_changes_with_profile_arguments_and_resolved_paths() {
        let mut document = Document::default();
        let mut profile = Profile::new("imported".into(), "Perfil externo".into());
        profile.imported = true;
        profile.steps.push(Step {
            app_id: "obs".into(),
            delay_seconds: 0,
            args_override: None,
        });
        let mut discovery = Discovery::default();
        discovery.apps.push(discovery::Detected {
            id: "obs".into(),
            executable: Some(std::path::PathBuf::from("C:/Programs/obs.exe")),
            source: "test",
            availability: discovery::Availability::default(),
        });
        let (hash, message) = review_content(&document, &profile, &discovery).expect("review");
        assert!(message.contains("C:/Programs/obs.exe"));
        profile.launch_count = 1;
        assert_eq!(
            hash,
            review_content(&document, &profile, &discovery)
                .expect("same commands")
                .0
        );
        document
            .apps
            .iter_mut()
            .find(|app| app.id == "obs")
            .expect("obs")
            .args
            .push("--test".into());
        assert_ne!(
            hash,
            review_content(&document, &profile, &discovery)
                .expect("changed args")
                .0
        );
        document
            .apps
            .iter_mut()
            .find(|app| app.id == "obs")
            .expect("obs")
            .args
            .clear();
        discovery.apps[0].executable = Some(std::path::PathBuf::from("D:/Programs/obs.exe"));
        assert_ne!(
            hash,
            review_content(&document, &profile, &discovery)
                .expect("changed path")
                .0
        );
        profile.name.push_str(" editado");
        assert_ne!(
            hash,
            review_content(&document, &profile, &discovery)
                .expect("changed profile")
                .0
        );
    }
}
