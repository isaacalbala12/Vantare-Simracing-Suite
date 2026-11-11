use super::{Pipe, Session, Instant, io};
// The generated tick ABI requires io::Result; feed errors must not close the Hub.
#[allow(clippy::unnecessary_wraps)]
pub(super) fn tick(session: &mut Session, _pipe: &mut Pipe) -> io::Result<()> {
 let enabled = crate::calendar::allowed(&session.current.access) && session.current.rights == crate::protocol::LinkState::Connected;
 session.calendar_state.tick_feed(chrono::Utc::now().timestamp_millis(),Instant::now(),enabled,session.current.live);
 Ok(())
}
