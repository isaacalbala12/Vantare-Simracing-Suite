use super::{Event, HostToUi, Pipe, Session, Topic, frame, io};
pub(super) fn tick(session: &mut Session, pipe: &mut Pipe) -> io::Result<()> {
    let access = super::studio::access(session);
    if let Some(value) = session.studio.changed(
        session.subscriptions.contains(&Topic::Studio),
        std::time::Instant::now(),
        access,
    ) {
        frame::write(
            pipe,
            &HostToUi::Event {
                event: Event::Studio { value },
            },
        )?;
    }
    Ok(())
}
