use super::{HostError, Pipe, RemoteKind, Reply, Request, Session, io};

pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    let result =
        crate::triage::intent(request, &session.current.access).and_then(|(operation, command)| {
            session.core.request(id, command)?;
            session.remote = Some((id, RemoteKind::Triage(operation)));
            Ok(())
        });
    match result {
        Ok(()) => Ok(()),
        Err(error) => session.respond(
            pipe,
            id,
            Err(error),
            crate::diagnostics::DiagnosticSection::Services,
        ),
    }
}
pub(super) fn complete(
    _session: &mut Session,
    remote: Option<(u32, RemoteKind)>,
    id: u32,
    result: Result<vantare_ipc::services_protocol::Reply, HostError>,
) -> Result<Option<Reply>, HostError> {
    match (remote, result) {
        (Some((expected, RemoteKind::Triage(operation))), Ok(reply)) if expected == id => {
            crate::triage::complete(operation, reply).map(Some)
        }
        (_, Err(error)) => Err(error),
        _ => Err(HostError::Denied),
    }
}
