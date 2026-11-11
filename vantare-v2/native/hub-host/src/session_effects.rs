use super::{
    CloseReason, Event, HostError, HostToUi, Instant, Pipe, Reply, SaveError, Session, frame, io,
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
impl Session {
    pub(super) fn request_close(&mut self, pipe: &mut Pipe, reason: CloseReason) -> io::Result<()> {
        self.closing = Some((reason, Instant::now()));
        frame::write(pipe, &HostToUi::CloseRequested { reason })
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
