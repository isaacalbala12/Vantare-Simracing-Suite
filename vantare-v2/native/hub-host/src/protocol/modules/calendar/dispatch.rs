use super::{HostError, HostToUi, Pipe, RemoteKind, Reply, Request, Session, frame, io};
fn local(
    state: &mut crate::calendar::State,
    request: &Request,
) -> Option<Result<Reply, HostError>> {
    match request {
        Request::CalendarAlertsSave {
            alerts,
            expected_revision,
        } => Some(state.alerts_save(alerts, expected_revision).map(|value| {
            Reply::CalendarAlertsSave {
                value: Box::new(value),
            }
        })),
        Request::CalendarHistoryLoad {} => Some(Ok(Reply::CalendarHistoryLoad {
            value: Box::new(state.history()),
        })),
        Request::CalendarConfigLoad {} => Some(Ok(Reply::CalendarConfigLoad {
            value: Box::new(state.config()),
        })),
        Request::CalendarUtcSet {
            utc,
            expected_revision,
        } => Some(
            state
                .utc_set(*utc, expected_revision)
                .map(|value| Reply::CalendarUtcSet {
                    value: Box::new(value),
                }),
        ),
        Request::CalendarNotifyWeekSet {
            enabled,
            expected_revision,
        } => Some(
            state
                .notify_week_set(*enabled, expected_revision)
                .map(|value| Reply::CalendarNotifyWeekSet {
                    value: Box::new(value),
                }),
        ),
        Request::CalendarFollowSet {
            series_id,
            followed,
            expected_revision,
        } => Some(
            state
                .follow_set(series_id, *followed, expected_revision)
                .map(|value| Reply::CalendarFollowSet {
                    value: Box::new(value),
                }),
        ),
        _ => None,
    }
}
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
    let local = local(&mut session.calendar_state, request);
    if let Some(result) = local {
        return frame::write(
            pipe,
            &match result {
                Ok(result) => HostToUi::Response { id, result },
                Err(error) => HostToUi::Failure { id, error },
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
