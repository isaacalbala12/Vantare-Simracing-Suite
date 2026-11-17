use super::{Event, HostToUi, Pipe, Reply, Request, Session, Topic, frame, io};
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    match request {
        Request::LauncherResidentReviewOpen { target } => {
            return review_open(session, pipe, id, target);
        }
        Request::LauncherProfileRemoveChecked { target } => {
            let result = crate::launcher_resident::ownership::remove(
                &session.launcher,
                session.core.account_observation().as_ref(),
                target,
            );
            return frame::write(
                pipe,
                &match result {
                    Ok(value) => HostToUi::Response {
                        id,
                        result: Reply::LauncherProfileRemoveChecked { value },
                    },
                    Err(error) => HostToUi::Failure { id, error },
                },
            );
        }
        Request::LauncherResidentRetry { target } => {
            let result = crate::launcher_resident::results::retry(
                &session.launcher,
                session.core.account_observation().as_ref(),
                target,
            );
            let message = match result {
                Ok(value) => HostToUi::Response {
                    id,
                    result: Reply::LauncherResidentRetry { value },
                },
                Err(error) => HostToUi::Failure { id, error },
            };
            return frame::write(pipe, &message);
        }
        Request::LauncherResidentCancel { target } => {
            let result = crate::launcher_resident::control::cancel(
                &session.launcher,
                session.core.account_observation().as_ref(),
                target,
            );
            let message = match result {
                Ok(value) => HostToUi::Response {
                    id,
                    result: Reply::LauncherResidentCancel { value },
                },
                Err(error) => HostToUi::Failure { id, error },
            };
            return frame::write(pipe, &message);
        }
        Request::LauncherResidentRehearse { target } => {
            let result = crate::launcher_resident::control::rehearse(
                &session.launcher,
                session.core.account_observation().as_ref(),
                target,
            );
            let message = match result {
                Ok(value) => HostToUi::Response {
                    id,
                    result: Reply::LauncherResidentRehearse { value },
                },
                Err(error) => HostToUi::Failure { id, error },
            };
            return frame::write(pipe, &message);
        }
        _ => {}
    }
    if let Request::LauncherResidentAnswer { target } = request {
        let result = crate::launcher_resident::answer::answer(
            &session.launcher,
            session.core.account_observation().as_ref(),
            target,
        );
        let message = match result {
            Ok(value) => HostToUi::Response {
                id,
                result: Reply::LauncherResidentAnswer { value },
            },
            Err(error) => HostToUi::Failure { id, error },
        };
        return frame::write(pipe, &message);
    }
    if !matches!(request, Request::LauncherResidentGet {}) {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    frame::write(
        pipe,
        &HostToUi::Response {
            id,
            result: Reply::LauncherResidentGet {
                value: Box::new(if session.current.live {
                    crate::launcher_resident::ResidentView::default()
                } else {
                    session
                        .launcher_resident_state
                        .view_for_account(session.core.account_observation().as_ref())
                }),
            },
        },
    )
}
pub(super) fn subscribe(session: &mut Session, pipe: &mut Pipe, _topic: Topic) -> io::Result<()> {
    if session.current.live {
        session.launcher_resident_state.reset();
        return Ok(());
    }
    let value = session.launcher_resident_state.observed_for_account(
        std::time::Instant::now(),
        session.core.account_observation().as_ref(),
    );
    frame::write(
        pipe,
        &HostToUi::Event {
            event: Event::LauncherResident { value },
        },
    )
}

fn review_open(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    target: &crate::launcher_resident::ResidentReviewTarget,
) -> io::Result<()> {
    let result = if session.current.live {
        Err(crate::protocol::HostError::Denied)
    } else {
        session.launcher_resident_state.review.open(
            &session.launcher,
            session.core.account_observation().as_ref(),
            target,
        )
    };
    frame::write(
        pipe,
        &match result {
            Ok(value) => HostToUi::Response {
                id,
                result: Reply::LauncherResidentReviewOpen { value },
            },
            Err(error) => HostToUi::Failure { id, error },
        },
    )
}
