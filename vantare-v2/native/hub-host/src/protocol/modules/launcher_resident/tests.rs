use super::*;
fn status() -> mailbox::Status {
    mailbox::Status {
        version: mailbox::VERSION,
        updated_ms: mailbox::now_ms(),
        running: true,
        progress: r"C:\Users\private\game.exe --private".into(),
        error: Some(r"C:\Users\private\failure".into()),
        decision: Some(mailbox::Decision {
            id: u64::MAX,
            message: r"C:\Users\private\game.exe --private".into(),
            actions: vec![mailbox::Action::Trust, mailbox::Action::Cancel],
        }),
        ..Default::default()
    }
}
#[test]
fn projection_keeps_only_closed_decision_metadata_and_native_labels() {
    let status = status();
    let value = question(status.decision.as_ref().expect("decision")).expect("projection");
    assert_eq!(value.id, u64::MAX.to_string());
    assert_eq!(value.kind, ResidentQuestionKind::Authorization);
    assert_eq!(value.actions[0].label, mailbox::Action::Trust.label());
    let json = serde_json::to_string(&value).expect("wire");
    for forbidden in [
        "Users", "private", "progress", "message", "exe", "args", "\\\\",
    ] {
        assert!(!json.contains(forbidden));
    }
    assert_eq!(
        ResidentAction::ALL.map(ResidentAction::native),
        mailbox::Action::ALL
    );
}
#[test]
fn malformed_decision_actions_are_not_projected() {
    let mut d = status().decision.expect("decision");
    d.actions.clear();
    assert!(question(&d).is_none());
    d.actions = vec![mailbox::Action::Cancel; 2];
    assert!(question(&d).is_none());
    d.actions = vec![mailbox::Action::Cancel; 9];
    assert!(question(&d).is_none());
}
#[cfg(windows)]
#[test]
fn reads_missing_invalid_and_future_documents_without_creating_or_changing_them() {
    let root = crate::test_support::Root::new();
    let path = root.path.join("launcher.json");
    let state = State::new(path.clone());
    assert!(!state.view().protected);
    assert!(!path.exists());
    for bytes in [b"{".as_slice(), br#"{"version":999}"#.as_slice()] {
        std::fs::write(&path, bytes).expect("fixture");
        assert!(state.view().protected);
        assert_eq!(std::fs::read(&path).expect("unchanged"), bytes);
        assert!(!mailbox::request_path(&path).exists());
    }
}
#[cfg(windows)]
#[test]
fn freshness_registration_matching_and_polling_never_write_a_request() {
    use std::time::Duration;
    let root = crate::test_support::Root::new();
    let path = root.path.join("launcher.json");
    let mut document = Document::fresh_install();
    document.profiles[0].hotkey = "ctrl+shift+1".into();
    document.apps.push(vantare_launcher::App {
        id: "custom:1".into(),
        name: "QA".into(),
        executable: Some(r"C:\Users\private\a.exe".into()),
        args: vec!["--private".into()],
        favorite: false,
    });
    let bytes = serde_json::to_vec(&document).expect("document");
    std::fs::write(&path, &bytes).expect("fixture");
    let mut status = status();
    status.profiles.push(mailbox::Registration {
        profile: document.profiles[0].id.clone(),
        hotkey: document.profiles[0].hotkey.clone(),
        registered: true,
        error: None,
    });
    let publish = |status: &mailbox::Status| {
        std::fs::write(
            mailbox::status_path(&path),
            serde_json::to_vec(status).expect("status"),
        )
        .expect("fixture")
    };
    publish(&status);
    let mut state = State::new(path.clone());
    let now = Instant::now();
    let initial = state.observed(now);
    assert!(initial.online && initial.running && initial.error);
    assert_eq!(
        initial.registrations[0].state,
        crate::shortcuts::RegistrationState::Registered
    );
    let json = serde_json::to_string(&initial).expect("wire");
    assert!(!json.contains("Users") && !json.contains("private"));
    assert!(state.changed(now + Duration::from_millis(500)).is_none());
    status.updated_ms = 0;
    publish(&status);
    assert!(state.changed(now + Duration::from_millis(999)).is_none());
    let stale = state
        .changed(now + Duration::from_secs(1))
        .expect("expired status");
    assert!(!stale.online && !stale.running && !stale.error && stale.decision.is_none());
    assert_eq!(
        stale.registrations[0].state,
        crate::shortcuts::RegistrationState::Unconfirmed
    );
    state.reset();
    assert!(state.changed(now + Duration::from_secs(1)).is_some());
    assert_eq!(std::fs::read(&path).expect("unchanged"), bytes);
    assert!(!mailbox::request_path(&path).exists());
}
