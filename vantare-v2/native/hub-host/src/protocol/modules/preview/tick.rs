#[cfg(windows)]
use super::frame;
use super::{Pipe, Session, io};
pub(super) fn tick(session: &mut Session, pipe: &mut Pipe) -> io::Result<()> {
    #[cfg(windows)]
    {
        tick_at(session, pipe, std::time::Instant::now())?;
    }
    #[cfg(not(windows))]
    {
        let _ = (&session.preview_state, pipe);
    }
    Ok(())
}
#[cfg(windows)]
pub(super) fn tick_at(
    session: &mut Session,
    pipe: &mut Pipe,
    now: std::time::Instant,
) -> io::Result<()> {
    let access = super::studio::access(session);
    if let Some((id, result)) =
        session
            .preview_state
            .poll(now, &session.current, access, session.closing.is_some())
    {
        frame::write(pipe, &super::preview::message(id, result))?;
    }
    Ok(())
}
