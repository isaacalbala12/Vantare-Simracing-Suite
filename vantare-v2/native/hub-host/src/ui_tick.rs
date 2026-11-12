use super::{
    Args, CloseReason, Duration, Event, HostToUi, Instant, Pipe, SCREEN_TICKS, Session, Topic,
    frame, io, protocol, session_effects,
};
pub(super) fn entered_live(
    previous: Option<&protocol::CoreStatus>,
    current: &protocol::CoreStatus,
) -> bool {
    previous.is_some_and(|previous| {
        previous.rights == protocol::LinkState::Connected
            && current.rights == protocol::LinkState::Connected
            && !previous.live
            && current.live
    })
}

impl Session {
    pub(super) fn tick(
        &mut self,
        args: &Args,
        pipe: &mut Pipe,
        now: Instant,
        control_closed: impl FnOnce() -> bool,
    ) -> io::Result<bool> {
        if let Some(confirmation) = &self.confirmation {
            confirmation.check_confirmation()?;
        }
        if args.controlled
            && control_closed()
            && session_effects::close_can_advance(
                self.closing.map(|(reason, _)| reason),
                CloseReason::ControlEof,
            )
        {
            self.request_close_at(pipe, CloseReason::ControlEof, now)?;
        }
        self.current = self.core.status();
        if let Some((id, result)) = self.core.reply() {
            let result = self.service_reply(id, result);
            self.respond_service(pipe, id, result)?;
        }
        self.expire_deferred(pipe, now)?;
        for tick in SCREEN_TICKS {
            tick(self, pipe)?;
        }
        if entered_live(self.last.as_ref(), &self.current)
            && session_effects::close_can_advance(
                self.closing.map(|(reason, _)| reason),
                CloseReason::Live,
            )
        {
            self.request_close_at(pipe, CloseReason::Live, now)?;
        }
        if self.last.as_ref() != Some(&self.current)
            && self.last_event.is_none_or(|time| {
                now.saturating_duration_since(time) >= Duration::from_millis(100)
            })
        {
            self.last_event = Some(now);
            if self.subscriptions.contains(&Topic::Core) {
                self.send_core(pipe)?;
            }
            if self.subscriptions.contains(&Topic::SimStatus) {
                frame::write(
                    pipe,
                    &HostToUi::Event {
                        event: Event::SimStatus {
                            live: self.current.live,
                        },
                    },
                )?;
            }
            self.last = Some(self.current.clone());
        }
        Ok(self.closing.is_none_or(|(reason, time)| {
            !matches!(reason, CloseReason::ControlEof | CloseReason::Live)
                || now.saturating_duration_since(time) <= Duration::from_secs(2)
        }))
    }
}
