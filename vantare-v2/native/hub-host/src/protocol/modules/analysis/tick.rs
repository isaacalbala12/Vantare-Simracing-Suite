use super::{Pipe, Session, io};
pub(super) fn tick(session: &mut Session, pipe: &mut Pipe) -> io::Result<()> {
    let allowed = super::analysis::allowed(session);
    if let Some((id, result)) = session.analysis_state.poll(
        std::time::Instant::now(),
        allowed,
        session.closing.is_some(),
    ) {
        super::analysis::publish(session, pipe, id, result)?;
    }
    Ok(())
}
