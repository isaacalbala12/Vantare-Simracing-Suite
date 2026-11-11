use super::{HostError, Pipe, RemoteKind, Reply, Request, Session, io};
impl Session {
    fn pilot_dispatch(&mut self, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()> {
        match request {
            Request::PilotLoad {} | Request::PilotSave { .. } => {
                self.pilot_request(pipe, id, request)
            }
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
    pub(super) fn pilot_request(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        request: &Request,
    ) -> io::Result<()> {
        let intent = match request {
            Request::PilotLoad {} => Ok((
                RemoteKind::PilotLoad,
                vantare_ipc::services_protocol::Command::PilotLoad,
            )),
            Request::PilotSave {
                fields,
                base_revision,
            } => crate::pilot::save(self.pilot.as_ref(), fields, base_revision)
                .map(|command| (RemoteKind::PilotSave, command)),
            _ => Err(HostError::Denied),
        };
        let result = intent.and_then(|(kind, command)| {
            self.request_remote(id, kind, command)?;
            Ok(())
        });
        match result {
            Ok(()) => Ok(()),
            Err(error) => self.respond(
                pipe,
                id,
                Err(error),
                crate::diagnostics::DiagnosticSection::Services,
            ),
        }
    }
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    session.pilot_dispatch(pipe, id, request)
}
pub(super) fn complete(
    session: &mut Session,
    remote: Option<(u32, RemoteKind)>,
    id: u32,
    result: Result<vantare_ipc::services_protocol::Reply, HostError>,
) -> Result<Reply, HostError> {
    session.pilot_complete(remote, id, result)
}
impl Session {
    fn pilot_complete(
        &mut self,
        remote: Option<(u32, RemoteKind)>,
        id: u32,
        result: Result<vantare_ipc::services_protocol::Reply, HostError>,
    ) -> Result<Reply, HostError> {
        match (remote, result) {
            (
                Some((expected, kind)),
                Ok(vantare_ipc::services_protocol::Reply::Pilot { state, .. }),
            ) if expected == id => {
                let value = crate::pilot::view(&state);
                let reply = match kind {
                    RemoteKind::PilotLoad => Ok(Reply::PilotLoad { value }),
                    RemoteKind::PilotSave => Ok(Reply::PilotSave { value }),
                    _ => Err(HostError::Denied),
                };
                if reply.is_ok() {
                    self.pilot = Some(state);
                }
                reply
            }
            (_, Err(error)) => Err(error),
            _ => Err(HostError::Denied),
        }
    }
}
