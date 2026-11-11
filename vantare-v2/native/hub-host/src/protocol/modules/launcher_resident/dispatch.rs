use super::{Event, HostToUi, Pipe, Reply, Request, Session, Topic, frame, io};
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    if !matches!(request, Request::LauncherResidentGet {}) {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    frame::write(
        pipe,
        &HostToUi::Response {
            id,
            result: Reply::LauncherResidentGet {
                value: session.launcher_resident_state.view(),
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
