//! Launcher `vantare`: arranca `vantare-core` y `vantare-overlays`, los
//! supervisa y los cierra en orden (ADR 0099 §3, ciclo de vida).
//!
//! ```text
//! vantare [--core-bin R] [--overlays-bin R] [--plazo MS] [--reinicios N]
//!         [--instancia S] [-- ARGS-DEL-NÚCLEO [-- ARGS-DE-OVERLAYS]]
//! vantare --parar [--instancia S]
//! ```
//!
//! - **Muerte conjunta:** el launcher se mete en un Job Object que mata a
//!   quien contiene al cerrarse; los hijos nacen dentro.
//! - **Instancia única** por usuario (mutex con nombre): la segunda sale sin
//!   arrancar nada.
//! - **Supervisión:** un hijo que cae (código distinto de 0, o muerto) se
//!   reinicia con espera creciente y un presupuesto de reinicios; agotado, el
//!   launcher registra el motivo, cierra todo y sale con error. Un hijo que
//!   sale con código 0 ha terminado a propósito (overlays cerrado por el
//!   usuario, replay acabado): el launcher cierra todo y sale con 0.
//! - **Cierre** (Ctrl+C, cierre de consola o `vantare --parar`): primero
//!   Engineer (si está habilitado), overlays y después el núcleo; a cada uno se le pide que termine y, pasado
//!   el plazo, se le mata.

#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod win;
// La misma fuente del motor Launcher: no enlaza GPUI ni duplica la ejecución.
#[cfg(windows)]
#[path = "../../../../hub/src/files.rs"]
pub(crate) mod files;
#[cfg(windows)]
#[allow(dead_code)] // El motor también expone operaciones de edición usadas solo por el Hub.
#[path = "../../../../hub/src/launcher/engine.rs"]
mod launcher;
#[cfg(windows)]
mod resident;
#[cfg(windows)]
mod triggers_win;

use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitCode, Stdio};
use std::time::{Duration, Instant};
use std::{env, io};

#[cfg(windows)]
use win::{Instance, Stop};

const USAGE: &str = "uso: vantare [--core-bin R] [--overlays-bin R] [--plazo MS] [--reinicios N] \
[--instancia S] [--launcher-file R] [--launch PERFIL] [--engineer CURSOR] [--engineer-bin R] [-- ARGS-DEL-NÚCLEO [-- ARGS-DE-OVERLAYS [-- ARGS-DE-ENGINEER]]]\n     vantare --parar [--instancia S]";
const DEFAULT_GRACE: Duration = Duration::from_secs(3);
const DEFAULT_RESTARTS: u32 = 5;
/// Espera antes del primer reinicio; se duplica en cada caída seguida.
const BACKOFF: Duration = Duration::from_millis(250);
const BACKOFF_CAP: Duration = Duration::from_secs(8);
/// Un hijo que aguanta tanto en marcha recupera todo el presupuesto.
const STABLE: Duration = Duration::from_secs(30);

fn log(message: impl std::fmt::Display) {
    eprintln!("vantare: {message}");
}

#[derive(Debug, PartialEq, Eq)]
struct Program {
    path: PathBuf,
    args: Vec<String>,
}

#[derive(Debug, PartialEq, Eq)]
struct Config {
    core: Program,
    overlays: Program,
    engineer: Option<Program>,
    grace: Duration,
    restarts: u32,
    /// Sufijo de los nombres de los objetos del sistema, para aislar instancias (pruebas).
    instance: String,
    stop_only: bool,
    launcher_file: Option<PathBuf>,
    launch: Option<String>,
}

fn value<'a>(
    args: &mut impl Iterator<Item = &'a String>,
    name: &str,
) -> Result<&'a String, String> {
    args.next().ok_or_else(|| format!("{name} pide un valor"))
}

fn parse(args: &[String], bin_dir: &Path) -> Result<Config, String> {
    let mut config = Config {
        core: Program {
            path: bin_dir.join(binary_name("vantare-core")),
            args: Vec::new(),
        },
        overlays: Program {
            path: bin_dir.join(binary_name("vantare-overlays")),
            args: Vec::new(),
        },
        engineer: None,
        grace: DEFAULT_GRACE,
        restarts: DEFAULT_RESTARTS,
        instance: String::new(),
        stop_only: false,
        launcher_file: None,
        launch: None,
    };
    let mut args = args.iter();
    let mut engineer_bin = bin_dir.join(binary_name("vantare-engineer"));
    let mut engineer_args = Vec::new();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--core-bin" => config.core.path = value(&mut args, arg)?.into(),
            "--overlays-bin" => config.overlays.path = value(&mut args, arg)?.into(),
            "--engineer-bin" => engineer_bin = value(&mut args, arg)?.into(),
            "--engineer" => {
                config.engineer = Some(Program {
                    path: engineer_bin.clone(),
                    args: vec![
                        "--pipe".into(),
                        "--cursor".into(),
                        value(&mut args, arg)?.clone(),
                    ],
                });
            }
            "--plazo" => {
                let ms = value(&mut args, arg)?
                    .parse()
                    .map_err(|_| "--plazo: milisegundos")?;
                config.grace = Duration::from_millis(ms);
            }
            "--reinicios" => {
                config.restarts = value(&mut args, arg)?
                    .parse()
                    .map_err(|_| "--reinicios: un entero")?;
            }
            "--instancia" => config.instance.clone_from(value(&mut args, arg)?),
            "--parar" => config.stop_only = true,
            "--launcher-file" => config.launcher_file = Some(value(&mut args, arg)?.into()),
            "--launch" => config.launch = Some(value(&mut args, arg)?.clone()),
            flag if flag.starts_with("--launch=") => config.launch = Some(flag[9..].into()),
            "--" => {
                // El resto son argumentos de los hijos: núcleo hasta el siguiente `--`.
                let rest: Vec<String> = args.by_ref().cloned().collect();
                let mut groups = rest.splitn(3, |a| a == "--");
                config.core.args = groups.next().unwrap_or_default().to_vec();
                config.overlays.args = groups.next().unwrap_or_default().to_vec();
                engineer_args = groups.next().unwrap_or_default().to_vec();
            }
            other => return Err(format!("argumento desconocido: {other}")),
        }
    }
    if let Some(engineer) = &mut config.engineer {
        engineer.path = engineer_bin;
        if let Some(pipe) = config.core.args.windows(2).find(|pair| pair[0] == "--pipe") {
            engineer
                .args
                .extend(["--pipe-name".into(), pipe[1].clone()]);
        }
        config.core.args.extend([
            "--engineer-image".into(),
            engineer.path.to_string_lossy().into_owned(),
        ]);
        engineer.args.extend([
            "--core-image".into(),
            config.core.path.to_string_lossy().into_owned(),
        ]);
        engineer.args.extend(engineer_args);
    } else if !engineer_args.is_empty() {
        return Err("argumentos Engineer requieren --engineer R".into());
    }
    if let Some(id) = &config.launch {
        if id.is_empty()
            || id.len() > 128
            || !id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c))
        {
            return Err("--launch: ID de perfil inválido".into());
        }
        if config.stop_only {
            return Err("--launch no se combina con --parar".into());
        }
        if config.core.args.is_empty() {
            config.core.args.push("--live".into());
        }
    }
    Ok(config)
}

fn binary_name(name: &str) -> String {
    #[cfg(windows)]
    {
        format!("{name}.exe")
    }
    #[cfg(unix)]
    {
        name.to_owned()
    }
}

/// Nombres de los objetos del sistema, por usuario (y por `--instancia`).
#[cfg(windows)]
fn object_name(kind: &str, instance: &str) -> String {
    let user = env::var("USERNAME").unwrap_or_else(|_| "usuario".into());
    let suffix = if instance.is_empty() {
        String::new()
    } else {
        format!("-{instance}")
    };
    format!(r"Global\vantare-{kind}-{user}{suffix}")
}

#[cfg(unix)]
fn object_name(kind: &str, instance: &str) -> String {
    let suffix = if instance.is_empty() {
        String::new()
    } else {
        format!("-{instance}")
    };
    format!("vantare-{kind}{suffix}")
}

/// Presupuesto de reinicios de un hijo con espera creciente.
struct Restarts {
    budget: u32,
    attempts: u32,
}

impl Restarts {
    /// Anota una caída tras `ran` en marcha. Devuelve cuánto esperar antes de
    /// reiniciar, o `None` si el presupuesto se agotó.
    fn crashed(&mut self, ran: Duration) -> Option<Duration> {
        if ran >= STABLE {
            self.attempts = 0;
        }
        self.attempts += 1;
        let factor = 2_u32.saturating_pow(self.attempts - 1);
        (self.attempts <= self.budget).then(|| BACKOFF.saturating_mul(factor).min(BACKOFF_CAP))
    }
}

struct Service {
    name: &'static str,
    #[cfg(windows)]
    bootstrap: Option<String>,
    program: Program,
    child: Option<Child>,
    started: Instant,
    restarts: Restarts,
    /// Cuándo (re)arrancar; `None` mientras corre.
    start_at: Option<Instant>,
}

impl Service {
    fn new(name: &'static str, program: Program, budget: u32) -> Self {
        Self {
            name,
            #[cfg(windows)]
            bootstrap: None,
            program,
            child: None,
            started: Instant::now(),
            restarts: Restarts {
                budget,
                attempts: 0,
            },
            start_at: Some(Instant::now()),
        }
    }

    fn spawn(&mut self) -> io::Result<()> {
        let child = Command::new(&self.program.path)
            .args(&self.program.args)
            .stdin(Stdio::piped()) // su cierre es la petición de fin de los hijos sin ventana
            .spawn()?;
        #[cfg(windows)]
        let mut child = child;
        #[cfg(windows)]
        if let Some(nonce) = &self.bootstrap {
            let sent = child
                .stdin
                .as_mut()
                .ok_or_else(|| io::Error::other("bootstrap no disponible"))
                .and_then(|stdin| {
                    vantare_ipc::control::write(
                        stdin,
                        &vantare_ipc::control::Bootstrap {
                            nonce: nonce.clone(),
                        },
                    )
                });
            if let Err(error) = sent {
                let _killed = child.kill();
                let _reaped = child.wait();
                return Err(error);
            }
        }
        log(format_args!("{} en marcha (pid {})", self.name, child.id()));
        self.started = Instant::now();
        self.start_at = None;
        self.child = Some(child);
        Ok(())
    }

    /// Registra una caída y programa el reinicio; `false` si no quedan reinicios.
    fn failed(&mut self) -> bool {
        self.child = None;
        match self.restarts.crashed(self.started.elapsed()) {
            Some(delay) => {
                log(format_args!("{}: reinicio en {delay:?}", self.name));
                self.start_at = Some(Instant::now() + delay);
                true
            }
            None => false,
        }
    }
}

enum Outcome {
    Stopped,
    /// Un hijo terminó a propósito.
    Finished(&'static str),
    Exhausted(&'static str),
}

#[cfg(windows)]
fn supervise(services: &mut [Service], stop: &Stop) -> io::Result<Outcome> {
    use std::os::windows::io::AsRawHandle;
    loop {
        let now = Instant::now();
        for service in services.iter_mut() {
            if service.child.is_none()
                && service.start_at.is_some_and(|at| at <= now)
                && let Err(error) = service.spawn()
            {
                log(format_args!("{}: no arranca: {error}", service.name));
                service.started = now;
                if !service.failed() {
                    return Ok(Outcome::Exhausted(service.name));
                }
            }
        }
        let mut handles = vec![stop.raw()];
        let mut owners = vec![None];
        for (index, service) in services.iter().enumerate() {
            if let Some(child) = &service.child {
                handles.push(child.as_raw_handle());
                owners.push(Some(index));
            }
        }
        let timeout = services
            .iter()
            .filter_map(|s| s.start_at)
            .min()
            .map(|at| at.saturating_duration_since(Instant::now()));
        let Some(signaled) = win::wait_any(&handles, timeout)? else {
            continue; // toca reiniciar a alguien
        };
        let Some(index) = owners[signaled] else {
            return Ok(Outcome::Stopped);
        };
        let service = &mut services[index];
        let status = service.child.as_mut().map(Child::wait).transpose()?;
        if status.is_some_and(|s| s.success()) {
            return Ok(Outcome::Finished(service.name));
        }
        log(format_args!(
            "{} cayó: {}",
            service.name,
            status.map_or_else(String::new, |s| s.to_string())
        ));
        if !service.failed() {
            return Ok(Outcome::Exhausted(service.name));
        }
    }
}

/// Engineer si está habilitado, overlays, núcleo. A cada uno se le pide que termine y se
/// le mata si pasa el plazo.
#[cfg(windows)]
fn shutdown(services: &mut [Service], grace: Duration) {
    for service in services.iter_mut().rev() {
        let Some(child) = service.child.as_mut() else {
            continue;
        };
        win::request_close(child);
        if !win::wait_child(child, grace) {
            log(format_args!(
                "{} no terminó en {grace:?}: se le mata",
                service.name
            ));
            let _ = child.kill();
        }
        let _ = child.wait();
        log(format_args!("{} cerrado", service.name));
    }
}

#[cfg(windows)]
fn start_remote_services(
    config: &mut Config,
) -> io::Result<(vantare_runtime::services::Host, String)> {
    let photo = if let Some(pair) = config.core.args.windows(2).find(|pair| pair[0] == "--pipe") {
        pair[1].clone()
    } else {
        let mut photo = vantare_ipc::default_pipe_name()?;
        if !config.instance.is_empty() {
            photo.push('-');
            photo.push_str(&config.instance);
        }
        config.core.args.extend(["--pipe".into(), photo.clone()]);
        photo
    };
    config.core.args.push("--managed-rights".into());
    if let Some(engineer) = &mut config.engineer
        && !engineer.args.iter().any(|arg| arg == "--pipe-name")
    {
        engineer.args.extend(["--pipe-name".into(), photo.clone()]);
    }
    if !config.overlays.args.iter().any(|arg| arg == "--fuente") {
        config
            .overlays
            .args
            .extend(["--fuente".into(), format!("pipe:{photo}")]);
    }
    let nonce =
        vantare_services::random_id().map_err(|_| io::Error::other("bootstrap no disponible"))?;
    let image = env::current_exe()?;
    let host = vantare_runtime::services::Host::start(
        &photo,
        vantare_runtime::services::Options {
            binary: image.with_file_name("vantare-services.exe"),
            hub: image.with_file_name("vantare-hub.exe"),
            root: None,
            core: vantare_ipc::control::CoreLink {
                pipe: vantare_ipc::control::pipe_name(&photo),
                image: config.core.path.clone(),
                nonce: nonce.clone(),
            },
        },
    )?;
    Ok((host, nonce))
}

#[cfg(windows)]
fn resident_settings(explicit: Option<PathBuf>) -> io::Result<PathBuf> {
    let path = match explicit {
        Some(path) => path,
        None => PathBuf::from(
            env::var_os("LOCALAPPDATA")
                .ok_or_else(|| io::Error::other("LOCALAPPDATA no definido"))?,
        )
        .join("Vantare/native/launcher.json"),
    };
    let path = if path.is_absolute() {
        path
    } else {
        env::current_dir()?.join(path)
    };
    if !launcher::is_local_path(&path) {
        return Err(io::Error::other("Launcher requiere archivo local"));
    }
    Ok(path)
}

#[cfg(windows)]
fn run(mut config: Config) -> io::Result<ExitCode> {
    let Some(_instance) = Instance::acquire(&object_name("launcher", &config.instance))? else {
        if let Some(profile) = config.launch {
            let path = resident_settings(config.launcher_file)?;
            let request = vantare_ipc::launcher::Request::Launch { profile };
            let bytes = serde_json::to_vec(&request).map_err(io::Error::other)?;
            launcher::files::save(&vantare_ipc::launcher::request_path(&path), &bytes, None)
                .map_err(io::Error::other)?;
        }
        log("ya hay una instancia en marcha");
        return Ok(ExitCode::SUCCESS);
    };
    let stop = Stop::create(&object_name("launcher-stop", &config.instance))?;
    win::adopt_self_in_job()?;
    let resident = if config.instance.is_empty() || config.launcher_file.is_some() {
        let path = resident_settings(config.launcher_file.clone())?;
        Some(resident::Resident::start(
            path,
            config.launch.clone(),
            config.instance.is_empty(),
        )?)
    } else {
        None
    };
    vantare_services::diagnostics::record_usage(
        &vantare_services::diagnostics::Usage::AppStarted {
            version: option_env!("VANTARE_VERSION")
                .unwrap_or(env!("CARGO_PKG_VERSION"))
                .into(),
            channel: option_env!("VANTARE_BUILD_CHANNEL")
                .unwrap_or("unknown")
                .into(),
        },
    );
    let remote = start_remote_services(&mut config)?;
    let mut core = Service::new("núcleo", config.core, config.restarts);
    core.bootstrap = Some(remote.1);
    let mut services = vec![
        core,
        Service::new("overlays", config.overlays, config.restarts),
    ];
    let mut diagnostics = Vec::new();
    if vantare_services::diagnostics::configured() {
        let mut diagnostic = Service::new(
            "diagnóstico",
            Program {
                path: std::env::current_exe()?.with_file_name("vantare-services.exe"),
                args: vec!["--diagnostics".into()],
            },
            0,
        );
        match diagnostic.spawn() {
            Ok(()) => diagnostics.push(diagnostic),
            Err(error) => log(format_args!("diagnóstico no disponible: {error}")),
        }
    }
    if let Some(engineer) = config.engineer {
        services.push(Service::new("Engineer", engineer, config.restarts));
    }
    let outcome = supervise(&mut services, &stop);
    drop(resident);
    drop(remote.0); // Cierra el auxiliar mientras el núcleo sigue vivo.
    shutdown(&mut services, config.grace);
    shutdown(&mut diagnostics, config.grace);
    Ok(match outcome? {
        Outcome::Stopped => ExitCode::SUCCESS,
        Outcome::Finished(name) => {
            log(format_args!("{name} terminó: se cierra todo"));
            ExitCode::SUCCESS
        }
        Outcome::Exhausted(name) => {
            log(format_args!(
                "{name}: presupuesto de reinicios agotado, se para"
            ));
            ExitCode::FAILURE
        }
    })
}

#[cfg(unix)]
fn run(config: Config) -> io::Result<ExitCode> {
    unix::run(config)
}

#[cfg(windows)]
fn signal_stop(instance: &str) -> io::Result<()> {
    Stop::signal(&object_name("launcher-stop", instance))
}

#[cfg(unix)]
fn signal_stop(instance: &str) -> io::Result<()> {
    unix::Stop::signal(&object_name("launcher-stop", instance))
}

fn main() -> ExitCode {
    vantare_services::diagnostics::install_panic_hook("vantare");
    let args: Vec<String> = env::args().skip(1).collect();
    let bin_dir = env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
        .unwrap_or_default();
    let config = match parse(&args, &bin_dir) {
        Ok(config) => config,
        Err(message) => {
            eprintln!("vantare: {message}\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    let result = if config.stop_only {
        signal_stop(&config.instance).map(|()| ExitCode::SUCCESS)
    } else {
        run(config)
    };
    result.unwrap_or_else(|error| {
        log(error);
        ExitCode::FAILURE
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_profile_uses_live_core_and_validated_profile_id() {
        let config = parsed(&[
            "--launcher-file",
            "local settings.json",
            "--launch",
            "rig-1",
        ])
        .expect("inicio por perfil");
        assert_eq!(config.launch.as_deref(), Some("rig-1"));
        assert_eq!(config.core.args, args(&["--live"]));
        assert_eq!(
            config.launcher_file,
            Some(PathBuf::from("local settings.json"))
        );
        assert_eq!(
            parsed(&["--launch=rig-1"])
                .expect("compatibilidad Wails")
                .launch,
            config.launch
        );
        for invalid in ["", "../otro", "rig con espacio", "a\"b"] {
            assert!(parsed(&["--launch", invalid]).is_err());
        }
        assert!(parsed(&["--launch", "rig", "--parar"]).is_err());
    }

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).into()).collect()
    }

    fn parsed(list: &[&str]) -> Result<Config, String> {
        parse(&args(list), Path::new("bin"))
    }

    #[test]
    fn engineer_is_opt_in_and_shares_pipe_identity_and_restart_policy() {
        assert!(parsed(&[]).unwrap().engineer.is_none());
        let config = parsed(&[
            "--engineer",
            "cursor.json",
            "--engineer-bin",
            "voice.exe",
            "--",
            "--live",
            "--pipe",
            "p",
            "--",
            "4",
            "--",
            "--locale",
            "en",
        ])
        .unwrap();
        let engineer = config.engineer.unwrap();
        assert_eq!(engineer.path, Path::new("voice.exe"));
        let core_image = Path::new("bin").join(binary_name("vantare-core"));
        assert_eq!(
            engineer.args,
            args(&[
                "--pipe",
                "--cursor",
                "cursor.json",
                "--pipe-name",
                "p",
                "--core-image",
                core_image.to_str().unwrap(),
                "--locale",
                "en"
            ])
        );
        assert_eq!(config.core.args.last().unwrap(), "voice.exe");
        assert!(parsed(&["--", "--live", "--", "4", "--", "--locale", "en"]).is_err());
    }

    #[test]
    #[cfg(windows)]
    fn managed_services_share_the_generated_instance_pipe_with_all_consumers() {
        let instance = vantare_services::random_id().expect("instancia de test");
        let mut config = parsed(&["--instancia", &instance, "--engineer", "cursor.json"])
            .expect("configuración");
        let (host, _) = start_remote_services(&mut config).expect("supervisor sin hijos");
        let photo = config
            .core
            .args
            .windows(2)
            .find(|pair| pair[0] == "--pipe")
            .expect("pipe del núcleo")[1]
            .clone();
        assert!(photo.ends_with(&instance));
        assert!(config.core.args.iter().any(|arg| arg == "--managed-rights"));
        assert_eq!(
            config.overlays.args,
            args(&["--fuente", &format!("pipe:{photo}")])
        );
        assert!(
            config
                .engineer
                .expect("Engineer")
                .args
                .windows(2)
                .any(|pair| pair == ["--pipe-name", &photo])
        );
        drop(host);
    }

    #[test]
    fn arguments_after_the_separators_go_to_each_child() {
        let config = parsed(&[
            "--plazo", "500", "--", "--replay", "x.jsonl", "--pipe", "p", "--", "4", "--fuente",
            "pipe:p",
        ])
        .unwrap();
        assert_eq!(config.grace, Duration::from_millis(500));
        assert_eq!(
            config.core.path,
            Path::new("bin").join(binary_name("vantare-core"))
        );
        assert_eq!(
            config.core.args,
            args(&["--replay", "x.jsonl", "--pipe", "p"])
        );
        assert_eq!(config.overlays.args, args(&["4", "--fuente", "pipe:p"]));
    }

    #[test]
    fn options_and_defaults() {
        let config = parsed(&[
            "--core-bin",
            "a.exe",
            "--reinicios",
            "2",
            "--instancia",
            "t",
        ])
        .unwrap();
        assert_eq!(config.core.path, Path::new("a.exe"));
        assert_eq!((config.restarts, config.instance.as_str()), (2, "t"));
        assert!(config.core.args.is_empty() && config.overlays.args.is_empty());
        assert!(parsed(&["--parar"]).unwrap().stop_only);
        assert_eq!(parsed(&[]).unwrap().grace, DEFAULT_GRACE);
    }

    #[test]
    fn bad_arguments_are_refused() {
        for bad in [
            &["--plazo"][..],
            &["--plazo", "x"],
            &["--reinicios", "-1"],
            &["--nada"],
        ] {
            assert!(parsed(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn restarts_back_off_and_run_out() {
        let mut restarts = Restarts {
            budget: 4,
            attempts: 0,
        };
        let quick = Duration::from_millis(10);
        let delays: Vec<_> = (0..5).map(|_| restarts.crashed(quick)).collect();
        assert_eq!(
            delays,
            [
                Some(Duration::from_millis(250)),
                Some(Duration::from_millis(500)),
                Some(Duration::from_secs(1)),
                Some(Duration::from_secs(2)),
                None
            ]
        );
    }

    #[test]
    fn a_stable_run_restores_the_budget_and_the_wait_is_capped() {
        let mut restarts = Restarts {
            budget: 20,
            attempts: 0,
        };
        let last = (0..12)
            .filter_map(|_| restarts.crashed(Duration::ZERO))
            .last();
        assert_eq!(last, Some(BACKOFF_CAP));
        assert_eq!(restarts.crashed(STABLE), Some(BACKOFF));
    }
}
