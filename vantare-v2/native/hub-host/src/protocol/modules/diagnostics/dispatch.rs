use super::*;
impl Session {
    fn diagnostics_dispatch(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        request: &Request,
    ) -> io::Result<()> {
        match request {
            Request::DiagnosticsGet {}
            | Request::DiagnosticsPrepare {}
            | Request::DiagnosticsCopy {} => self.diagnostics_request(pipe, id, request),
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
    pub(super) fn diagnostics_request(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        request: &Request,
    ) -> io::Result<()> {
        let protected = self.settings.view().protected;
        let result = match request {
            Request::DiagnosticsGet {} => Ok(Reply::DiagnosticsGet {
                value: self.diagnostic.view(&self.current, protected),
            }),
            Request::DiagnosticsPrepare {} => self
                .diagnostic
                .prepare(&self.current, protected)
                .map(|value| Reply::DiagnosticsPrepare { value }),
            Request::DiagnosticsCopy {} => self
                .diagnostic
                .copy()
                .map(|text| Reply::DiagnosticsCopy { text }),
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
    session.diagnostics_dispatch(pipe, id, request)
}
