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
pub use vantare_ipc::launcher::Action;
mod pending;
mod lease;
pub use lease::acquire as acquire_lease;
mod results;
pub use pending::AnswerError;
use pending::{Pending, Poll};
pub use results::StepSnapshot;
pub use vantare_ipc::launcher::execution::{CancelReason, ChainFailure, ChainOutcome};
use vantare_ipc::launcher::results::StepState;

#[derive(Debug)]
pub enum StartError {
    Busy(String),
    Invalid(String),
    Io(String),
}
impl std::fmt::Display for StartError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Busy(message) | Self::Invalid(message) | Self::Io(message) => {
                f.write_str(message)
            }
        }
    }
}
impl std::error::Error for StartError {}

fn chain_lock_busy(error: &std::io::Error) -> bool {
    #[cfg(windows)]
    return matches!(error.raw_os_error(), Some(32 | 33));
    #[cfg(not(windows))]
    {
        let _ = error;
        false
    }
}

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

#[derive(Clone, Debug)]
pub struct Decision {
    pub id: u64,
    pub message: String,
    pub actions: Vec<Action>,
}

struct RunContext {
    results: Arc<Mutex<StepSnapshot>>,
    cancel: Arc<Cancellation>,
    sender: Sender<Progress>,
    answers: Receiver<(u64, Action)>,
    pending: Arc<Pending>,
    processes: processes::Shared,
    next_decision: AtomicU64,
    selected: Vec<usize>,
    failure: Mutex<Option<ChainFailure>>,
    trust_declined: AtomicBool,
}
impl RunContext {
    fn emit_step(
        &self,
        index: usize,
        status: Status,
        pid: Option<u32>,
        message: String,
        success: bool,
    ) -> bool {
        self.mark_step(
            index,
            match status {
                Status::Pending | Status::Waiting => StepState::Waiting,
                Status::Launching => StepState::Launching,
                Status::Ready | Status::Done => StepState::Ready,
                Status::Failed => StepState::Failed,
                Status::Cancelled => StepState::Cancelled,
            },
        );
        let sent = emit(&self.sender, Some(index), status, pid, message, success);
        if !sent && let Ok(mut failure) = self.failure.lock() {
            *failure = Some(ChainFailure::Internal);
        }
        sent
    }
    fn mark_step(&self, index: usize, state: StepState) {
        if let Ok(mut results) = self.results.lock() {
            results.mark(index, state);
        }
    }
    fn finish_steps(&self, cancelled: bool) {
        if let Ok(mut results) = self.results.lock() {
            results.finish(cancelled);
        }
    }
    fn ask(
        &self,
        step: Option<usize>,
        message: String,
        actions: &[Action],
        closing: bool,
    ) -> Result<Action, String> {
        if let Some(index) = step {
            self.mark_step(index, StepState::Waiting);
        }
        let started = Instant::now();
        self.ask_with(
            step,
            message,
            actions,
            closing,
            Arc::new(move || started.elapsed()),
            |receiver| receiver.recv_timeout(Duration::from_millis(50)),
        )
    }
    fn ask_with(
        &self,
        step: Option<usize>,
        message: String,
        actions: &[Action],
        closing: bool,
        clock: pending::Clock,
        receive: impl Fn(&Receiver<(u64, Action)>) -> Result<(u64, Action), mpsc::RecvTimeoutError>,
    ) -> Result<Action, String> {
        let id = self
            .next_decision
            .try_update(Ordering::Relaxed, Ordering::Relaxed, |id| id.checked_add(1))
            .map_err(|_| "identificador de pregunta agotado")?;
        let _pending = self.pending.open(id, actions, closing, clock)?;
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
        let interrupted = || {
            if self.cancel.shutdown.load(Ordering::Acquire) {
                Some(if closing {
                    Action::Leave
                } else {
                    Action::Cancel
                })
            } else if !closing && self.cancel.cancelled() {
                Some(Action::Cancel)
            } else {
                None
            }
        };
        loop {
            if let Poll::Answer(action) = self.pending.poll(id, false, None, interrupted)? {
                return Ok(action);
            }
            let legacy = match receive(&self.answers) {
                Ok((reply_id, action)) if reply_id == id && actions.contains(&action) => {
                    Some(action)
                }
                Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => None,
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return self.pending.close(
                        id,
                        if closing {
                            Action::Leave
                        } else {
                            Action::Cancel
                        },
                    );
                }
            };
            match self.pending.poll(id, true, legacy, || None)? {
                Poll::Answer(action) => return Ok(action),
                Poll::Waiting => {}
                Poll::Expired => {
                    if let Ok(mut failure) = self.failure.lock() {
                        *failure = Some(ChainFailure::DecisionExpired);
                    }
                    return Err("decisión caducada; no se ha cerrado ninguna app".into());
                }
            }
        }
    }
}

#[derive(Default)]
pub struct Cancellation {
    stopped: Mutex<bool>,
    shutdown: AtomicBool,
    finished: AtomicBool,
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
    /// Commit to finalization while taking the last cancellation snapshot.
    /// Cleanup can still ask a closing question, but no new cancellation is accepted.
    fn commit_terminal(&self) -> bool {
        let stopped = self.stopped.lock();
        let cancelled = stopped.as_ref().map_or(true, |guard| **guard);
        self.finished.store(true, Ordering::Release);
        cancelled
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

/// Fallback for unwinding before the normal terminal commitment.
struct Completion(Arc<Cancellation>);
impl Drop for Completion {
    fn drop(&mut self) {
        self.0.commit_terminal();
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CancelError {
    Finished,
    Unavailable,
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
    results: Arc<Mutex<StepSnapshot>>,
    pub progress: Receiver<Progress>,
    cancel: Arc<Cancellation>,
    answers: Sender<(u64, Action)>,
    pending: Arc<Pending>,
    worker: Option<JoinHandle<ChainOutcome>>,
    outcome: Option<ChainOutcome>,
}
impl Chain {
    pub fn start(
        document: Document,
        profile: Profile,
        found: impl FnOnce(&[App]) -> Discovery + Send + 'static,
        processes: processes::Shared,
        selected: Option<Vec<usize>>,
        settings: &std::path::Path,
    ) -> Result<Self, String> {
        Self::start_checked(document, profile, found, processes, selected, settings)
            .map_err(|error| error.to_string())
    }
    pub fn start_checked(
        document: Document,
        profile: Profile,
        found: impl FnOnce(&[App]) -> Discovery + Send + 'static,
        processes: processes::Shared,
        selected: Option<Vec<usize>>,
        settings: &std::path::Path,
    ) -> Result<Self, StartError> {
        let selected = selected.unwrap_or_else(|| (0..profile.steps.len()).collect());
        if selected.is_empty()
            || selected.iter().any(|&index| index >= profile.steps.len())
            || selected.windows(2).any(|pair| pair[0] >= pair[1])
        {
            return Err(StartError::Invalid(
                "seleccion de reintento vacia o invalida".into(),
            ));
        }
        document.validate().map_err(StartError::Invalid)?;
        // Valida también el perfil temporal del lanzamiento de una sola app.
        let mut checked = document.clone();
        checked.profiles = vec![profile.clone()];
        checked.lmu_trigger_profile = None;
        checked.validate().map_err(StartError::Invalid)?;
        let lease = acquire_lease(settings)?;
        let (sender, progress) = mpsc::channel();
        let cancel = Arc::new(Cancellation::default());
        let (answers, replies) = mpsc::channel();
        let pending = Arc::new(Pending::default());
        let results = Arc::new(Mutex::new(
            StepSnapshot::new(profile.steps.len(), &selected)
                .ok_or_else(|| StartError::Invalid("resultados de pasos fuera de limite".into()))?,
        ));
        let context = RunContext {
            results: Arc::clone(&results),
            cancel: cancel.clone(),
            sender,
            answers: replies,
            pending: Arc::clone(&pending),
            processes,
            next_decision: AtomicU64::new(1),
            selected,
            failure: Mutex::new(None),
            trust_declined: AtomicBool::new(false),
        };
        let worker = thread::Builder::new()
            .name("hub-launch-chain".into())
            .spawn(move || {
                let _completion = Completion(Arc::clone(&context.cancel));
                let discovery = found(&document.apps);
                let outcome = run(&document, &profile, &discovery, &context);
                drop(lease);
                outcome
            })
            .map_err(|e| StartError::Io(format!("arrancar cadena: {e}")))?;
        Ok(Self {
            results,
            progress,
            cancel,
            answers,
            pending,
            worker: Some(worker),
            outcome: None,
        })
    }
    pub fn cancel(&self) {
        self.cancel.cancel();
    }
    pub fn step_results(&self) -> Option<StepSnapshot> {
        self.results.lock().ok().map(|r| r.clone())
    }
    /// Acceptance sets the cancellation flag; it does not promise a terminal outcome.
    pub fn cancel_checked(&self) -> Result<(), CancelError> {
        let mut stopped = self
            .cancel
            .stopped
            .lock()
            .map_err(|_| CancelError::Unavailable)?;
        if self.cancel.finished.load(Ordering::Acquire) || self.finished() {
            return Err(CancelError::Finished);
        }
        if !*stopped {
            *stopped = true;
            self.cancel.wake.notify_all();
        }
        Ok(())
    }
    pub fn answer(&self, id: u64, action: Action) -> Result<(), String> {
        self.answers
            .send((id, action))
            .map_err(|e| format!("responder decisión: {e}"))
    }
    pub fn answer_checked(&self, id: u64, action: Action) -> Result<(), AnswerError> {
        self.pending.answer(id, action, || {
            (
                self.cancel.cancelled(),
                self.cancel.shutdown.load(Ordering::Acquire),
            )
        })
    }
    pub fn finished(&self) -> bool {
        self.worker.as_ref().is_none_or(JoinHandle::is_finished)
    }
    pub fn prepare_shutdown(&self) {
        self.cancel.shutdown.store(true, Ordering::Release);
        self.cancel();
    }
    /// Collect only a finished worker. Repeated reads preserve the same terminal.
    pub fn finish(&mut self) -> Option<ChainOutcome> {
        if self.finished() {
            self.collect();
        }
        self.outcome
    }
    fn collect(&mut self) {
        if let Some(worker) = self.worker.take() {
            self.outcome = Some(worker.join().unwrap_or(ChainOutcome::Failed {
                reason: ChainFailure::WorkerPanicked,
            }));
        }
    }
    pub fn shutdown(&mut self) -> Result<(), String> {
        self.prepare_shutdown();
        let collecting = self.worker.is_some();
        self.collect();
        if collecting
            && self.outcome
                == Some(ChainOutcome::Failed {
                    reason: ChainFailure::WorkerPanicked,
                })
        {
            return Err("el worker Launcher terminó con panic".into());
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

fn command(executable: &std::path::Path, args: &[String]) -> Result<Child, String> {
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
        // CREATE_NO_WINDOW conserva las consolas ocultas; BREAKAWAY mantiene las apps fuera del Job.
        command.creation_flags(0x0800_0000 | 0x0100_0000);
    }
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
    let child = command(program, &args)?;
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

fn run(
    document: &Document,
    profile: &Profile,
    discovery: &Discovery,
    context: &RunContext,
) -> ChainOutcome {
    run_with(
        profile,
        context,
        || review_import(document, profile, discovery, context),
        || run_pass(document, profile, discovery, context),
        |delay| context.cancel.wait(delay),
    )
}
fn run_with(
    profile: &Profile,
    context: &RunContext,
    review: impl FnOnce() -> Result<(), String>,
    mut pass: impl FnMut() -> bool,
    mut wait: impl FnMut(Duration) -> bool,
) -> ChainOutcome {
    if profile.imported
        && let Err(message) = review()
    {
        emit(
            &context.sender,
            None,
            Status::Cancelled,
            None,
            message,
            false,
        );
        let cancelled =
            context.cancel.commit_terminal() || context.trust_declined.load(Ordering::Acquire);
        context.finish_steps(cancelled);
        return if cancelled {
            ChainOutcome::Cancelled {
                reason: cancellation_reason(context),
            }
        } else {
            ChainOutcome::Failed {
                reason: context
                    .failure
                    .lock()
                    .ok()
                    .and_then(|f| *f)
                    .unwrap_or(ChainFailure::Internal),
            }
        };
    }
    let policy = profile.effective_policy();
    let retries = if policy.retry == super::policy::Retry::All {
        policy.max_retries
    } else {
        0
    };
    let mut success = false;
    for attempt in 0..=retries {
        if let Ok(mut failure) = context.failure.lock() {
            *failure = None;
        }
        success = pass();
        if success || context.cancel.cancelled() || attempt == retries {
            break;
        }
        if wait(Duration::from_millis(250)) {
            break;
        }
    }
    finish(profile, context, success)
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
        if !context.cancel.cancelled() {
            context.trust_declined.store(true, Ordering::Release);
        }
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
    run_pass_with(document, profile, discovery, context, launch, |delay| {
        context.cancel.wait(delay)
    })
}
fn run_pass_with(
    document: &Document,
    profile: &Profile,
    discovery: &Discovery,
    context: &RunContext,
    mut execute: impl FnMut(
        &App,
        &Step,
        &Profile,
        &Discovery,
        &RunContext,
        usize,
    ) -> Result<u32, String>,
    mut wait: impl FnMut(Duration) -> bool,
) -> bool {
    if let Ok(mut results) = context.results.lock() {
        results.reset(&context.selected);
    }
    let cancel = &context.cancel;
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
        if !context.emit_step(
            index,
            Status::Pending,
            None,
            format!("{} · espera {delay} s", step.app_id),
            false,
        ) {
            return false;
        }
        if wait(Duration::from_secs(u64::from(delay))) {
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
            context.mark_step(index, StepState::Launching);
            result = execute(app, step, profile, discovery, context, index);
            if result.is_ok() || cancel.cancelled() {
                break;
            }
            if attempt < retries && wait(Duration::from_millis(250)) {
                break;
            }
        }
        match result {
            Ok(pid) => {
                if !context.emit_step(index, Status::Ready, Some(pid), app.name.clone(), true) {
                    return false;
                }
            }
            Err(message) => {
                success = false;
                if !context.emit_step(
                    index,
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

fn finish(profile: &Profile, context: &RunContext, success: bool) -> ChainOutcome {
    let cancel = &context.cancel;
    let sender = &context.sender;
    let cancelled = cancel.commit_terminal();
    let mut cleanup_failed = false;
    if cancelled
        && !cancel.shutdown.load(Ordering::Acquire)
        && let Err(error) = close_cancelled(profile, &profile.effective_policy(), context)
    {
        cleanup_failed = true;
        emit(sender, None, Status::Failed, None, error, false);
    }
    context.finish_steps(cancelled);
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
    if cleanup_failed {
        ChainOutcome::Failed {
            reason: ChainFailure::CleanupFailed,
        }
    } else if cancelled {
        ChainOutcome::Cancelled {
            reason: cancellation_reason(context),
        }
    } else if success {
        ChainOutcome::Completed
    } else {
        ChainOutcome::Failed {
            reason: context
                .failure
                .lock()
                .ok()
                .and_then(|f| *f)
                .unwrap_or(ChainFailure::StepFailed),
        }
    }
}
fn cancellation_reason(context: &RunContext) -> CancelReason {
    if context.cancel.shutdown.load(Ordering::Acquire) {
        CancelReason::Shutdown
    } else if context.trust_declined.load(Ordering::Acquire) {
        CancelReason::TrustDeclined
    } else {
        CancelReason::User
    }
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
#[path = "chain/outcome_tests.rs"]
mod outcome_tests;

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
            availability: discovery::Availability::default(),
        });
        let (sender, events) = mpsc::channel();
        let (answers, replies) = mpsc::channel();
        let context = RunContext {
            results: Arc::new(Mutex::new(
                StepSnapshot::new(1, &[0]).expect("fixture results"),
            )),
            cancel: Arc::new(Cancellation::default()),
            sender,
            answers: replies,
            pending: Arc::new(Pending::default()),
            processes: Arc::new(Mutex::new(processes::Processes::default())),
            next_decision: AtomicU64::new(1),
            selected: vec![0],
            failure: Mutex::new(None),
            trust_declined: AtomicBool::new(false),
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

#[cfg(test)]
mod scan_tests {
    use super::*;

    #[test]
    fn scanning_runs_off_the_caller_and_does_not_hold_up_constructor_return() {
        let root = std::env::temp_dir().join(format!(
            "launcher-scan-{}",
            vantare_services::random_id().unwrap()
        ));
        std::fs::create_dir(&root).unwrap();
        let settings = root.join("launcher.json");
        let document = Document::default();
        let mut profile = Profile::new("scan-qa".into(), "Scan QA".into());
        profile.first_step_delay = 3600;
        profile.steps.push(Step {
            app_id: "obs".into(),
            delay_seconds: 0,
            args_override: None,
        });
        // Control positivo: el mismo documento/perfil es válido y no crea procesos.
        let mut snapshot = Chain::start(
            document.clone(),
            profile.clone(),
            move |_| Discovery::default(),
            std::sync::Arc::default(),
            None,
            &settings,
        )
        .unwrap();
        snapshot.shutdown().unwrap();
        let (entered, observed) = mpsc::channel();
        let (release, held) = mpsc::channel();
        let (returned, result) = mpsc::channel();
        let caller = thread::spawn(move || {
            let chain = Chain::start(
                document,
                profile,
                move |apps| {
                    entered.send(thread::current().id()).unwrap();
                    held.recv().unwrap();
                    Discovery::scan(apps, discovery::Sources::default())
                },
                std::sync::Arc::default(),
                None,
                &settings,
            );
            assert!(
                returned.send(chain).is_ok(),
                "resultado del constructor entregado"
            );
        });
        let caller_id = caller.thread().id();
        let scanner_id = observed
            .recv_timeout(Duration::from_secs(5))
            .expect("entrar al scanner");
        // Espera acotada a una señal, sin sleeps: el scanner sigue retenido por el canal.
        // Si ya lo vemos en el caller, el defecto queda demostrado sin agotar el plazo.
        let early = if scanner_id == caller_id {
            None
        } else {
            result.recv_timeout(Duration::from_secs(5)).ok()
        };
        let returned_while_blocked = early.is_some();
        if let Some(Ok(chain)) = &early {
            chain.prepare_shutdown();
        }
        release
            .send(())
            .expect("liberar siempre antes de recoger los hilos");
        let mut chain = early
            .unwrap_or_else(|| {
                result
                    .recv_timeout(Duration::from_secs(5))
                    .expect("constructor después de liberar el scanner")
            })
            .expect("fixture válido");
        caller.join().expect("caller recogido");
        chain
            .shutdown()
            .expect("worker recogido sin crear procesos");
        std::fs::remove_dir_all(root).unwrap();
        assert_ne!(
            scanner_id, caller_id,
            "P7: el scanner ocupa el hilo que llama al constructor"
        );
        assert!(
            returned_while_blocked,
            "el constructor debe volver aun con el scanner retenido"
        );
    }
}
