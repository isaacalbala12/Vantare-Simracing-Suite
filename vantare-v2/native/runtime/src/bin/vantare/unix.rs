//! Backend Unix del launcher: sockets locales para instancia/parada y
//! supervisión portable con `std::process::Child::try_wait`.

use std::fs;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{DirBuilderExt, FileTypeExt, MetadataExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::process::ExitCode;
use std::thread;
use std::time::{Duration, Instant};

use super::{Config, Outcome, Service, log, object_name};

const POLL_INTERVAL: Duration = Duration::from_millis(25);
const CLOSE_POLL: Duration = Duration::from_millis(10);
#[cfg(target_os = "macos")]
const MAX_SOCKET_PATH: usize = 103;
#[cfg(not(target_os = "macos"))]
const MAX_SOCKET_PATH: usize = 107;

struct BoundSocket {
    listener: UnixListener,
    path: PathBuf,
    device: u64,
    inode: u64,
}

impl BoundSocket {
    fn bind(name: &str) -> io::Result<Self> {
        let path = socket_path(name)?;
        let listener = match UnixListener::bind(&path) {
            Ok(listener) => listener,
            Err(error) if error.kind() == io::ErrorKind::AddrInUse => {
                match UnixStream::connect(&path) {
                    Ok(_) => return Err(io::ErrorKind::AddrInUse.into()),
                    Err(connect_error)
                        if matches!(
                            connect_error.kind(),
                            io::ErrorKind::ConnectionRefused | io::ErrorKind::NotFound
                        ) =>
                    {
                        let metadata = fs::symlink_metadata(&path)?;
                        if !metadata.file_type().is_socket()
                            || metadata.uid().to_string() != current_uid()?
                        {
                            return Err(io::ErrorKind::PermissionDenied.into());
                        }
                        fs::remove_file(&path)?;
                        UnixListener::bind(&path)?
                    }
                    Err(connect_error) => return Err(connect_error),
                }
            }
            Err(error) => return Err(error),
        };
        if let Err(error) = fs::set_permissions(&path, fs::Permissions::from_mode(0o600)) {
            drop(listener);
            remove_socket_after_failed_bind(&path);
            return Err(error);
        }
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) => {
                drop(listener);
                remove_socket_after_failed_bind(&path);
                return Err(error);
            }
        };
        if !metadata.file_type().is_socket() || metadata.uid().to_string() != current_uid()? {
            drop(listener);
            remove_socket_after_failed_bind(&path);
            return Err(io::ErrorKind::PermissionDenied.into());
        }
        Ok(Self {
            listener,
            path,
            device: metadata.dev(),
            inode: metadata.ino(),
        })
    }
}

fn remove_socket_after_failed_bind(path: &std::path::Path) {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => eprintln!(
            "vantare: no se pudo retirar el socket {}: {error}",
            path.display()
        ),
    }
}

impl Drop for BoundSocket {
    fn drop(&mut self) {
        let result = fs::symlink_metadata(&self.path).and_then(|metadata| {
            if metadata.dev() == self.device && metadata.ino() == self.inode {
                fs::remove_file(&self.path)
            } else {
                Ok(())
            }
        });
        if let Err(error) = result
            && error.kind() != io::ErrorKind::NotFound
        {
            eprintln!(
                "vantare: no se pudo retirar el socket {}: {error}",
                self.path.display()
            );
        }
    }
}

/// Socket de instancia única. El listener se drena para no dejar conexiones de
/// comprobación acumuladas en la cola del kernel.
pub struct Instance {
    socket: BoundSocket,
}

impl Instance {
    pub fn acquire(name: &str) -> io::Result<Option<Self>> {
        match BoundSocket::bind(name) {
            Ok(socket) => {
                socket.listener.set_nonblocking(true)?;
                Ok(Some(Self { socket }))
            }
            Err(error) if error.kind() == io::ErrorKind::AddrInUse => Ok(None),
            Err(error) => Err(error),
        }
    }

    fn drain(&self) -> io::Result<()> {
        loop {
            match self.socket.listener.accept() {
                Ok((stream, _)) => drop(stream),
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => return Ok(()),
                Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
                Err(error) => return Err(error),
            }
        }
    }
}

/// Señal de parada atendida por el bucle principal, sin depender de un hilo
/// ni de una biblioteca de señales.
pub struct Stop {
    socket: BoundSocket,
}

impl Stop {
    pub fn create(name: &str) -> io::Result<Self> {
        let socket = BoundSocket::bind(name)?;
        socket.listener.set_nonblocking(true)?;
        Ok(Self { socket })
    }

    pub fn signal(name: &str) -> io::Result<()> {
        let stream = UnixStream::connect(socket_path(name)?)?;
        drop(stream);
        Ok(())
    }

    fn is_set(&self) -> io::Result<bool> {
        loop {
            match self.socket.listener.accept() {
                Ok((stream, _)) => {
                    drop(stream);
                    return Ok(true);
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => return Ok(false),
                Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
                Err(error) => return Err(error),
            }
        }
    }
}

fn current_uid() -> io::Result<String> {
    vantare_ipc::default_pipe_name()?
        .strip_prefix("vantare-core-")
        .map(str::to_owned)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "UID IPC inválido"))
}

fn socket_path(name: &str) -> io::Result<PathBuf> {
    let uid = current_uid()?;
    let root = std::env::var_os("XDG_RUNTIME_DIR").map_or_else(temporary_root, PathBuf::from);
    if !root.is_absolute() {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    let directory = root.join(format!("vantare-launcher-{uid}"));
    let created = match fs::DirBuilder::new().mode(0o700).create(&directory) {
        Ok(()) => true,
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => false,
        Err(error) => return Err(error),
    };
    if created {
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))?;
    }
    let metadata = fs::symlink_metadata(&directory)?;
    if !metadata.is_dir() || metadata.uid().to_string() != uid || metadata.mode() & 0o777 != 0o700 {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    let path = directory.join(format!("launcher-{:016x}.sock", hasher.finish()));
    // sockaddr_un incluye el NUL final: 104 bytes en macOS, 108 en Linux.
    if path.as_os_str().as_bytes().len() > MAX_SOCKET_PATH {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "ruta de socket Unix demasiado larga",
        ));
    }
    Ok(path)
}

fn temporary_root() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        PathBuf::from("/tmp")
    }
    #[cfg(not(target_os = "macos"))]
    {
        std::env::temp_dir()
    }
}

fn configured_pipe(config: &mut Config) -> io::Result<String> {
    for pair in config.core.args.windows(2) {
        if pair[0] == "--pipe" {
            return Ok(pair[1].clone());
        }
    }
    if config.core.args.iter().any(|arg| arg == "--pipe") {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "--pipe del núcleo necesita un valor",
        ));
    }
    let mut pipe = vantare_ipc::default_pipe_name()?;
    if !config.instance.is_empty() {
        let mut hasher = DefaultHasher::new();
        config.instance.hash(&mut hasher);
        pipe = format!("{pipe}-{:016x}", hasher.finish());
    }
    config.core.args.extend(["--pipe".into(), pipe.clone()]);
    Ok(pipe)
}

fn configure(config: &mut Config) -> io::Result<()> {
    if config.core.args.iter().any(|arg| arg == "--managed-rights") {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "--managed-rights solo está disponible en Windows",
        ));
    }
    let pipe = configured_pipe(config)?;
    if !config.overlays.args.iter().any(|arg| arg == "--fuente") {
        config
            .overlays
            .args
            .extend(["--fuente".into(), format!("pipe:{pipe}")]);
    }
    if let Some(engineer) = &mut config.engineer
        && !engineer.args.iter().any(|arg| arg == "--pipe-name")
    {
        engineer.args.extend(["--pipe-name".into(), pipe]);
    }
    Ok(())
}

pub fn run(mut config: Config) -> io::Result<ExitCode> {
    let Some(instance) = Instance::acquire(&object_name("launcher", &config.instance))? else {
        log("ya hay una instancia en marcha");
        return Ok(ExitCode::SUCCESS);
    };
    let stop = Stop::create(&object_name("launcher-stop", &config.instance))?;
    configure(&mut config)?;

    let mut services = vec![
        Service::new("núcleo", config.core, config.restarts),
        Service::new("overlays", config.overlays, config.restarts),
    ];
    if let Some(engineer) = config.engineer {
        services.push(Service::new("Engineer", engineer, config.restarts));
    }
    let outcome = supervise(&mut services, &stop, &instance);
    let closed = shutdown(&mut services, config.grace);
    closed?;
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

fn supervise(services: &mut [Service], stop: &Stop, instance: &Instance) -> io::Result<Outcome> {
    loop {
        if stop.is_set()? {
            return Ok(Outcome::Stopped);
        }
        instance.drain()?;
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
        for service in services.iter_mut() {
            let status = match service.child.as_mut() {
                Some(child) => child.try_wait()?,
                None => continue,
            };
            let Some(status) = status else {
                continue;
            };
            service.child = None;
            if status.success() {
                return Ok(Outcome::Finished(service.name));
            }
            log(format_args!("{} cayó: {status}", service.name));
            if !service.failed() {
                return Ok(Outcome::Exhausted(service.name));
            }
        }
        let until_restart = services
            .iter()
            .filter_map(|service| service.start_at)
            .min()
            .map(|at| at.saturating_duration_since(Instant::now()));
        thread::sleep(until_restart.map_or(POLL_INTERVAL, |delay| delay.min(POLL_INTERVAL)));
    }
}

fn shutdown(services: &mut [Service], grace: Duration) -> io::Result<()> {
    for service in services.iter_mut().rev() {
        let Some(child) = service.child.as_mut() else {
            continue;
        };
        drop(child.stdin.take());
        let deadline = Instant::now() + grace;
        let mut exited = child.try_wait()?.is_some();
        while !exited && Instant::now() < deadline {
            let remaining = deadline.saturating_duration_since(Instant::now());
            thread::sleep(remaining.min(CLOSE_POLL));
            exited = child.try_wait()?.is_some();
        }
        if !exited {
            log(format_args!(
                "{} no terminó en {grace:?}: se le mata",
                service.name
            ));
            match child.kill() {
                Ok(()) => {
                    child.wait()?;
                }
                Err(_) if child.try_wait()?.is_some() => {}
                Err(error) => return Err(error),
            }
        }
        log(format_args!("{} cerrado", service.name));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::Program;
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_name(kind: &str) -> String {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_nanos());
        format!("vantare-test-{kind}-{}-{nonce}", std::process::id())
    }

    fn shell(args: &[&str], budget: u32) -> Service {
        Service::new(
            "proceso de prueba",
            Program {
                path: PathBuf::from("/bin/sh"),
                args: args.iter().map(|arg| (*arg).to_owned()).collect(),
            },
            budget,
        )
    }

    #[test]
    fn instance_socket_allows_one_owner_and_releases_on_drop() {
        let name = unique_name("instance");
        let owner = Instance::acquire(&name).expect("instancia").expect("dueño");
        assert!(
            Instance::acquire(&name)
                .expect("segunda instancia")
                .is_none()
        );
        drop(owner);
        assert!(
            Instance::acquire(&name)
                .expect("instancia posterior")
                .is_some()
        );
    }

    #[test]
    fn stop_socket_delivers_a_request_to_the_owner() {
        let name = unique_name("stop");
        let stop = Stop::create(&name).expect("socket de parada");
        assert!(!stop.is_set().expect("sin señal"));
        Stop::signal(&name).expect("enviar señal");
        assert!(stop.is_set().expect("parada recibida"));
    }

    #[test]
    fn configure_shares_the_photo_pipe_with_overlay_and_engineer() {
        let mut config = Config {
            core: Program {
                path: PathBuf::from("vantare-core"),
                args: Vec::new(),
            },
            overlays: Program {
                path: PathBuf::from("vantare-overlays"),
                args: Vec::new(),
            },
            engineer: Some(Program {
                path: PathBuf::from("vantare-engineer"),
                args: vec!["--pipe".into(), "--cursor".into(), "cursor.json".into()],
            }),
            grace: Duration::from_secs(3),
            restarts: 5,
            instance: "test-1".into(),
            stop_only: false,
            launcher_file: None,
            launch: None,
        };
        configure(&mut config).expect("configurar canales");
        let pipe = config
            .core
            .args
            .windows(2)
            .find(|pair| pair[0] == "--pipe")
            .expect("pipe del núcleo")[1]
            .clone();
        assert!(pipe.starts_with("vantare-core-"));
        assert!(
            config
                .overlays
                .args
                .windows(2)
                .any(|pair| pair == ["--fuente", &format!("pipe:{pipe}")])
        );
        assert!(config.engineer.as_ref().is_some_and(|engineer| {
            engineer
                .args
                .windows(2)
                .any(|pair| pair == ["--pipe-name", &pipe])
        }));
    }

    #[test]
    fn clean_child_exit_finishes_supervision() {
        let stop = Stop::create(&unique_name("supervise-stop")).expect("parada");
        let instance = Instance::acquire(&unique_name("supervise-instance"))
            .expect("instancia")
            .expect("dueño");
        let mut services = [shell(&["-c", "exit 0"], 0)];
        assert!(matches!(
            supervise(&mut services, &stop, &instance).expect("supervisión"),
            Outcome::Finished("proceso de prueba")
        ));
    }

    #[test]
    fn shutdown_closes_stdin_before_forcing_a_child() {
        let mut services = [shell(&["-c", "read -r value || exit 0"], 0)];
        services[0].spawn().expect("arrancar hijo");
        shutdown(&mut services, Duration::from_secs(1)).expect("cierre");
        assert!(
            services[0]
                .child
                .as_mut()
                .expect("hijo recogible")
                .try_wait()
                .expect("estado del hijo")
                .is_some_and(|status| status.success())
        );
    }
}
