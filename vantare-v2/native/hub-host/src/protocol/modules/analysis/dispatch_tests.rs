use super::*;
#[test]
fn analysis_rights_are_checked_on_every_request() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    session.current.rights = crate::protocol::LinkState::Connected;
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
            } else if matches!(request, Request::AnalysisCancel {}) {
                assert_eq!(
                    reply,
                    HostToUi::Response {
                        id: 7,
                        result: Reply::AnalysisCancel { cancelled: false }
                    }
                );
            } else {
                assert_eq!(
                    reply,
                    HostToUi::Failure {
                        id: 7,
                        error: HostError::AnalysisNotFound
                    }
                );
            }
        }
    }
    assert_eq!(session.core.requests, 0);
}
#[test]
fn denied_and_disconnected_feed_revoke_catalog_tokens() {
    for disconnect in [false, true] {
        let fixture = Fixture::new();
        let mut session = fixture.session();
        let root = fixture.0.join("hub/recordings");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("private.duckdb"), []).unwrap();
        session.current.access.verified = true;
        session.current.access.analysis = true;
        session.current.rights = crate::protocol::LinkState::Connected;
        let old = session.analysis_state.catalog().unwrap()[0].id.clone();
        if disconnect {
            session.current.rights = crate::protocol::LinkState::Unavailable;
        } else {
            session.current.access.analysis = false;
        }
        let mut pipe = Pipe::new(Vec::new());
        session
            .request(&mut pipe, 1, &Request::AnalysisInspect { id: old.clone() })
            .unwrap();
        pipe.set_position(0);
        assert_eq!(
            frame::Reader::default()
                .next::<HostToUi>(&mut pipe)
                .unwrap()
                .unwrap(),
            HostToUi::Failure {
                id: 1,
                error: HostError::Denied
            }
        );
        session.current.access.analysis = true;
        session.current.rights = crate::protocol::LinkState::Connected;
        assert_eq!(
            session
                .analysis_state
                .start(2, &Request::AnalysisOpen { id: old }, Instant::now()),
            Err(HostError::AnalysisNotFound)
        );
    }
}
#[cfg(windows)]
#[test]
fn active_work_is_answered_on_revocation_feed_loss_and_host_close() {
    for cause in ["right", "feed", "close"] {
        let fixture = Fixture::new();
        let mut session = fixture.session();
        let root = fixture.0.join("hub/recordings");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(
            root.join("private.duckdb"),
            include_bytes!("../../../analysis/fixtures/no-series.duckdb"),
        )
        .unwrap();
        session.current.access.verified = true;
        session.current.access.analysis = true;
        session.current.rights = crate::protocol::LinkState::Connected;
        let exe = std::env::current_exe().unwrap();
        session.analysis_state.helper_for_test(
            exe.parent()
                .unwrap()
                .parent()
                .unwrap()
                .join("vantare-storage.exe"),
        );
        let old = session.analysis_state.catalog().unwrap()[0].id.clone();
        let now = Instant::now();
        assert_eq!(
            session
                .analysis_state
                .start(7, &Request::AnalysisInspect { id: old.clone() }, now)
                .unwrap(),
            None
        );
        let mut pipe = Pipe::new(Vec::new());
        match cause {
            "right" => {
                session.current.access.analysis = false;
                analysis_tick::tick(&mut session, &mut pipe).unwrap();
            }
            "feed" => {
                session.current.rights = crate::protocol::LinkState::Unavailable;
                analysis_tick::tick(&mut session, &mut pipe).unwrap();
            }
            _ => session
                .request_close_at(&mut pipe, CloseReason::ControlEof, now)
                .unwrap(),
        }
        pipe.set_position(0);
        assert_eq!(
            frame::Reader::default()
                .next::<HostToUi>(&mut pipe)
                .unwrap()
                .unwrap(),
            HostToUi::Failure {
                id: 7,
                error: if cause == "close" {
                    HostError::AnalysisCancelled
                } else {
                    HostError::Denied
                }
            }
        );
        session.analysis_state.wait_for_test();
        assert!(session.analysis_state.poll(now, true, false).is_none());
        assert_eq!(
            session
                .analysis_state
                .start(8, &Request::AnalysisOpen { id: old }, now),
            Err(HostError::AnalysisNotFound)
        );
    }
}
