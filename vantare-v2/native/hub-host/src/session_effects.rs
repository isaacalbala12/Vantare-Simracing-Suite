use super::{
    CloseReason, Event, HostError, HostToUi, Instant, Pipe, RemoteKind, Reply, SaveError, Session,
    frame, io,
};
pub(super) fn settings_response(
    observed: &mut crate::diagnostics::Observed,
    pipe: &mut Pipe,
    id: u32,
    result: Result<crate::settings::SettingsView, SaveError>,
    reply: impl FnOnce(crate::settings::SettingsView) -> Reply,
) -> io::Result<()> {
    let message = match result {
        Ok(value) => HostToUi::Response {
            id,
            result: reply(value),
        },
        Err(error) => HostToUi::Failure {
            id,
            error: match error {
                SaveError::Busy => HostError::Busy,
                SaveError::Conflict(current) => HostError::Conflict { current },
                SaveError::Protected => HostError::Protected,
                SaveError::Io => HostError::Io,
                SaveError::Unsupported => HostError::Unsupported,
            },
        },
    };
    if let HostToUi::Failure { error, .. } = &message {
        observed.note(crate::diagnostics::DiagnosticSection::Settings, error);
    }
    frame::write(pipe, &message)
}
pub(super) fn finish_session(exit_code: u8, cancel: impl FnOnce() -> io::Result<()>) -> u8 {
    let _ = cancel();
    exit_code
}
impl Session {
    pub(super) fn request_remote(
        &mut self,
        id: u32,
        kind: RemoteKind,
        command: vantare_ipc::services_protocol::Command,
    ) -> Result<(), HostError> {
        self.request_remote_at(id, kind, command, Instant::now())
    }
    pub(super) fn request_remote_at(
        &mut self,
        id: u32,
        kind: RemoteKind,
        command: vantare_ipc::services_protocol::Command,
        now: Instant,
    ) -> Result<(), HostError> {
        if self.abandoned_deferred.contains(&id)
            || self.remotes.contains_key(&id)
            || self.accepted.contains_key(&id)
            || self.remotes.values().any(|pending| *pending == kind)
        {
            return Err(HostError::Busy);
        }
        self.core.request_at(id, command, now)?;
        self.remotes.insert(id, kind);
        self.accepted.insert(id, now);
        Ok(())
    }
    pub(super) fn continue_import(
        &mut self,
        id: u32,
        kind: RemoteKind,
        command: vantare_ipc::services_protocol::Command,
    ) -> Result<(), HostError> {
        let accepted = *self.accepted.get(&id).ok_or(HostError::Rejected)?;
        self.core.request_continuation(id, command, accepted)?;
        self.remotes.insert(id, kind);
        self.deferred = Some((id, accepted));
        Ok(())
    }

    pub(super) fn validate_service_completion(
        &mut self,
        id: u32,
        result: Result<Option<Reply>, HostError>,
    ) -> Result<Option<Reply>, HostError> {
        let result = match result {
            Ok(None)
                if self.deferred.is_none_or(|(expected, _)| expected != id)
                    || !matches!(self.remotes.get(&id), Some(RemoteKind::Testing(_))) =>
            {
                Err(HostError::Rejected)
            }
            other => other,
        };
        if !matches!(&result, Ok(None)) && self.deferred.is_some_and(|(expected, _)| expected == id)
        {
            self.deferred = None;
        }
        if !matches!(&result, Ok(None)) {
            self.accepted.remove(&id);
        }
        result
    }
    pub(super) fn request_close(&mut self, pipe: &mut Pipe, reason: CloseReason) -> io::Result<()> {
        self.cancel_deferred(pipe)?;
        self.closing = Some((reason, Instant::now()));
        frame::write(pipe, &HostToUi::CloseRequested { reason })
    }
    pub(super) fn respond_service(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        result: Result<Option<Reply>, HostError>,
    ) -> io::Result<()> {
        match result {
            Ok(None) => Ok(()),
            Ok(Some(reply)) => self.respond(
                pipe,
                id,
                Ok(reply),
                crate::diagnostics::DiagnosticSection::Services,
            ),
            Err(error) => self.respond(
                pipe,
                id,
                Err(error),
                crate::diagnostics::DiagnosticSection::Services,
            ),
        }
    }
    pub(super) fn cancel_deferred(&mut self, pipe: &mut Pipe) -> io::Result<()> {
        if let Some((id, _)) = self.deferred.take() {
            self.remotes.remove(&id);
            self.core.cancel_queued(id);
            self.abandoned_deferred.insert(id);
            self.accepted.remove(&id);
            self.respond_service(pipe, id, Err(HostError::CoreUnavailable))?;
        }
        Ok(())
    }
    pub(super) fn expire_deferred(&mut self, pipe: &mut Pipe, now: Instant) -> io::Result<()> {
        if self.deferred.is_some_and(|(_, started)| {
            self.current.services != crate::protocol::LinkState::Connected
                || now.saturating_duration_since(started).as_millis()
                    >= u128::from(crate::protocol::REQUEST_TIMEOUT_MS)
        }) {
            self.cancel_deferred(pipe)?;
        }
        Ok(())
    }
    pub(super) fn send_core(&self, pipe: &mut Pipe) -> io::Result<()> {
        frame::write(
            pipe,
            &HostToUi::Event {
                event: Event::Core {
                    value: self.current.clone(),
                },
            },
        )
    }
    pub(super) fn respond(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        result: Result<Reply, HostError>,
        section: crate::diagnostics::DiagnosticSection,
    ) -> io::Result<()> {
        let message = match result {
            Ok(result) => HostToUi::Response { id, result },
            Err(error) => {
                self.diagnostic.note(section, &error);
                HostToUi::Failure { id, error }
            }
        };
        frame::write(pipe, &message)
    }
}
