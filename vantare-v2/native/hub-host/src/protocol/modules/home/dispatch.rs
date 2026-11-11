use super::{Event, HostToUi, Pipe, Reply, Request, Session, Topic, frame, io};
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    if !matches!(request, Request::HomeGet {}) {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    let active = session.subscriptions.contains(&Topic::Home);
    let sim = session.core.home_status(active);
    let value = session.home_state.view(sim);
    frame::write(
        pipe,
        &HostToUi::Response {
            id,
            result: Reply::HomeGet { value },
        },
    )
}
pub(super) fn subscribe(session: &mut Session, pipe: &mut Pipe, _topic: Topic) -> io::Result<()> {
    let sim = session.core.home_status(true);
    let value = session.home_state.view(sim);
    frame::write(
        pipe,
        &HostToUi::Event {
            event: Event::Home { value },
        },
    )
}
