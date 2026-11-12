use super::{Instant, Pipe, Session, io};
pub(super) fn tick(session: &mut Session, pipe: &mut Pipe) -> io::Result<()> {
    tick_with_clock(
        session,
        pipe,
        chrono::Utc::now().timestamp_millis(),
        Instant::now(),
    )
}
pub(super) fn tick_with_clock(
    session: &mut Session,
    pipe: &mut Pipe,
    now: i64,
    monotonic: Instant,
) -> io::Result<()> {
    tick_at(session, now, monotonic);
    let enabled = session.handshaken
        && crate::calendar::allowed(&session.current.access)
        && session.current.rights == crate::protocol::LinkState::Connected
        && session.closing.is_none();
    for value in session
        .calendar_state
        .notice_tick(now, monotonic, enabled, session.current.live)
    {
        super::frame::write(
            pipe,
            &super::HostToUi::Event {
                event: super::Event::CalendarNotice { value },
            },
        )?;
    }
    Ok(())
}
pub(super) fn tick_at(session: &mut Session, now: i64, monotonic: Instant) {
    let enabled = crate::calendar::allowed(&session.current.access)
        && session.current.rights == crate::protocol::LinkState::Connected;
    session
        .calendar_state
        .tick_feed(now, monotonic, enabled, session.current.live);
}
