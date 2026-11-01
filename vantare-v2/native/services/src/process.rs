use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Child, Command as Process, Stdio};
use std::sync::{Arc, mpsc};
use std::time::Duration;

use vantare_ipc::transport::{Event, IO_TIMEOUT, Pipe, connect};

use crate::protocol::{self, Command, Reply, Request, Response};

/// Propiedad de un worker I/O, nunca del hilo de render. EOF/Drop cierra hijo.
pub struct Client {
    child: Child,
    pipe: Pipe,
    stop: Arc<Event>,
    nonce: String,
    sequence: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectionError {
    Disconnected(std::io::ErrorKind),
    Protocol,
    Version,
    Sequence,
}
impl ConnectionError {
    pub fn message(self) -> &'static str {
        match self {
            Self::Disconnected(_) => "servicios desconectado",
            Self::Protocol | Self::Sequence => "respuesta de servicios inválida",
            Self::Version => vantare_ipc::INCOMPATIBLE_COMPONENTS,
        }
    }
}

impl ConnectionError {
    pub fn diagnostic(self) -> &'static str {
        match self {
            Self::Disconnected(std::io::ErrorKind::TimedOut) => "services-transport-timeout",
            Self::Disconnected(_) => "services-disconnected",
            Self::Protocol => "services-protocol-invalid",
            Self::Version => "services-version-incompatible",
            Self::Sequence => "services-sequence-invalid",
        }
    }
}

impl Client {
    pub fn start(binary: &Path) -> Result<Self, &'static str> {
        Self::start_in(binary, None)
    }

    pub fn start_in(binary: &Path, root: Option<&Path>) -> Result<Self, &'static str> {
        Self::spawn(binary, root, None)
    }

    pub fn start_managed(
        binary: &Path,
        root: Option<&Path>,
        core: &vantare_ipc::control::CoreLink,
    ) -> Result<Self, &'static str> {
        Self::spawn(binary, root, Some(core))
    }

    fn spawn(
        binary: &Path,
        root: Option<&Path>,
        core: Option<&vantare_ipc::control::CoreLink>,
    ) -> Result<Self, &'static str> {
        let parent = std::env::current_exe().map_err(|_| "supervisor no identificado")?;
        let photo = match core {
            Some(core) => core
                .pipe
                .strip_suffix("-rights")
                .ok_or("IPC inválido")?
                .to_owned(),
            None => vantare_ipc::default_pipe_name().map_err(|_| "IPC no disponible")?,
        };
        let name = format!("{photo}-services");
        let mut process = Process::new(binary);
        process
            .arg(&name)
            .arg(std::process::id().to_string())
            .arg(&parent)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            process.creation_flags(0x0800_0000); // CREATE_NO_WINDOW; helper sin ventana.
        }
        if let Some(root) = root {
            process.arg(root);
        }
        if core.is_some() {
            process.arg("--managed");
        }
        let mut child = process
            .spawn()
            .map_err(|_| "proceso de servicios no instalado")?;
        let connected = (|| {
            if let Some(core) = core {
                vantare_ipc::control::write(
                    child.stdin.as_mut().ok_or("bootstrap no disponible")?,
                    core,
                )
                .map_err(|_| "bootstrap no disponible")?;
            }
            Self::connect(&mut child, binary, &name)
        })();
        match connected {
            Ok((pipe, stop, nonce)) => Ok(Self {
                child,
                pipe,
                stop,
                nonce,
                sequence: 0,
            }),
            Err(error) => {
                // Puede haber salido entre el fallo y kill: cleanup best effort,
                // no ocultamos el error que impidió iniciar el servicio.
                let _cleanup = child.kill();
                let _reaped = child.wait();
                Err(error)
            }
        }
    }

    fn connect(
        child: &mut Child,
        binary: &Path,
        name: &str,
    ) -> Result<(Pipe, Arc<Event>, String), &'static str> {
        let output = child.stdout.take().ok_or("bootstrap no disponible")?;
        let (send, receive) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let mut nonce = String::new();
            let result = BufReader::new(output.take(65))
                .read_line(&mut nonce)
                .map(|_| nonce);
            let _receiver_closed = send.send(result);
        });
        let nonce = receive
            .recv_timeout(IO_TIMEOUT)
            .map_err(|_| "bootstrap agotado")?
            .map_err(|_| "bootstrap no disponible")?;
        let nonce = nonce.trim_end_matches('\n').to_owned();
        if nonce.len() != 64
            || !nonce
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err("bootstrap inválido");
        }
        let stop = Arc::new(Event::new().map_err(|_| "IPC no disponible")?);
        // Discovery/token/userinfo may each use the HTTP 8s budget. Cancellation
        // interrupts this wait; the render thread never waits on the pipe.
        let pipe = connect(name, Arc::clone(&stop), Duration::from_secs(30))
            .map_err(|_| "IPC no disponible")?;
        let peer = pipe.server_peer().map_err(|_| "servicio no identificado")?;
        if peer.pid != child.id()
            || !peer.is_image(binary)
            || child
                .try_wait()
                .map_err(|_| "estado de servicios no disponible")?
                .is_some()
        {
            return Err("servicio no admitido");
        }
        Ok((pipe, stop, nonce))
    }

    pub fn request(&mut self, command: Command) -> Result<Reply, &'static str> {
        self.request_typed(command)
            .map_err(ConnectionError::message)
    }

    /// Local and side-effect free: used before sending a possibly mutating action.
    pub fn probe(&mut self) -> Result<(), ConnectionError> {
        self.request_typed(Command::Status).map(|_| ())
    }

    pub fn request_typed(&mut self, command: Command) -> Result<Reply, ConnectionError> {
        self.sequence = self
            .sequence
            .checked_add(1)
            .ok_or(ConnectionError::Sequence)?;
        protocol::write(
            &mut self.pipe,
            &Request {
                version: protocol::VERSION,
                sequence: self.sequence,
                nonce: self.nonce.clone(),
                command,
            },
        )
        .map_err(|error| ConnectionError::Disconnected(error.kind()))?;
        let value: serde_json::Value = protocol::read(&mut self.pipe).map_err(|error| {
            if error.kind() == std::io::ErrorKind::InvalidData {
                ConnectionError::Protocol
            } else {
                ConnectionError::Disconnected(error.kind())
            }
        })?;
        if protocol::response_version_mismatch(&value) {
            return Err(ConnectionError::Version);
        }
        let response: Response =
            serde_json::from_value(value).map_err(|_| ConnectionError::Protocol)?;
        if response.sequence != self.sequence {
            return Err(ConnectionError::Sequence);
        }
        Ok(response.reply)
    }

    pub fn cancellation(&self) -> Arc<Event> {
        Arc::clone(&self.stop)
    }

    /// Urgent in-game renewal runs below the driver's processes, without a UI.
    #[allow(unsafe_code)] // Narrow Win32 boundary over the Child-owned process handle.
    pub fn set_background(&self) -> std::io::Result<()> {
        #[cfg(windows)]
        {
            use std::os::windows::io::AsRawHandle;
            use windows_sys::Win32::System::Threading::{
                BELOW_NORMAL_PRIORITY_CLASS, SetPriorityClass,
            };
            // SAFETY: Child owns a live process handle for the duration of this call.
            if unsafe { SetPriorityClass(self.child.as_raw_handle(), BELOW_NORMAL_PRIORITY_CLASS) }
                == 0
            {
                return Err(std::io::Error::last_os_error());
            }
        }
        Ok(())
    }

    #[cfg(all(windows, any(test, feature = "test-support")))]
    #[allow(unsafe_code)] // Read-only assertion over the Child-owned handle.
    pub fn priority_class_for_test(&self) -> std::io::Result<u32> {
        use std::os::windows::io::AsRawHandle;
        // SAFETY: the process handle remains owned by this live Client.
        let class = unsafe {
            windows_sys::Win32::System::Threading::GetPriorityClass(self.child.as_raw_handle())
        };
        if class == 0 {
            Err(std::io::Error::last_os_error())
        } else {
            Ok(class)
        }
    }

    /// Keep the real child alive while a consumer test substitutes a closed
    /// transport. Not exposed by any CLI/IPC command or distribution feature.
    #[cfg(any(test, feature = "test-support"))]
    pub fn replace_transport_for_test(&mut self, pipe: Pipe) -> Pipe {
        std::mem::replace(&mut self.pipe, pipe)
    }

    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    pub fn is_running(&mut self) -> bool {
        self.child.try_wait().is_ok_and(|status| status.is_none())
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        self.stop.set();
        drop(self.child.stdin.take());
        // Destructor best effort: salida entre kill/wait es normal; ningún
        // dato ni token se registra. El dueño I/O espera, no el hilo UI.
        let _killed_or_already_closed = self.child.kill();
        let _reaped = self.child.wait();
    }
}
