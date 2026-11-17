use super::{HostError, Pipe, Reply, Request, Session, io};
pub(super) fn allowed(session: &Session) -> bool {
    let access = &session.current.access;
    access.verified
        && !access.blocked
        && access.analysis
        && session.current.rights == crate::protocol::LinkState::Connected
        && session.closing.is_none()
}
pub(super) fn publish(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    result: Result<Reply, HostError>,
) -> io::Result<()> {
    use crate::protocol::HostToUi;
    let fits = match &result {
        Ok(reply) => serde_json::to_vec(&HostToUi::Response {
            id,
            result: reply.clone(),
        })
        .is_ok_and(|bytes| bytes.len() < crate::frame::LIMIT),
        Err(_) => true,
    };
    session.respond(
        pipe,
        id,
        if fits {
            result
        } else {
            Err(HostError::AnalysisTooLarge)
        },
        crate::diagnostics::DiagnosticSection::Services,
    )
}
pub(super) fn closing(session: &mut Session, pipe: &mut Pipe) -> io::Result<()> {
    if let Some((id, result)) = session
        .analysis_state
        .poll(std::time::Instant::now(), true, true)
    {
        publish(session, pipe, id, result)?;
    }
    Ok(())
}
pub(super) fn dispatch(
    session: &mut Session,
    pipe: &mut Pipe,
    id: u32,
    request: &Request,
) -> io::Result<()> {
    let now = std::time::Instant::now();
    if !allowed(session) {
        if let Some((pending, result)) = session.analysis_state.poll(now, false, false) {
            publish(session, pipe, pending, result)?;
        }
        return publish(session, pipe, id, Err(HostError::Denied));
    }
    let result = match request {
        Request::AnalysisCatalog {} => session.analysis_state.catalog().map(|recordings| {
            Some(Reply::AnalysisCatalog {
                recordings,
                max: crate::analysis::catalog::CATALOG_MAX,
            })
        }),
        Request::AnalysisCancel {} => {
            let cancelled = session.analysis_state.cancel();
            if let Some((pending, result)) = session.analysis_state.poll(now, true, false) {
                publish(session, pipe, pending, result)?;
            }
            Ok(Some(Reply::AnalysisCancel { cancelled }))
        }
        Request::AnalysisInspect { id } | Request::AnalysisOpen { id } if !token(id) => {
            Err(HostError::AnalysisNotFound)
        }
        Request::AnalysisClose { session } if !token(session) => Err(HostError::AnalysisNotFound),
        _ => session.analysis_state.start(id, request, now),
    };
    match result {
        Ok(None) => Ok(()),
        Ok(Some(reply)) => publish(session, pipe, id, Ok(reply)),
        Err(error) => publish(session, pipe, id, Err(error)),
    }
}
fn token(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
