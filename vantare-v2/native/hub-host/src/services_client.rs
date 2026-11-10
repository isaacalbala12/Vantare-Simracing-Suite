//! Copied from frozen Hub services/client.rs, base 62dde8da4; same Probe/no-replay contract.
//! El Hub conecta con vantare; jamás arranca ni posee el proceso de servicios.
use crate::protocol::HostError;
use std::{path::Path, sync::Arc, time::Duration};
use vantare_ipc::services_protocol as protocol;
use vantare_ipc::services_protocol::{Command, Reply, Request, Response, SupervisorHello};
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
    Version { expected: u32, found: u32 },
    Sequence,
}
impl RequestError {
    fn host_error(self) -> HostError {
        match self {
            Self::Transport(std::io::ErrorKind::InvalidData | std::io::ErrorKind::InvalidInput)
            | Self::Sequence => HostError::Rejected,
            Self::Transport(_) => HostError::CoreUnavailable,
            Self::Version { expected, found } => HostError::Incompatible { expected, found },
        }
    }
}

impl Client {
    /// El propietario publica este evento antes de iniciar el worker y lo señala al cerrar.
    pub fn start(binary: &Path, photo_pipe: &str, stop: Arc<Event>) -> Result<Self, HostError> {
        let mut pipe = control::connect_ready(
            &format!("{photo_pipe}-hub-services"),
            &stop,
            RESPONSE_IO_TIMEOUT,
        )
        .map_err(|_| HostError::CoreUnavailable)?;
        if !pipe.server_peer().is_ok_and(|peer| peer.is_image(binary)) {
            return Err(HostError::Rejected);
        }
        let hello: SupervisorHello = control::read(&mut pipe)
            .map_err(|error| RequestError::Transport(error.kind()).host_error())?;
        if hello.version != protocol::VERSION {
            return Err(HostError::Incompatible {
                expected: protocol::VERSION,
                found: hello.version,
            });
        }
        if hello.nonce.len() != 64
            || !hello
                .nonce
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        {
            return Err(HostError::Rejected);
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
    pub fn request(&mut self, command: Command) -> Result<Reply, HostError> {
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
            Err(error) => return Err(error.host_error()),
            Ok(reply) if matches!(command, Command::Probe) => return Ok(reply),
            Ok(_) => {}
        }
        self.request_once(command).map_err(RequestError::host_error)
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
        let value: serde_json::Value = protocol::read(&mut self.pipe)
            .map_err(|error| RequestError::Transport(error.kind()))?;
        if protocol::response_version_mismatch(&value) {
            let (expected, found) = if value.get("version").and_then(serde_json::Value::as_u64)
                == Some(u64::from(protocol::VERSION))
            {
                (control::VERSION, value.pointer("/reply/policy/version"))
            } else {
                (protocol::VERSION, value.get("version"))
            };
            let found = found
                .and_then(serde_json::Value::as_u64)
                .and_then(|version| u32::try_from(version).ok())
                .ok_or(RequestError::Sequence)?;
            return Err(RequestError::Version { expected, found });
        }
        let response: Response = serde_json::from_value(value)
            .map_err(|_| RequestError::Transport(std::io::ErrorKind::InvalidData))?;
        if response.sequence != self.sequence {
            return Err(RequestError::Sequence);
        }
        Ok(response.reply)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transport_protocol_and_generation_failures_stay_distinct() {
        assert_eq!(
            RequestError::Transport(std::io::ErrorKind::BrokenPipe).host_error(),
            HostError::CoreUnavailable
        );
        assert_eq!(
            RequestError::Transport(std::io::ErrorKind::TimedOut).host_error(),
            HostError::CoreUnavailable
        );
        assert_eq!(
            RequestError::Transport(std::io::ErrorKind::InvalidInput).host_error(),
            HostError::Rejected
        );
        assert_eq!(
            RequestError::Transport(std::io::ErrorKind::InvalidData).host_error(),
            HostError::Rejected
        );
        assert_eq!(RequestError::Sequence.host_error(), HostError::Rejected);
        assert_eq!(
            RequestError::Version {
                expected: 20,
                found: 19
            }
            .host_error(),
            HostError::Incompatible {
                expected: 20,
                found: 19
            }
        );
    }
}
