use super::{Duration, Event, HostToUi, Instant, Pipe, Session, Topic, frame, io};
pub(super) fn tick(session: &mut Session, pipe: &mut Pipe) -> io::Result<()> {
    if session.subscriptions.contains(&Topic::Updates)
        && session
            .last_updates
            .is_none_or(|last| last.elapsed() >= Duration::from_secs(2))
    {
        session.last_updates = Some(Instant::now());
        let value = session
            .updates
            .get_or_insert_with(crate::updates::Reader::current)
            .view();
        frame::write(
            pipe,
            &HostToUi::Event {
                event: Event::Updates {
                    value: Box::new(value),
                },
            },
        )?;
    }
    Ok(())
}
