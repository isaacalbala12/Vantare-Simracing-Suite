use super::{HostError, Pipe, RemoteKind, Reply, Request, Session, io};
impl Session {
    fn privacy_dispatch(&mut self, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()> {
        match request {
            Request::PrivacyPolicy {} => self.respond(
                pipe,
                id,
                Err(HostError::Unsupported),
                crate::diagnostics::DiagnosticSection::Privacy,
            ),
            Request::PrivacyGet {} | Request::PrivacyUpdate { .. } => {
                self.privacy_request(pipe, id, request)
            }
            Request::MailGet {} | Request::MailSet { .. } => self.mail_request(pipe, id, request),
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
    pub(super) fn mail_request(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        request: &Request,
    ) -> io::Result<()> {
        use vantare_ipc::services_protocol::{Command, MailSource};
        let (kind, command) = match request {
            Request::MailGet {} => (RemoteKind::MailGet, Command::MailConsentGet),
            Request::MailSet { consent } => (
                RemoteKind::MailSet,
                Command::MailConsentSet {
                    consent: *consent,
                    source: MailSource::Settings,
                },
            ),
            _ => return Err(io::ErrorKind::InvalidInput.into()),
        };
        match self.request_remote(id, kind, command) {
            Ok(()) => Ok(()),
            Err(error) => self.respond(
                pipe,
                id,
                Err(error),
                crate::diagnostics::DiagnosticSection::Services,
            ),
        }
    }
    pub(super) fn privacy_request(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        request: &Request,
    ) -> io::Result<()> {
        let result = match request {
            Request::PrivacyGet {} => Ok(Reply::PrivacyGet {
                value: self.privacy.refresh(),
            }),
            Request::PrivacyUpdate {
                patch,
                base_revision,
            } => self
                .privacy
                .update(*patch, base_revision)
                .map(|value| Reply::PrivacyUpdate { value }),
            _ => Err(HostError::Unsupported),
        };
        self.respond(
            pipe,
            id,
            result,
            crate::diagnostics::DiagnosticSection::Privacy,
        )
    }
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    session.privacy_dispatch(pipe, id, request)
}
pub(super) fn complete(
    _session: &mut Session,
    remote: Option<(u32, RemoteKind)>,
    id: u32,
    result: Result<vantare_ipc::services_protocol::Reply, HostError>,
) -> Result<Reply, HostError> {
    match (remote, result) {
        (
            Some((expected, kind)),
            Ok(vantare_ipc::services_protocol::Reply::MailConsent { consent, .. }),
        ) if expected == id => {
            let value = crate::privacy::MailView { consent };
            match kind {
                RemoteKind::MailGet => Ok(Reply::MailGet { value }),
                RemoteKind::MailSet => Ok(Reply::MailSet { value }),
                _ => Err(HostError::Denied),
            }
        }
        (_, Err(error)) => Err(error),
        _ => Err(HostError::Denied),
    }
}
