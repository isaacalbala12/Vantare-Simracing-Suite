//! Cadena cancelable. Cancelar/cerrar Hub deja abiertas las apps ya lanzadas.
use super::{
    App, CATALOG, Document, Profile, Step,
    discovery::{self, Discovery},
    is_executable,
};
use std::{
    process::{Child, Command, Stdio},
    sync::{
        Arc, Condvar, Mutex,
        mpsc::{self, Receiver, Sender},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Status {
    Pending,
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
}

#[derive(Default)]
pub struct Cancellation {
    stopped: Mutex<bool>,
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

pub struct Chain {
    pub progress: Receiver<Progress>,
    cancel: Arc<Cancellation>,
    worker: Option<JoinHandle<()>>,
}
impl Chain {
    pub fn start(
        document: Document,
        profile: Profile,
        discovery: Discovery,
    ) -> Result<Self, String> {
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
        let stopping = cancel.clone();
        let worker = thread::Builder::new()
            .name("hub-launch-chain".into())
            .spawn(move || run(&document, &profile, &discovery, &stopping, &sender))
            .map_err(|e| format!("arrancar cadena: {e}"))?;
        Ok(Self {
            progress,
            cancel,
            worker: Some(worker),
        })
    }
    pub fn cancel(&self) {
        self.cancel.cancel();
    }
    pub fn finished(&self) -> bool {
        self.worker.as_ref().is_none_or(JoinHandle::is_finished)
    }
    pub fn shutdown(&mut self) -> Result<(), String> {
        self.cancel();
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
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no consola para helpers.
    }
    command
        .spawn()
        .map_err(|e| format!("arrancar {}: {e}", executable.display()))
}

fn launch(
    app: &App,
    step: &Step,
    profile: &Profile,
    discovery: &Discovery,
    cancel: &Cancellation,
    sender: &Sender<Progress>,
    index: usize,
) -> Result<u32, String> {
    let detected = discovery.app(&app.id).ok_or("app sin descubrimiento")?;
    let executable = detected
        .executable
        .as_ref()
        .filter(|path| is_executable(path))
        .ok_or("app sin ejecutable verificable")?;
    if profile.reuse_running
        && let Some(pid) = discovery::running(executable)?
    {
        return Ok(pid);
    }
    let mut args = step.args_override.as_ref().unwrap_or(&app.args).clone();
    if app.id == "discord"
        && executable
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case("Update.exe"))
        && args.is_empty()
    {
        args = vec!["--processStart".into(), "Discord.exe".into()];
    }
    let steam_id = CATALOG
        .iter()
        .find(|known| known.id == app.id)
        .and_then(|known| known.steam_id);
    let mut child = if let Some(steam_id) = steam_id {
        let steam = discovery
            .steam_executable
            .as_ref()
            .ok_or("Steam no encontrado; no se puede lanzar el juego")?;
        let mut steam_args = vec!["-applaunch".into(), steam_id.to_string()];
        steam_args.extend(args);
        command(steam, &steam_args)?
    } else {
        command(executable, &args)?
    };
    let pid = child.id();
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
    let start = Instant::now();
    let grace = if steam_id.is_some() {
        Duration::from_mins(2)
    } else {
        Duration::from_secs(3)
    };
    loop {
        if cancel.cancelled() {
            return Err("cadena cancelada; las apps iniciadas permanecen abiertas".into());
        }
        if steam_id.is_some()
            && let Some(game_pid) = discovery::running(executable)?
        {
            return Ok(game_pid);
        }
        if let Some(status) = child
            .try_wait()
            .map_err(|e| format!("observar proceso: {e}"))?
        {
            if !status.success() {
                return Err(format!("{} terminó con {status}", app.name));
            }
            // Steam/bootstrappers pueden salir con 0: solo el ejecutable de juego confirma Steam.
            if steam_id.is_none() {
                return Ok(pid);
            }
        }
        if start.elapsed() >= grace {
            return if steam_id.is_some() {
                Err("Steam no produjo un proceso de juego en 120 segundos".into())
            } else {
                Ok(pid)
            };
        }
        if cancel.wait(Duration::from_millis(50)) {
            return Err("cadena cancelada; las apps iniciadas permanecen abiertas".into());
        }
    }
}

fn run(
    document: &Document,
    profile: &Profile,
    discovery: &Discovery,
    cancel: &Cancellation,
    sender: &Sender<Progress>,
) {
    let mut success = true;
    for (index, step) in profile.steps.iter().enumerate() {
        let delay = if index == 0 {
            profile.first_step_delay
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
            return;
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
        for attempt in 0..=profile.max_retries {
            if cancel.cancelled() {
                break;
            }
            result = launch(app, step, profile, discovery, cancel, sender, index);
            if result.is_ok() || cancel.cancelled() {
                break;
            }
            if attempt < profile.max_retries && cancel.wait(Duration::from_millis(250)) {
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
                    return;
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
                    return;
                }
                if !profile.continue_on_error || cancel.cancelled() {
                    break;
                }
            }
        }
    }
    let cancelled = cancel.cancelled();
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
            "Cadena cancelada; apps iniciadas abiertas"
        } else if success {
            "Cadena completada"
        } else {
            "Cadena terminada con errores"
        }
        .into(),
        success && !cancelled,
    );
}
