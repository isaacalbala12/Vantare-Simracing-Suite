use super::*;
impl Session {
    fn updates_dispatch(&mut self, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()> {
        match request {
            Request::UpdatesGet {} => frame::write(
                pipe,
                &HostToUi::Response {
                    id,
                    result: Reply::UpdatesGet {
                        value: self
                            .updates
                            .get_or_insert_with(crate::updates::Reader::current)
                            .view(),
                    },
                },
            ),
            Request::UpdatesRestart {} => {
                self.restart_update_when(pipe, id, crate::updates::Reader::can_restart)
            }
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
    pub(super) fn restart_update_when(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        ready: impl FnOnce() -> bool,
    ) -> io::Result<()> {
        let accepted = self.closing.is_none() && !self.current.live && ready();
        frame::write(
            pipe,
            &HostToUi::Response {
                id,
                result: Reply::UpdatesRestart { accepted },
            },
        )?;
        if accepted {
            self.request_close(pipe, CloseReason::Restart)?;
        } else {
            self.diagnostic.note(
                crate::diagnostics::DiagnosticSection::Updates,
                &HostError::Denied,
            );
        }
        Ok(())
    }
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    session.updates_dispatch(pipe, id, request)
}
