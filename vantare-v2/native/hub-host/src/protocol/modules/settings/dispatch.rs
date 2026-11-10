use super::*;
impl Session {
    fn settings_dispatch(&mut self, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()> {
        match request {
            Request::SettingsGet {}
            | Request::SettingsDiscard {}
            | Request::SettingsUpdate { .. }
            | Request::SettingsRetry {} => self.settings_request(pipe, id, request),
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
    pub(super) fn settings_request(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        request: &Request,
    ) -> io::Result<()> {
        match request {
            Request::SettingsDiscard {} => frame::write(
                pipe,
                &HostToUi::Response {
                    id,
                    result: Reply::SettingsDiscard {
                        value: self.settings.discard(),
                    },
                },
            ),
            Request::SettingsGet {} => {
                let value = self.settings.refresh();
                frame::write(
                    pipe,
                    &HostToUi::Response {
                        id,
                        result: Reply::SettingsGet { value },
                    },
                )
            }
            Request::SettingsUpdate {
                patch,
                base_revision,
            } => {
                let result = self.settings.update(*patch, base_revision);
                settings_response(&mut self.diagnostic, pipe, id, result, |value| {
                    Reply::SettingsUpdate { value }
                })
            }
            Request::SettingsRetry {} => {
                let result = self.settings.retry();
                settings_response(&mut self.diagnostic, pipe, id, result, |value| {
                    Reply::SettingsRetry { value }
                })
            }
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    session.settings_dispatch(pipe, id, request)
}
