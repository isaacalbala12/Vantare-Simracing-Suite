//! Host exclusivo; pipes Win32 existentes con ACL, peer y cancelación/plazos.
use crate::protocol::{self, Command, Reply, Request, Response};
use crate::{Error, Result};
use std::path::PathBuf;

pub struct Options {
    pub pipe: String,
    pub parent_pid: u32,
    pub parent_image: PathBuf,
}

pub fn validate(request: &Request, nonce: &str, previous: u64) -> Result<()> {
    if request.version != protocol::VERSION {
        return Err(Error::Version);
    }
    if request.nonce != nonce || request.sequence <= previous {
        return Err(Error::Protocol);
    }
    Ok(())
}

#[cfg(any(windows, unix))]
pub fn serve(options: &Options, mut handle: impl FnMut(Command) -> Reply) -> Result<()> {
    use std::io::{Read, Write};
    use std::sync::Arc;
    use std::time::Duration;
    use vantare_ipc::transport::{Event, Listener};

    let stop = Arc::new(Event::new().map_err(|_| Error::Protocol)?);
    let mut listener = Listener::new(&options.pipe, Arc::clone(&stop), Duration::from_mins(5))
        .map_err(|_| Error::Protocol)?;
    let mut pipe = listener.instance().map_err(|_| Error::Protocol)?;
    let nonce = crate::random_id()?;
    // El nonce solo cruza stdout heredado, que no se expone a logs ni CLI.
    writeln!(std::io::stdout(), "{nonce}").map_err(|_| Error::Protocol)?;
    std::io::stdout().flush().map_err(|_| Error::Protocol)?;
    let cancel = Arc::clone(&stop);
    std::thread::Builder::new()
        .name("services-parent-watch".into())
        .spawn(move || {
            let mut byte = [0_u8; 1];
            let _read_result = std::io::stdin().read(&mut byte);
            cancel.set();
        })
        .map_err(|_| Error::Protocol)?;
    if let Err(error) = pipe.accept() {
        if stop.is_set() {
            eprintln!("services-shutdown");
            return Ok(());
        }
        return Err(Error::Core(vantare_ipc::control::Failure::classify(&error)));
    }
    let peer = pipe.client_peer().map_err(|_| Error::Protocol)?;
    if peer.pid != options.parent_pid || !peer.is_image(&options.parent_image) {
        return Err(Error::Denied);
    }
    let exit = session(&mut pipe, &nonce, || stop.is_set(), &mut handle).inspect_err(|error| {
        let code = match error {
            Error::Version => "services-version-incompatible",
            Error::Protocol => "services-protocol-invalid",
            Error::Core(failure) => failure.diagnostic(),
            _ => "services-channel-failed",
        };
        eprintln!("services-channel {code}");
    })?;
    eprintln!("{}", exit.diagnostic());
    Ok(())
}

#[derive(Debug, PartialEq, Eq)]
enum Exit {
    Idle,
    Disconnected,
    Shutdown,
}
impl Exit {
    fn diagnostic(&self) -> &'static str {
        match self {
            Self::Idle => "services-idle",
            Self::Disconnected => "services-disconnected",
            Self::Shutdown => "services-shutdown",
        }
    }
}

/// A timeout before the first byte is inactivity; a partial frame is a failure.
/// Injection at the Read/Write boundary permits deterministic deadline tests.
fn session(
    pipe: &mut (impl std::io::Read + std::io::Write),
    nonce: &str,
    stopped: impl Fn() -> bool,
    mut handle: impl FnMut(Command) -> Reply,
) -> Result<Exit> {
    use std::io::{ErrorKind, Read};
    let transport =
        |error: std::io::Error| Error::Core(vantare_ipc::control::Failure::classify(&error));
    let mut sequence = 0;
    while !stopped() {
        let mut first = [0];
        match pipe.read_exact(&mut first) {
            Ok(()) => {}
            Err(_) if stopped() => return Ok(Exit::Shutdown),
            Err(error) if error.kind() == ErrorKind::TimedOut => return Ok(Exit::Idle),
            Err(error)
                if matches!(
                    error.kind(),
                    ErrorKind::UnexpectedEof
                        | ErrorKind::BrokenPipe
                        | ErrorKind::ConnectionReset
                        | ErrorKind::ConnectionAborted
                ) =>
            {
                return Ok(Exit::Disconnected);
            }
            Err(error) => return Err(transport(error)),
        }
        let value: serde_json::Value =
            protocol::read(&mut first.as_slice().chain(&mut *pipe)).map_err(transport)?;
        // Check the envelope before decoding commands from another version.
        if value
            .get("version")
            .and_then(serde_json::Value::as_u64)
            .is_some_and(|version| version != u64::from(protocol::VERSION))
        {
            return Err(Error::Version);
        }
        let request: Request = serde_json::from_value(value).map_err(|_| Error::Protocol)?;
        validate(&request, nonce, sequence)?;
        sequence = request.sequence;
        let closed = matches!(request.command, Command::Shutdown);
        let response = Response {
            version: protocol::VERSION,
            sequence,
            reply: handle(request.command),
        };
        if let Err(error) = protocol::write(pipe, &response) {
            if matches!(
                error.kind(),
                ErrorKind::BrokenPipe
                    | ErrorKind::ConnectionAborted
                    | ErrorKind::ConnectionReset
                    | ErrorKind::NotConnected
            ) {
                return Ok(Exit::Disconnected);
            }
            return Err(transport(error));
        }
        if closed {
            return Ok(Exit::Shutdown);
        }
    }
    Ok(Exit::Shutdown)
}

#[cfg(not(any(windows, unix)))]
pub fn serve(_: &Options, _: impl FnMut(Command) -> Reply) -> Result<()> {
    Err(Error::Unsupported)
}

#[cfg(any(test, feature = "test-support"))]
#[doc(hidden)]
pub fn fixture_request(app: &mut crate::app::App, command: Command) -> Reply {
    use std::io::{Cursor, Read, Write};
    struct Wire {
        input: Cursor<Vec<u8>>,
        output: Vec<u8>,
    }
    impl Read for Wire {
        fn read(&mut self, bytes: &mut [u8]) -> std::io::Result<usize> {
            self.input.read(bytes)
        }
    }
    impl Write for Wire {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.output.write(bytes)
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut input = Vec::new();
    protocol::write(
        &mut input,
        &Request {
            version: protocol::VERSION,
            sequence: 1,
            nonce: "fixture".into(),
            command,
        },
    )
    .expect("request frame");
    let mut wire = Wire {
        input: Cursor::new(input),
        output: Vec::new(),
    };
    assert_eq!(
        session(
            &mut wire,
            "fixture",
            || false,
            |command| app.handle(command)
        ),
        Ok(Exit::Disconnected)
    );
    protocol::read::<Response>(&mut wire.output.as_slice())
        .expect("response frame")
        .reply
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{self, Cursor, Read, Write};

    struct Wire {
        input: Cursor<Vec<u8>>,
        read_error: io::ErrorKind,
        write_error: Option<io::ErrorKind>,
    }
    impl Read for Wire {
        fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
            if self.input.position() == self.input.get_ref().len() as u64 {
                return Err(self.read_error.into());
            }
            self.input.read(bytes)
        }
    }
    impl Write for Wire {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.write_error
                .map_or(Ok(bytes.len()), |error| Err(error.into()))
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn idle_deadline_and_eof_close_successfully_without_dispatch_or_error_diagnostic() {
        for (error, expected) in [
            (io::ErrorKind::TimedOut, Exit::Idle),
            (io::ErrorKind::UnexpectedEof, Exit::Disconnected),
        ] {
            let mut wire = Wire {
                input: Cursor::new(vec![]),
                read_error: error,
                write_error: None,
            };
            let exit = session(
                &mut wire,
                "fixture",
                || false,
                |_| panic!("idle cannot dispatch"),
            )
            .expect("clean close");
            assert_eq!(exit, expected);
            assert!(matches!(
                exit.diagnostic(),
                "services-idle" | "services-disconnected"
            ));
        }
    }

    #[test]
    fn partial_frame_is_transient_and_response_to_closed_peer_is_clean_without_replay() {
        let mut wire = Wire {
            input: Cursor::new(vec![1]),
            read_error: io::ErrorKind::TimedOut,
            write_error: None,
        };
        assert_eq!(
            session(&mut wire, "fixture", || false, |_| panic!("partial frame")),
            Err(Error::Core(vantare_ipc::control::Failure::Timeout))
        );
        let mut bytes = vec![];
        protocol::write(
            &mut bytes,
            &Request {
                version: protocol::VERSION,
                nonce: "fixture".into(),
                sequence: 1,
                command: Command::Status,
            },
        )
        .expect("frame");
        let mut wire = Wire {
            input: Cursor::new(bytes),
            read_error: io::ErrorKind::UnexpectedEof,
            write_error: Some(io::ErrorKind::BrokenPipe),
        };
        let mut dispatched = 0;
        assert_eq!(
            session(
                &mut wire,
                "fixture",
                || false,
                |_| {
                    dispatched += 1;
                    Reply::Closed
                }
            ),
            Ok(Exit::Disconnected)
        );
        assert_eq!(dispatched, 1, "lost response never replays the action");
    }

    #[test]
    fn incompatible_envelope_is_distinct_from_unknown_command_or_malformed_frame() {
        for (version, expected) in [
            (protocol::VERSION - 1, Error::Version),
            (protocol::VERSION, Error::Protocol),
        ] {
            let mut bytes = vec![];
            protocol::write(&mut bytes, &serde_json::json!({"version":version,"sequence":1,"nonce":"fixture","command":{"command":"future-command"}})).expect("frame");
            let mut wire = Wire {
                input: Cursor::new(bytes),
                read_error: io::ErrorKind::UnexpectedEof,
                write_error: None,
            };
            assert_eq!(
                session(
                    &mut wire,
                    "fixture",
                    || false,
                    |_| panic!("incompatible cannot dispatch")
                ),
                Err(expected)
            );
        }
    }

    #[test]
    fn replay_wrong_nonce_and_version_cannot_dispatch() {
        let mut request = Request {
            version: protocol::VERSION,
            sequence: 2,
            nonce: crate::random_id().expect("nonce test"),
            command: Command::Status,
        };
        assert!(validate(&request, &request.nonce, 1).is_ok());
        assert_eq!(validate(&request, "other-peer", 1), Err(Error::Protocol));
        assert_eq!(validate(&request, &request.nonce, 2), Err(Error::Protocol));
        // Either v12 contract lacks verified MailConsent or Calendar.fallback.
        for version in [9, 10, 11, 12, protocol::VERSION + 1] {
            request.version = version;
            assert_eq!(validate(&request, &request.nonce, 1), Err(Error::Version));
        }
    }
}
