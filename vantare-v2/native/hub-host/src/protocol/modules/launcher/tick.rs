use super::{Event, HostToUi, Instant, Pipe, Session, Topic, frame, io};
pub(super) fn tick(session: &mut Session, pipe: &mut Pipe) -> io::Result<()> {
    if let Some(value) = session.launcher_reader.changed(
        session.subscriptions.contains(&Topic::Launcher),
        Instant::now(),
    ) {
        frame::write(
            pipe,
            &HostToUi::Event {
                event: Event::Launcher { value },
            },
        )?;
    }
    Ok(())
}
