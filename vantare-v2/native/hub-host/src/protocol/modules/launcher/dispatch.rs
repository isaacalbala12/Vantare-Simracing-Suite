use super::*;
impl Session {
    fn launcher_dispatch(&mut self, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()> {
        match request {
            Request::LauncherFavorite {} => {
                let message = match crate::favorite::launch(&self.launcher, &self.current) {
                    Ok(accepted) => HostToUi::Response {
                        id,
                        result: Reply::LauncherFavorite { accepted },
                    },
                    Err(error) => HostToUi::Failure { id, error },
                };
                frame::write(pipe, &message)
            }
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
    session.launcher_dispatch(pipe, id, request)
}
