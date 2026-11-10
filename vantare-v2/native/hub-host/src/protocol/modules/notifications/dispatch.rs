use super::*;
impl Session {
    fn notifications_dispatch(
        &mut self,
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
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    session.notifications_dispatch(pipe, id, request)
}
