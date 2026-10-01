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

#[cfg(windows)]
pub fn serve(options: &Options, mut handle: impl FnMut(Command) -> Reply) -> Result<()> {
    use std::io::{Read, Write};
    use std::sync::Arc;
    use vantare_ipc::transport::{Event, Listener};
    let stop = Arc::new(Event::new().map_err(|_| Error::Protocol)?);
    let mut listener = Listener::new(
        &options.pipe,
        Arc::clone(&stop),
        std::time::Duration::from_mins(5),
    )
    .map_err(|_| Error::Protocol)?;
    let mut pipe = listener.instance().map_err(|_| Error::Protocol)?;
    let nonce = crate::random_id()?;
    // Bootstrap solo por stdout heredado privado, no log/CLI/pipe público.
    writeln!(std::io::stdout(), "{nonce}").map_err(|_| Error::Protocol)?;
    std::io::stdout().flush().map_err(|_| Error::Protocol)?;
    let cancel = Arc::clone(&stop);
    std::thread::spawn(move || {
        let mut byte = [0_u8; 1];
        // El padre solo mantiene stdin vivo; EOF o datos inesperados cierran.
        let _read_result = std::io::stdin().read(&mut byte);
        cancel.set();
    });
    pipe.accept().map_err(|_| Error::Protocol)?;
    let peer = pipe.client_peer().map_err(|_| Error::Protocol)?;
    if peer.pid != options.parent_pid || !peer.is_image(&options.parent_image) {
        return Err(Error::Denied);
    }
    let mut sequence = 0;
    while !stop.is_set() {
        let request: Request = match protocol::read(&mut pipe) {
            Ok(request) => request,
            Err(_) if stop.is_set() => return Ok(()),
            Err(_) => return Err(Error::Protocol),
        };
        validate(&request, &nonce, sequence)?;
        sequence = request.sequence;
        let closed = matches!(request.command, Command::Shutdown);
        let response = Response {
            version: protocol::VERSION,
            sequence,
            reply: handle(request.command),
        };
        protocol::write(&mut pipe, &response).map_err(|_| Error::Protocol)?;
        if closed {
            break;
        }
    }
    Ok(())
}

#[cfg(unix)]
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
    pipe.accept().map_err(|_| Error::Protocol)?;
    let peer = pipe.client_peer().map_err(|_| Error::Protocol)?;
    if peer.pid != options.parent_pid || !peer.is_image(&options.parent_image) {
        return Err(Error::Denied);
    }
    let mut sequence = 0;
    while !stop.is_set() {
        let request: Request = match protocol::read(&mut pipe) {
            Ok(request) => request,
            Err(_) if stop.is_set() => return Ok(()),
            Err(_) => return Err(Error::Protocol),
        };
        validate(&request, &nonce, sequence)?;
        sequence = request.sequence;
        let closed = matches!(request.command, Command::Shutdown);
        let response = Response {
            version: protocol::VERSION,
            sequence,
            reply: handle(request.command),
        };
        protocol::write(&mut pipe, &response).map_err(|_| Error::Protocol)?;
        if closed {
            break;
        }
    }
    Ok(())
}

#[cfg(not(any(windows, unix)))]
pub fn serve(_: &Options, _: impl FnMut(Command) -> Reply) -> Result<()> {
    Err(Error::Unsupported)
}

#[cfg(test)]
mod tests {
    use super::*;
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
        request.version += 1;
        assert_eq!(validate(&request, &request.nonce, 1), Err(Error::Version));
    }
}
