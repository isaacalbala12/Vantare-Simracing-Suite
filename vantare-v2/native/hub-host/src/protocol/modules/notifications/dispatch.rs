use super::{HostError, HostToUi, Pipe, Request, Session, frame, io};
pub(super) fn dispatch(
    _session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    match request {
        // Native notifications are a platform UI action handled by Electron.
        Request::NotificationTest {} => frame::write(
            pipe,
            &HostToUi::Failure {
                id,
                error: HostError::Unsupported,
            },
        ),
        _ => Err(io::ErrorKind::InvalidInput.into()),
    }
}
