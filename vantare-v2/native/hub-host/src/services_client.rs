//! Copied from frozen Hub services/client.rs, base 62dde8da4; same Probe/no-replay contract.
//! El Hub conecta con vantare; jamás arranca ni posee el proceso de servicios.
use crate::protocol::HostError;
use std::{path::Path, sync::Arc};
use vantare_ipc::services_protocol as protocol;
use vantare_ipc::services_protocol::{Command, Reply, Request, Response, SupervisorHello};
use vantare_ipc::{
    control,
    transport::{Event, Pipe},
};

// The transport guard is a product contract, not a test scheduling deadline.
use crate::service_queue::RESPONSE_IO_TIMEOUT;

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
        self.request_before(command, std::time::Instant::now())
    }
    pub(crate) fn request_before(
        &mut self, command: Command, accepted: std::time::Instant,
    ) -> Result<Reply, HostError> {
        self.request_before_clock(command, accepted, std::time::Instant::now)
    }
    fn request_before_clock(
        &mut self, command: Command, accepted: std::time::Instant,
        now: impl Fn() -> std::time::Instant,
    ) -> Result<Reply, HostError> {
        if !crate::service_queue::can_start(accepted, now()) {
            return Err(HostError::Busy);
        }
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
        // The queue/channel/Probe can all consume the remaining renderer budget.
        // Recheck immediately before the effect; a late Probe must not start it.
        if !crate::service_queue::can_start(accepted, now()) {
            return Err(HostError::Busy);
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
    fn an_expired_channel_request_does_not_even_send_probe() {
        let name = format!("vantare-expired-{}", vantare_services::random_id().unwrap());
        let stop = Arc::new(Event::new().unwrap());
        let mut listener = vantare_ipc::transport::Listener::new(
            &name,
            Arc::clone(&stop),
            std::time::Duration::from_secs(5),
        )
        .unwrap();
        let pipe = listener.instance().unwrap();
        let mut client = Client {
            pipe,
            stop,
            nonce: String::new(),
            sequence: 0,
            binary: "unused".into(),
            photo_pipe: String::new(),
        };
        let accepted = std::time::Instant::now();
        assert!(matches!(
            client.request_before_clock(Command::MailConsentGet, accepted, || accepted + std::time::Duration::from_secs(15)),
            Err(HostError::Busy)
        ));
        assert_eq!(client.sequence, 0);
    }
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
