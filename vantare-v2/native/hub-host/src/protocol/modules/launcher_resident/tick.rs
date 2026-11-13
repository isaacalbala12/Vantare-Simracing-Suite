use super::{Event, HostToUi, Pipe, Session, Topic, frame, io};
pub(super) fn tick(session: &mut Session, pipe: &mut Pipe) -> io::Result<()> {
    if session.current.live || !session.subscriptions.contains(&Topic::LauncherResident) {
        session.launcher_resident_state.reset();
        return Ok(());
    }
    if let Some(value) = session
        .launcher_resident_state
        .changed_for_account(std::time::Instant::now(), session.core.account_observation().as_ref())
    {
        frame::write(
            pipe,
            &HostToUi::Event {
                event: Event::LauncherResident { value },
            },
        )?;
    }
    Ok(())
}
