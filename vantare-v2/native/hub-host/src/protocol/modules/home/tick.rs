use super::{Event, HostToUi, Instant, Pipe, Session, Topic, frame, io};
pub(super) fn tick(session: &mut Session, pipe: &mut Pipe) -> io::Result<()> {
    let active = session.subscriptions.contains(&Topic::Home) && !session.current.live;
    let sim = session.core.home_status(active);
    if let Some(value) = session.home_state.changed(active, Instant::now(), sim) {
        frame::write(
            pipe,
            &HostToUi::Event {
                event: Event::Home { value },
            },
        )?;
    }
    Ok(())
}
