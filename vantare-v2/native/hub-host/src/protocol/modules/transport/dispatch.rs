use super::*;
impl Session {
    fn transport_dispatch(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        request: &Request,
    ) -> io::Result<()> {
        match request {
            Request::CoreGet {} => frame::write(
                pipe,
                &HostToUi::Response {
                    id,
                    result: Reply::Core {
                        value: self.current.clone(),
                    },
                },
            ),
            Request::WindowClose {} => self.request_close(pipe, CloseReason::Window),
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
    session.transport_dispatch(pipe, id, request)
}
