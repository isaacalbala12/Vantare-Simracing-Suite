use super::{Instant, Pipe, Session, io};
// The generated tick ABI requires io::Result; feed errors must not close the Hub.
#[allow(clippy::unnecessary_wraps)]
pub(super) fn tick(session: &mut Session, _pipe: &mut Pipe) -> io::Result<()> {
    tick_at(
        session,
        chrono::Utc::now().timestamp_millis(),
        Instant::now(),
    );
    Ok(())
}
pub(super) fn tick_at(session: &mut Session, now: i64, monotonic: Instant) {
    let enabled = crate::calendar::allowed(&session.current.access)
        && session.current.rights == crate::protocol::LinkState::Connected;
    session
        .calendar_state
        .tick_feed(now, monotonic, enabled, session.current.live);
}
