use super::*;
impl Session {
    fn shortcuts_dispatch(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        request: &Request,
    ) -> io::Result<()> {
        match request {
            Request::ShortcutsGet {} => frame::write(
                pipe,
                &HostToUi::Response {
                    id,
                    result: Reply::ShortcutsGet {
                        value: crate::shortcuts::read(&self.launcher),
                    },
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
    session.shortcuts_dispatch(pipe, id, request)
}
