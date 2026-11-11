use super::{HostError, Pipe, RemoteKind, Reply, Request, Session, io};
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
                self.testing_state.begin(operation);
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
) -> Result<Option<Reply>, HostError> {
    match (remote, result) {
        (Some((expected, RemoteKind::Testing(operation))), Ok(reply)) if expected == id => {
            session.complete_testing(id, operation, reply)
        }
        (_, Err(error)) => Err(error),
        _ => Err(HostError::Rejected),
    }
}
impl Session {
    fn complete_testing(
        &mut self,
        id: u32,
        operation: crate::testing::Operation,
        reply: vantare_ipc::services_protocol::Reply,
    ) -> Result<Option<Reply>, HostError> {
        match self.testing_state.complete(operation, reply)? {
            crate::testing::legacy::Next::Complete(reply) => {
                let mut result = crate::testing::complete(operation, reply)?;
                match &mut result {
                    Reply::DraftLoad { value }
                    | Reply::DraftSave { value }
                    | Reply::DraftDiscard { value } => value.legacy = self.testing_state.legacy,
                    _ => {}
                }
                Ok(Some(result))
            }
            crate::testing::legacy::Next::Import(command) => {
                self.core.request(id, command)?;
                self.remote = Some((id, RemoteKind::Testing(operation)));
                self.deferred = Some((id, std::time::Instant::now()));
                Ok(None)
            }
        }
    }
}
