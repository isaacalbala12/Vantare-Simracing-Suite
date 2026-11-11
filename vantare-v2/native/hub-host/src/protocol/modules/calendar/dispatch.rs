use super::{HostError, HostToUi, Pipe, RemoteKind, Reply, Request, Session, frame, io};
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    if !crate::calendar::allowed(&session.current.access) {
        return frame::write(
            pipe,
            &HostToUi::Failure {
                id,
                error: HostError::Denied,
            },
        );
    }
    match request {
        Request::CalendarLoad {} => frame::write(
            pipe,
            &HostToUi::Response {
                id,
                result: Reply::CalendarLoad {
                    value: Box::new(session.calendar_state.load()),
                },
            },
        ),
        Request::CalendarRefresh {} => match session.request_remote(
            id,
            RemoteKind::CalendarRefresh,
            vantare_ipc::services_protocol::Command::CalendarRefresh,
        ) {
            Ok(()) => Ok(()),
            Err(error) => frame::write(pipe, &HostToUi::Failure { id, error }),
        },
        _ => Err(io::ErrorKind::InvalidInput.into()),
    }
}
pub(super) fn complete(
    session: &mut Session,
    remote: Option<(u32, RemoteKind)>,
    id: u32,
    result: Result<vantare_ipc::services_protocol::Reply, HostError>,
) -> Result<Reply, HostError> {
    if !crate::calendar::allowed(&session.current.access) {
        return Err(HostError::Denied);
    }
    if !matches!(remote,Some((expected,RemoteKind::CalendarRefresh)) if expected==id) {
        return Err(HostError::Rejected);
    }
    match result? {
        vantare_ipc::services_protocol::Reply::Calendar { schedule, fallback } => session
            .calendar_state
            .refreshed(schedule, fallback)
            .map(|value| Reply::CalendarRefresh {
                value: Box::new(value),
            }),
        _ => Err(HostError::Rejected),
    }
}
