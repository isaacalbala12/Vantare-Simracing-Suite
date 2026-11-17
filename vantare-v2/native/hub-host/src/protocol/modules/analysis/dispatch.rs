use super::{HostError, Pipe, Reply, Request, Session, io};
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    let access = &session.current.access;
    let result = if !access.verified || access.blocked || !access.analysis {
        session.analysis_state.clear();
        Err(HostError::Denied)
    } else {
        match request {
            Request::AnalysisCatalog {} => {
                session
                    .analysis_state
                    .catalog()
                    .map(|recordings| Reply::AnalysisCatalog {
                        recordings,
                        max: crate::analysis::catalog::CATALOG_MAX,
                    })
            }
            // C2b-2: the worker, reader lifetime and cancellation arrive in a separate PR.
            Request::AnalysisInspect { .. }
            | Request::AnalysisOpen { .. }
            | Request::AnalysisClose { .. }
            | Request::AnalysisCancel {} => Err(HostError::Unsupported),
            _ => return Err(io::ErrorKind::InvalidInput.into()),
        }
    };
    session.respond(
        pipe,
        id,
        result,
        crate::diagnostics::DiagnosticSection::Services,
    )
}
