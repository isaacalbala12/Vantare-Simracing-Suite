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
        Request::CalendarIcsPrepare { scope, alarm } => Some(
            state
                .ics_prepare(*scope, *alarm, chrono::Utc::now().timestamp_millis())
                .map(|value| Reply::CalendarIcsPrepare {
                    value: Box::new(value),
                }),
        ),
        Request::CalendarIcsExport { .. } | Request::CalendarIcsReplace { .. } => {
            Some(Err(HostError::Unsupported))
        }
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
    if matches!(
        request,
        Request::CalendarLaunchArm { .. } | Request::CalendarLaunchCancel { .. }
    ) {
        return launches::dispatch(session, pipe, id, request);
    }
    if matches!(request, Request::CalendarNoticeTest {}) {
        return notice_test(session, pipe, id);
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
        Request::CalendarRefresh {} if refreshing(session) => frame::write(
            pipe,
            &HostToUi::Failure {
                id,
                error: HostError::Busy,
            },
        ),
        Request::CalendarRefresh {} => match session.request_remote(
            id,
            RemoteKind::CalendarRefresh,
            vantare_ipc::services_protocol::Command::CalendarRefresh,
        ) {
            Ok(()) => {
                session
                    .calendar_state
                    .poll_started(chrono::Utc::now().timestamp_millis());
                Ok(())
            }
            Err(error) => frame::write(pipe, &HostToUi::Failure { id, error }),
        },
        _ => Err(io::ErrorKind::InvalidInput.into()),
    }
}
pub(super) fn refreshing(session: &Session) -> bool {
    session.remotes.values().any(|kind| {
        matches!(
            kind,
            RemoteKind::CalendarRefresh | RemoteKind::CalendarBackground
        )
    })
}
pub(super) fn complete(
    session: &mut Session,
    remote: Option<(u32, RemoteKind)>,
    id: u32,
    result: Result<vantare_ipc::services_protocol::Reply, HostError>,
) -> Result<Reply, HostError> {
    complete_at(
        session,
        remote,
        id,
        result,
        chrono::Utc::now().timestamp_millis(),
    )
}
pub(super) fn complete_at(
    session: &mut Session,
    remote: Option<(u32, RemoteKind)>,
    id: u32,
    result: Result<vantare_ipc::services_protocol::Reply, HostError>,
    now: i64,
) -> Result<Reply, HostError> {
    if !matches!(remote,Some((expected,RemoteKind::CalendarRefresh|RemoteKind::CalendarBackground)) if expected==id)
    {
        return Err(HostError::Rejected);
    }
    let allowed = crate::calendar::allowed(&session.current.access)
        && session.current.rights == crate::protocol::LinkState::Connected
        && session.closing.is_none()
        && session.settings.windows_notifications_enabled();
    let result = if crate::calendar::allowed(&session.current.access) {
        match result {
            Ok(vantare_ipc::services_protocol::Reply::Calendar { schedule, fallback }) => session
                .calendar_state
                .refresh_notices(schedule, fallback, now, allowed, session.current.live)
                .map(|value| Reply::CalendarRefresh {
                    value: Box::new(value),
                }),
            Ok(_) => Err(HostError::Rejected),
            Err(error) => Err(error),
        }
    } else {
        Err(HostError::Denied)
    };
    let failure = result.as_ref().err().map(|error| match error {
        HostError::Busy => crate::calendar::CalendarRefreshFailure::Busy,
        HostError::CoreUnavailable => crate::calendar::CalendarRefreshFailure::CoreUnavailable,
        HostError::Denied => crate::calendar::CalendarRefreshFailure::Denied,
        _ => crate::calendar::CalendarRefreshFailure::Rejected,
    });
    session.calendar_state.poll_completed(now, failure);
    result
}

#[path = "launch_driver.rs"]
mod launches;
pub(super) fn subscribe(
    session: &mut Session,
    pipe: &mut Pipe,
    _topic: super::Topic,
) -> io::Result<()> {
    launches::publish(session, pipe, true)
}
pub(super) fn launch_tick(
    session: &mut Session,
    pipe: &mut Pipe,
    now: crate::calendar::launch::Clock,
) -> io::Result<()> {
    launches::tick(session, pipe, now)
}
pub(super) fn launch_closing(session: &mut Session, pipe: &mut Pipe) -> io::Result<()> {
    session.calendar_launch.close();
    launches::publish(session, pipe, false)
}

fn notice_test(session: &mut Session, pipe: &mut Pipe, id: u32) -> io::Result<()> {
    if session.current.rights != crate::protocol::LinkState::Connected || session.closing.is_some()
    {
        return frame::write(
            pipe,
            &HostToUi::Failure {
                id,
                error: HostError::Denied,
            },
        );
    }
    if !session.settings.windows_notifications_enabled() {
        return frame::write(
            pipe,
            &HostToUi::Response {
                id,
                result: Reply::CalendarNoticeTest { accepted: false },
            },
        );
    }
    return match session.calendar_state.notice_test(
        id,
        chrono::Utc::now().timestamp_millis(),
        std::time::Instant::now(),
        session.current.live,
    ) {
        Ok(value) => {
            // Main consumes the fixed sample before projecting the boolean ACK.
            frame::write(
                pipe,
                &HostToUi::Event {
                    event: crate::protocol::Event::CalendarNotice { value },
                },
            )?;
            frame::write(
                pipe,
                &HostToUi::Response {
                    id,
                    result: Reply::CalendarNoticeTest { accepted: true },
                },
            )
        }
        Err(error) => frame::write(pipe, &HostToUi::Failure { id, error }),
    };
}
