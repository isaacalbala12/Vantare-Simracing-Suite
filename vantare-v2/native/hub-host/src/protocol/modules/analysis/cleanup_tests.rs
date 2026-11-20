//! Real Win32 write failure: both pending cancellation paths must still run.
#![allow(clippy::unwrap_used)]
use super::*;

#[test]
fn failed_analysis_reply_still_cancels_the_deferred_service_request() {
    for request_close in [false, true] {
        let root = crate::test_support::Root::new();
        let name = format!(
            "analysis-cleanup-{}",
            vantare_services::random_id().unwrap()
        );
        let args = Args {
            controlled: false,
            pipe: format!("{name}-core"),
            data: root.path.clone(),
            layout: root.path.join("layout.json"),
            launcher: root.path.join("launcher.json"),
            engineer: root.path.join("engineer.json"),
            recordings: None,
        };
        let mut session = Session::new(
            &args,
            Core::start(&args.pipe, &root.path).unwrap(),
            Settings::load(&args),
            None,
            crate::privacy::State::isolated(&root.path),
        );
        let recordings = root.path.join("recordings");
        std::fs::create_dir_all(&recordings).unwrap();
        std::fs::write(
            recordings.join("a.duckdb"),
            include_bytes!("../../../analysis/fixtures/no-series.duckdb"),
        )
        .unwrap();
        let exe = std::env::current_exe().unwrap();
        session.analysis_state.helper_for_test(
            exe.parent()
                .unwrap()
                .parent()
                .unwrap()
                .join("vantare-storage.exe"),
        );
        let id = session.analysis_state.catalog().unwrap()[0].id.clone();
        let now = Instant::now();
        session
            .analysis_state
            .start(7, &Request::AnalysisInspect { id }, now)
            .unwrap();
        session.deferred = Some((8, now));
        session.accepted.insert(8, now);
        let stop = Arc::new(Stop::new().unwrap());
        let mut listener = Listener::new(&name, stop.clone(), Duration::from_millis(25)).unwrap();
        let mut pipe = listener.instance().unwrap();
        stop.set(); // An unconnected, cancelled pipe deterministically rejects writes.
        let result = if request_close {
            session.request_close_at(&mut pipe, CloseReason::ControlEof, now)
        } else {
            session.cancel_pending(&mut pipe)
        };
        assert!(result.is_err());
        assert!(session.deferred.is_none());
        assert!(!session.accepted.contains_key(&8));
        assert!(session.abandoned_deferred.contains(&8));
    }
}
