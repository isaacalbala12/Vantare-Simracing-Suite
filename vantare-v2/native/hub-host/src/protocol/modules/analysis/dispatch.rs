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
    session.respond(
        pipe,
        id,
        bounded(id, result),
        crate::diagnostics::DiagnosticSection::Services,
    )
}
fn bounded(id: u32, result: Result<Reply, HostError>) -> Result<Reply, HostError> {
    use crate::protocol::HostToUi;
    let fits = match &result {
        Ok(reply) => serde_json::to_vec(&HostToUi::Response {
            id,
            result: reply.clone(),
        })
        .is_ok_and(|bytes| bytes.len() < crate::frame::LIMIT),
        Err(_) => true,
    };
    if fits {
        result
    } else {
        Err(HostError::AnalysisTooLarge)
    }
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
        Request::AnalysisClose { session } | Request::AnalysisCompare { session, .. }
            if !token(session) =>
        {
            Err(HostError::AnalysisNotFound)
        }
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

#[cfg(test)]
mod compare_frame_tests {
    #![allow(clippy::unwrap_used)]
    use super::*;
    use crate::analysis::projection::{AnalysisGaps, AnalysisPoint, AnalysisRange, AnalysisSeries};
    #[test]
    fn seven_full_series_fit_with_margin_and_oversized_gaps_error_without_truncation() {
        let number = serde_json::Number::from_f64(f64::MAX).unwrap();
        let point = AnalysisPoint {
            distance: number.clone(),
            elapsed: Some(number.clone()),
            value: serde_json::Number::from_f64(-f64::MAX).unwrap(),
            segment: 10_000_200_000,
        };
        let points = vec![point; 1024];
        let series = AnalysisSeries {
            a: points.clone(),
            b: points.clone(),
        };
        let mut reply = Reply::AnalysisCompare {
            distance_range: [0.into(), number.clone()],
            speed: series.clone(),
            throttle: series.clone(),
            brake: series,
            delta: Some(points),
            delta_unavailable: None,
            gaps: AnalysisGaps {
                a: vec![],
                b: vec![],
            },
        };
        let bytes = serde_json::to_vec(&crate::protocol::HostToUi::Response {
            id: u32::MAX,
            result: reply.clone(),
        })
        .unwrap()
        .len();
        assert!(bytes < crate::frame::LIMIT - 32 * 1024, "{bytes}");
        assert_eq!(bounded(u32::MAX, Ok(reply.clone())), Ok(reply.clone()));
        if let Reply::AnalysisCompare { gaps, .. } = &mut reply {
            gaps.a = vec![
                AnalysisRange {
                    from: 0.into(),
                    to: number
                };
                100_000
            ];
        }
        assert_eq!(
            bounded(u32::MAX, Ok(reply)),
            Err(HostError::AnalysisTooLarge)
        );
    }
}
