use super::{Event, HostToUi, Instant, Pipe, RemoteKind, Session, Topic, frame, io};
pub(super) fn tick(session: &mut Session, pipe: &mut Pipe) -> io::Result<()> {
    if !session.subscriptions.contains(&Topic::Account) {
        return Ok(());
    }
    let now = Instant::now();
    session.account.observe_policy(session.core.policy(), now);
    if !session.current.live
        && session.closing.is_none()
        && session.current.services == crate::protocol::LinkState::Connected
        && let Some(operation) = session.account.next_background(now)
        && !session.remotes.contains_key(&crate::account::BACKGROUND_ID)
        && session
            .core
            .request_background(
                crate::account::BACKGROUND_ID,
                crate::account::State::command(operation),
            )
            .is_ok()
    {
        session.remotes.insert(
            crate::account::BACKGROUND_ID,
            RemoteKind::AccountBackground(operation),
        );
        session.account.background_accepted(operation, now);
    }
    let value = session.account_view();
    if session.subscriptions.contains(&Topic::Account)
        && session.last_account.as_ref() != Some(&value)
    {
        session.last_account = Some(value.clone());
        frame::write(
            pipe,
            &HostToUi::Event {
                event: Event::Account { value },
            },
        )?;
    }
    Ok(())
}
