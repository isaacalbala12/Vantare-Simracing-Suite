//! El Hub conecta con vantare; jamás arranca ni posee el proceso de servicios.
use super::protocol::{self, Command, Reply, Request, Response, SupervisorHello};
use std::{path::Path, sync::Arc, time::Duration};
use vantare_ipc::{
    control,
    transport::{Event, Pipe},
};

// The transport guard is a product contract, not a test scheduling deadline.
const RESPONSE_IO_TIMEOUT: Duration = Duration::from_secs(30);

pub struct Client {
    pipe: Pipe,
    stop: Arc<Event>,
    nonce: String,
    sequence: u64,
    binary: std::path::PathBuf,
    photo_pipe: String,
}
#[derive(Debug, PartialEq, Eq)]
enum RequestError {
    Transport(std::io::ErrorKind),
    Version,
    Sequence,
}
impl RequestError {
    fn message(&self) -> &'static str {
        match self {
            Self::Transport(_) => "servicios desconectados",
            Self::Version => vantare_ipc::INCOMPATIBLE_COMPONENTS,
            Self::Sequence => "respuesta del supervisor inválida",
        }
    }
}
impl Client {
    /// El propietario publica este evento antes de iniciar el worker y lo señala al cerrar.
    pub fn start(binary: &Path, photo_pipe: &str, stop: Arc<Event>) -> Result<Self, &'static str> {
        let mut pipe = control::connect_ready(
            &format!("{photo_pipe}-hub-services"),
            &stop,
            RESPONSE_IO_TIMEOUT,
        )
        .map_err(|_| "supervisor vantare no disponible")?;
        if !pipe.server_peer().is_ok_and(|peer| peer.is_image(binary)) {
            return Err("supervisor no admitido");
        }
        let hello: SupervisorHello =
            control::read(&mut pipe).map_err(|_| "saludo del supervisor inválido")?;
        if hello.version != protocol::VERSION {
            return Err(vantare_ipc::INCOMPATIBLE_COMPONENTS);
        }
        if hello.nonce.len() != 64
            || !hello
                .nonce
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        {
            return Err("saludo del supervisor inválido");
        }
        Ok(Self {
            pipe,
            stop,
            nonce: hello.nonce,
            sequence: 0,
            binary: binary.to_owned(),
            photo_pipe: photo_pipe.to_owned(),
        })
    }
    pub fn request(&mut self, command: Command) -> Result<Reply, &'static str> {
        // Probe only a local, idempotent operation before dispatching effects.
        // A lost response to the actual command is never replayed blindly.
        let probe = self.request_once(Command::Probe);
        match probe {
            Err(RequestError::Transport(
                std::io::ErrorKind::BrokenPipe
                | std::io::ErrorKind::UnexpectedEof
                | std::io::ErrorKind::ConnectionAborted
                | std::io::ErrorKind::ConnectionReset
                | std::io::ErrorKind::NotConnected
                | std::io::ErrorKind::TimedOut,
            )) if !self.stop.is_set() => {
                *self = Self::start(&self.binary, &self.photo_pipe, Arc::clone(&self.stop))?;
            }
            Err(error) => return Err(error.message()),
            Ok(reply) if matches!(command, Command::Probe) => return Ok(reply),
            Ok(_) => {}
        }
        self.request_once(command).map_err(|error| error.message())
    }
    fn request_once(&mut self, command: Command) -> Result<Reply, RequestError> {
        self.sequence = self.sequence.checked_add(1).ok_or(RequestError::Sequence)?;
        protocol::write(
            &mut self.pipe,
            &Request {
                version: protocol::VERSION,
                sequence: self.sequence,
                nonce: self.nonce.clone(),
                command,
            },
        )
        .map_err(|error| RequestError::Transport(error.kind()))?;
        let response: Response = protocol::read(&mut self.pipe)
            .map_err(|error| RequestError::Transport(error.kind()))?;
        if response.version != protocol::VERSION {
            return Err(RequestError::Version);
        }
        if response.sequence != self.sequence {
            return Err(RequestError::Sequence);
        }
        Ok(response.reply)
    }
    pub fn is_running(&self) -> bool {
        !self.stop.is_set()
    }
}
pub fn default_binary() -> Result<std::path::PathBuf, &'static str> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("vantare.exe")))
        .ok_or("supervisor no instalado")
}
pub const REQUEST_POLL: Duration = Duration::from_millis(250);
/// Presupuesto total de una respuesta, incluidos conexión, saludo y trabajo remoto.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);

#[cfg(test)]
#[path = "client_tests.rs"]
mod tests;
