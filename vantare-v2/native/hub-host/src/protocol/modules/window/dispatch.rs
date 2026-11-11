use super::{HostError, HostToUi, Pipe, Request, Session, frame, io};

pub(super) fn dispatch(
    _session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    match request {
        // The authenticated main process handles these before forwarding to Rust.
        Request::WindowMinimize {} | Request::WindowToggleMaximize {} => frame::write(
            pipe,
            &HostToUi::Failure {
                id,
                error: HostError::Unsupported,
            },
        ),
        _ => Err(io::ErrorKind::InvalidInput.into()),
    }
}
#[allow(
    clippy::unnecessary_wraps,
    reason = "Topic callbacks share an IO-capable signature; only Electron can publish window state"
)]
pub(super) fn subscribe(
    _session: &mut Session,
    _pipe: &mut Pipe,
    _topic: crate::protocol::Topic,
) -> io::Result<()> {
    Ok(())
}
