use super::{Event, HostToUi, Pipe, Reply, Request, Session, Topic, frame, io};
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
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
                value: if session.current.live {
                    crate::launcher_resident::ResidentView::default()
                } else {
                    session.launcher_resident_state.view()
                },
            },
        },
    )
}
pub(super) fn subscribe(session: &mut Session, pipe: &mut Pipe, _topic: Topic) -> io::Result<()> {
    if session.current.live {
        session.launcher_resident_state.reset();
        return Ok(());
    }
    let value = session
        .launcher_resident_state
        .observed(std::time::Instant::now());
    frame::write(
        pipe,
        &HostToUi::Event {
            event: Event::LauncherResident { value },
        },
    )
}
