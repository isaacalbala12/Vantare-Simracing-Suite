//! The license endpoint's 401 changes session, never the verified binding.
use super::online_only::{seed_account, start_core};
use super::*;
use vantare_services::{app::App, test_http::Server};

#[test]
fn license_endpoint_401_preserves_signed_rights_and_separates_manual_from_automatic() {
    for automatic in [false, true] {
        authentication_case(automatic);
    }
}

fn authentication_case(automatic: bool) {
    let temporary = std::env::temp_dir();
    let root = temporary.join(format!(
        "vt-e401-{}",
        vantare_services::random_id().expect("id")
    ));
    std::fs::create_dir(&root).expect("private fixture");
    std::fs::write(root.join("fixture-owned"), b"isa1827-e").expect("ownership");
    let device = vantare_services::license::installation::legacy_fingerprint().expect("device");
    let (signed, keys) =
        signed_grant_for_device(chrono::TimeDelta::zero(), "vantare.plan.founders", &device);
    let server = Server::start_observed(vec![(401, "{}".into())]);
    let (core, link) = start_core(&root, &keys, &device);
    let policy = control::request(
        &link,
        control::Command::InstallOnline {
            credential: serde_json::to_string(&signed.credential).expect("signed fixture"),
        },
    )
    .expect("durable verified binding");
    assert!(policy.state.permits_access());
    let binding = saved_bytes(&root.join("core"), "binding.dpapi");
    let app_root = root.join("services");
    seed_account(&app_root, &server);
    let mut app = open_app(&server, &keys, &app_root, &link);
    let mut state = State::default();
    state.renewal.observe(&confirmed_session());
    let now = Instant::now();
    let mut dispatch = |state: &mut State, command| {
        dispatch_observing_session(state, command, |_, command| app.handle(command))
    };
    let reply = if automatic {
        run_renewal(
            &mut state,
            &policy,
            policy.checked_at_ms,
            now,
            &mut dispatch,
        )
        .expect("startup renewal for a real perpetual v1 grant")
    } else {
        let signing = Arc::new(Mutex::new(None));
        handle_with(&mut state, Command::LicenseRenew, &signing, &mut dispatch)
    };
    let expected = if automatic {
        protocol::RenewalOutcome::Transient
    } else {
        protocol::RenewalOutcome::Definitive
    };
    assert!(matches!(reply, Reply::LicenseFailure { outcome, .. } if outcome == expected));
    let session = if automatic {
        protocol::Session::NeedsSignIn
    } else {
        protocol::Session::SignedIn
    };
    assert_eq!(state.renewal.session(), Some(session));
    assert_eq!(
        state.notice.is_some(),
        !automatic,
        "401 automatic creates no definitive notice"
    );
    let retained = control::request(&link, control::Command::Read).expect("rights still available");
    assert_eq!(retained.state, policy.state);
    assert_eq!(retained.catalog, policy.catalog);
    assert_eq!(retained.signed_until_ms, policy.signed_until_ms);
    assert_eq!(retained.calendar, policy.calendar);
    assert_eq!(retained.tester, policy.tester);
    assert_eq!(saved_bytes(&root.join("core"), "binding.dpapi"), binding);
    assert_scheduler(&mut state, &retained, now, automatic);
    drop(app);
    let mut app = open_app(&server, &keys, &app_root, &link);
    assert!(
        matches!(app.handle(Command::AccountPoll), Reply::Account { session: observed, .. } if observed == session)
    );
    if automatic {
        let saved = saved_bytes(&app_root, "account.dpapi");
        assert!(matches!(
            app.handle(Command::LicenseRenewAutomatic),
            Reply::LicenseFailure {
                outcome: protocol::RenewalOutcome::Transient,
                ..
            }
        ));
        assert_eq!(
            saved_bytes(&app_root, "account.dpapi"),
            saved,
            "no rewrite or reuse of the rejected session"
        );
    }
    assert_eq!(saved_bytes(&root.join("core"), "binding.dpapi"), binding);
    let requests = server.finish_observed();
    assert_eq!(
        requests.len(),
        1,
        "only the rejected license request; no refresh/replay"
    );
    assert!(requests[0].starts_with("POST /functions/v1/native-license "));
    drop(app);
    drop(core);
    remove_owned_fixture(&root, &temporary);
}

fn remove_owned_fixture(root: &std::path::Path, temporary: &std::path::Path) {
    assert_eq!(
        std::fs::read(root.join("fixture-owned")).expect("ownership"),
        b"isa1827-e"
    );
    assert!(
        root.canonicalize()
            .expect("root")
            .starts_with(temporary.canonicalize().expect("temporary"))
    );
    std::fs::remove_dir_all(root).expect("owned fixture cleanup");
}

fn assert_scheduler(state: &mut State, policy: &control::Policy, now: Instant, automatic: bool) {
    assert_eq!(
        state
            .renewal
            .claim(policy, policy.checked_at_ms, now + Duration::from_hours(1)),
        Err(if automatic {
            renewal::Skip::NoSession
        } else {
            renewal::Skip::Blocked
        })
    );
    if automatic {
        // A fact-only observation does not clear Blocked like confirmed_login would.
        state.renewal.observe(&confirmed_session());
        assert!(
            state
                .renewal
                .claim(policy, policy.checked_at_ms, now + Duration::from_hours(1))
                .is_ok()
        );
    }
}

fn open_app(server: &Server, keys: &str, root: &std::path::Path, core: &CoreLink) -> App {
    let mut app = App::with_clock(
        super::verification::config(server, keys.into()),
        root.into(),
        || Ok(100),
    );
    app.enable_loopback_for_test();
    app.attach_core(core.clone());
    app
}

fn saved_bytes(root: &std::path::Path, name: &str) -> Vec<u8> {
    fn visit(root: &std::path::Path, name: &str, found: &mut Vec<Vec<u8>>) {
        for entry in std::fs::read_dir(root).expect("fixture directory") {
            let entry = entry.expect("entry");
            if entry.file_type().expect("type").is_dir() {
                visit(&entry.path(), name, found);
            } else if entry.file_name() == name {
                found.push(std::fs::read(entry.path()).expect("fixture bytes"));
            }
        }
    }
    let mut found = vec![];
    visit(root, name, &mut found);
    assert_eq!(found.len(), 1, "one declared document");
    found.pop().expect("document")
}
