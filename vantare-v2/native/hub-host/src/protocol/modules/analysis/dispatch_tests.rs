use super::*;
#[test]
fn analysis_rights_are_checked_on_every_request() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    for (verified, blocked, analysis) in [
        (false, false, true),
        (true, true, true),
        (true, false, false),
        (true, false, true),
        (true, false, false),
    ] {
        session.current.access.verified = verified;
        session.current.access.blocked = blocked;
        session.current.access.analysis = analysis;
        for request in [
            Request::AnalysisCatalog {},
            Request::AnalysisInspect { id: "a".repeat(64) },
            Request::AnalysisOpen { id: "a".repeat(64) },
            Request::AnalysisClose {
                session: "a".repeat(64),
            },
            Request::AnalysisCancel {},
        ] {
            let mut pipe = Pipe::new(Vec::new());
            session.request(&mut pipe, 7, &request).unwrap();
            pipe.set_position(0);
            let reply: HostToUi = frame::Reader::default().next(&mut pipe).unwrap().unwrap();
            if !verified || blocked || !analysis {
                assert_eq!(
                    reply,
                    HostToUi::Failure {
                        id: 7,
                        error: HostError::Denied
                    }
                );
            } else if matches!(request, Request::AnalysisCatalog {}) {
                assert_eq!(
                    reply,
                    HostToUi::Response {
                        id: 7,
                        result: Reply::AnalysisCatalog {
                            recordings: vec![],
                            max: 256
                        }
                    }
                );
            } else {
                assert_eq!(
                    reply,
                    HostToUi::Failure {
                        id: 7,
                        error: HostError::Unsupported
                    }
                );
            }
        }
    }
    assert_eq!(session.core.requests, 0);
}
