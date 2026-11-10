use super::*;
impl Session {
    fn testing_dispatch(&mut self, pipe: &mut Pipe, id: u32, request: &Request) -> io::Result<()> {
        match request {
            Request::TestingAnswer { .. }
            | Request::TestingContribute { .. }
            | Request::TestingCredit { .. }
            | Request::TestingNoticeRead { .. }
            | Request::ReportCapture { .. }
            | Request::ReportRemoveScreenshot { .. }
            | Request::ReportPrepare {}
            | Request::ReportRetryPrepare {}
            | Request::ReportSend { .. }
            | Request::TestingRefresh {}
            | Request::DraftLoad {}
            | Request::DraftSave { .. }
            | Request::DraftDiscard {} => self.testing_request(pipe, id, request),
            _ => Err(io::ErrorKind::InvalidInput.into()),
        }
    }
    pub(super) fn testing_request(
        &mut self,
        pipe: &mut Pipe,
        id: u32,
        request: &Request,
    ) -> io::Result<()> {
        let result = crate::testing::intent(request, &self.current.access).and_then(
            |(operation, command)| {
                self.core.request(id, command)?;
                self.remote = Some((id, RemoteKind::Testing(operation)));
                Ok(())
            },
        );
        match result {
            Ok(()) => Ok(()),
            Err(error) => self.respond(
                pipe,
                id,
                Err(error),
                crate::diagnostics::DiagnosticSection::Services,
            ),
        }
    }
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    session.testing_dispatch(pipe, id, request)
}
pub(super) fn complete(
    session: &mut Session,
    remote: Option<(u32, RemoteKind)>,
    id: u32,
    result: Result<vantare_ipc::services_protocol::Reply, HostError>,
) -> Result<Reply, HostError> {
    session.testing_complete(remote, id, result)
}
impl Session {
    fn testing_complete(
        &mut self,
        remote: Option<(u32, RemoteKind)>,
        id: u32,
        result: Result<vantare_ipc::services_protocol::Reply, HostError>,
    ) -> Result<Reply, HostError> {
        match (remote, result) {
            (Some((expected, RemoteKind::Testing(operation))), Ok(reply)) if expected == id => {
                crate::testing::complete(operation, reply)
            }
            (_, Err(error)) => Err(error),
            _ => Err(HostError::Denied),
        }
    }
}
