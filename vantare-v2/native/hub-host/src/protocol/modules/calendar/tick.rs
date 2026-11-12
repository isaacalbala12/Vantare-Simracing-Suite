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
    // Account and Calendar share the single reserved host-background lane.
    if enabled
        && session.current.services == crate::protocol::LinkState::Connected
        && session.calendar_state.poll_due(now)
        && session.calendar_state.poll_retry_ready(monotonic)
        && !super::calendar::refreshing(session)
        && !session.remotes.contains_key(&crate::account::BACKGROUND_ID)
    {
        session.calendar_state.poll_attempted(monotonic);
        if session
            .core
            .request_background(
                crate::account::BACKGROUND_ID,
                vantare_ipc::services_protocol::Command::CalendarRefresh,
            )
            .is_ok()
        {
            session.remotes.insert(
                crate::account::BACKGROUND_ID,
                super::RemoteKind::CalendarBackground,
            );
            session.calendar_state.poll_started(now);
        }
    }
    if let Some((value, error)) = session.calendar_state.take_refresh()
        && enabled
    {
        super::frame::write(
            pipe,
            &super::HostToUi::Event {
                event: super::Event::CalendarRefreshed {
                    value: Box::new(value),
                    error,
                },
            },
        )?;
    }
    let windows_enabled = session.settings.windows_notifications_enabled();
    session
        .calendar_state
        .observe_windows_notifications(now, windows_enabled);
    for value in session.calendar_state.notice_tick(
        now,
        monotonic,
        enabled && windows_enabled,
        session.current.live,
    ) {
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
