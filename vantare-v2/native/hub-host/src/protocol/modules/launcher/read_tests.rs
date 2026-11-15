use super::*;
fn save_consumes_read(stale: bool) {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let view = session.launcher_reader.view();
    assert!(view.scanning);
    let document = vantare_launcher::Document::fresh_install();
    let profile = &document.profiles[0].id;
    let read = session
        .profile_step_keys
        .open(&session.launcher, Some(profile))
        .expect("issued read");
    let before = std::fs::read(&session.launcher).expect("launcher bytes");
    let found = vantare_launcher::discovery::Discovery {
        apps: document
            .apps
            .iter()
            .map(|app| vantare_launcher::discovery::Detected {
                id: app.id.clone(),
                executable: None,
                availability: vantare_launcher::discovery::Availability {
                    launchable: true,
                    ..Default::default()
                },
            })
            .collect(),
        ..Default::default()
    };
    let positive = fixture.0.join("positive.json");
    std::fs::write(&positive, &before).expect("positive fixture");
    crate::launcher::editor::save(
        &positive,
        &read.draft,
        &read.revision,
        &found,
        None,
        Some(&session.profile_step_keys),
    )
    .expect("the issued capabilities permit a save before rejection");
    std::fs::write(&positive, &before).expect("restore positive fixture revision");
    let request = Request::LauncherProfileSave {
        draft: read.draft.clone(),
        base_revision: if stale {
            "f".repeat(64)
        } else {
            read.revision.clone()
        },
    };
    let mut pipe = Pipe::new(Vec::new());
    session.request(&mut pipe, 7, &request).expect("save route");
    pipe.set_position(0);
    let reply: HostToUi = frame::Reader::default()
        .next(&mut pipe)
        .expect("frame")
        .expect("reply");
    if stale {
        assert!(matches!(
            reply,
            HostToUi::Failure {
                id: 7,
                error: HostError::LauncherConflict { .. }
            }
        ));
    } else {
        assert!(matches!(
            reply,
            HostToUi::Failure {
                id: 7,
                error: HostError::Busy
            }
        ));
    }
    assert_eq!(
        crate::launcher::editor::save(
            &positive,
            &read.draft,
            &read.revision,
            &found,
            None,
            Some(&session.profile_step_keys)
        ),
        Err(HostError::Denied)
    );
    assert_eq!(
        std::fs::read(&positive).expect("rejected old capabilities do not write"),
        before
    );
    assert_eq!(
        std::fs::read(&session.launcher).expect("unchanged launcher"),
        before
    );
}
#[test]
fn save_busy_consumes_the_issued_read_without_writing() {
    save_consumes_read(false);
}
#[test]
fn save_conflict_consumes_the_issued_read_without_writing() {
    save_consumes_read(true);
}

#[test]
fn preparing_copy_is_read_only_and_stale_save_is_rejected_before_discovery() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let document = vantare_launcher::Document::fresh_install();
    let before = serde_json::to_vec(&document).expect("fixture");
    std::fs::write(&session.launcher, &before).expect("fixture");
    let revision = vantare_services::content_hash(&before);
    session.launcher_reader = crate::launcher::Reader::with_discovery(
        session.launcher.clone(),
        revision.clone(),
        vantare_launcher::discovery::Discovery::default(),
    );
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(
            &mut pipe,
            1,
            &Request::LauncherProfilePrepareDuplicate {
                id: document.profiles[0].id.clone(),
                base_revision: revision.clone(),
            },
        )
        .expect("prepare dispatch");
    pipe.set_position(0);
    let HostToUi::Response {
        result: crate::protocol::Reply::LauncherProfilePrepareDuplicate { value },
        ..
    } = frame::Reader::default()
        .next(&mut pipe)
        .expect("frame")
        .expect("response")
    else {
        panic!("prepared editor")
    };
    assert_eq!(std::fs::read(&session.launcher).expect("no write"), before);
    assert_eq!(session.core.requests, 0);
    let mut changed = document.clone();
    changed.profiles[0].name = "Changed".into();
    let bytes = serde_json::to_vec(&changed).expect("changed");
    std::fs::write(&session.launcher, &bytes).expect("changed");
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(
            &mut pipe,
            2,
            &Request::LauncherProfileSave {
                draft: value.draft,
                base_revision: value.base_revision,
            },
        )
        .expect("save dispatch");
    pipe.set_position(0);
    assert!(matches!(
        frame::Reader::default().next(&mut pipe).expect("frame"),
        Some(HostToUi::Failure {
            error: HostError::Rejected,
            ..
        })
    ));
    assert!(!session.profile_step_keys.is_prepared_duplicate());
    assert_eq!(
        std::fs::read(&session.launcher).expect("not replayed"),
        bytes
    );
    assert_eq!(session.core.requests, 0);
}

#[test]
fn preparing_with_lagging_discovery_is_busy_without_issuing_capabilities() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let document = vantare_launcher::Document::fresh_install();
    let before = serde_json::to_vec(&document).expect("fixture");
    std::fs::write(&session.launcher, &before).expect("fixture");
    let revision = vantare_services::content_hash(&before);
    session.launcher_reader = crate::launcher::Reader::with_discovery(
        session.launcher.clone(),
        "f".repeat(64),
        vantare_launcher::discovery::Discovery::default(),
    );
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(
            &mut pipe,
            1,
            &Request::LauncherProfilePrepareDuplicate {
                id: document.profiles[0].id.clone(),
                base_revision: revision.clone(),
            },
        )
        .expect("prepare dispatch");
    pipe.set_position(0);
    assert!(matches!(
        frame::Reader::default().next(&mut pipe).expect("frame"),
        Some(HostToUi::Failure {
            error: HostError::Busy,
            ..
        })
    ));
    assert!(session.reserved_profile.is_none());
    assert!(!session.profile_step_keys.is_prepared_duplicate());
    assert_eq!(std::fs::read(&session.launcher).expect("unchanged"), before);
    assert!(session.launcher_reader.discovered(&revision).is_none());
}

fn available_for_duplicate(
    document: &vantare_launcher::Document,
) -> vantare_launcher::discovery::Discovery {
    vantare_launcher::discovery::Discovery {
        apps: document
            .apps
            .iter()
            .map(|app| vantare_launcher::discovery::Detected {
                id: app.id.clone(),
                executable: None,
                availability: vantare_launcher::discovery::Availability {
                    launchable: true,
                    ..Default::default()
                },
            })
            .collect(),
        ..Default::default()
    }
}

#[test]
fn prepared_copy_cannot_be_saved_after_account_change_or_logout() {
    for next in [Some("b".repeat(64)), None] {
        let fixture = Fixture::new();
        let mut session = fixture.session();
        session.current.account_generation = Some("a".repeat(64));
        let document = vantare_launcher::Document::fresh_install();
        let before = serde_json::to_vec(&document).expect("fixture");
        std::fs::write(&session.launcher, &before).expect("fixture");
        let revision = vantare_services::content_hash(&before);
        session.launcher_reader = crate::launcher::Reader::with_discovery(
            session.launcher.clone(),
            revision.clone(),
            available_for_duplicate(&document),
        );
        let mut pipe = Pipe::new(Vec::new());
        session
            .request(
                &mut pipe,
                1,
                &Request::LauncherProfilePrepareDuplicate {
                    id: document.profiles[0].id.clone(),
                    base_revision: revision,
                },
            )
            .expect("prepare dispatch");
        pipe.set_position(0);
        let Some(HostToUi::Response {
            result: crate::protocol::Reply::LauncherProfilePrepareDuplicate { value },
            ..
        }) = frame::Reader::default().next(&mut pipe).expect("frame")
        else {
            panic!("prepared copy")
        };
        assert!(session.profile_step_keys.is_prepared_duplicate());
        assert_eq!(session.reserved_profile, value.draft.id);
        // Prove the draft and discovery would permit a write before invalidation.
        let positive = fixture.0.join("positive-copy.json");
        std::fs::write(&positive, &before).expect("positive fixture");
        crate::launcher::editor::save(
            &positive,
            &value.draft,
            &value.base_revision,
            &available_for_duplicate(&document),
            session.reserved_profile.as_deref(),
            Some(&session.profile_step_keys),
        )
        .expect("valid prepared copy can save");
        assert_ne!(std::fs::read(&positive).expect("saved copy"), before);
        let args = Args {
            controlled: false,
            pipe: String::new(),
            data: fixture.0.join("hub"),
            layout: fixture.0.join("layout.json"),
            launcher: session.launcher.clone(),
            engineer: fixture.0.join("engineer.json"),
        };
        session.core.status = session.current.clone();
        session.core.status.account_generation = next;
        session
            .tick(&args, &mut Pipe::new(Vec::new()), Instant::now(), || false)
            .expect("account change tick");
        assert!(session.reserved_profile.is_none());
        assert!(!session.profile_step_keys.is_prepared_duplicate());
        let mut pipe = Pipe::new(Vec::new());
        session
            .request(
                &mut pipe,
                2,
                &Request::LauncherProfileSave {
                    draft: value.draft,
                    base_revision: value.base_revision,
                },
            )
            .expect("save dispatch");
        pipe.set_position(0);
        assert!(matches!(
            frame::Reader::default().next(&mut pipe).expect("frame"),
            Some(HostToUi::Failure {
                error: HostError::Denied | HostError::Rejected,
                ..
            })
        ));
        assert!(session.reserved_profile.is_none());
        assert!(!session.profile_step_keys.is_prepared_duplicate());
        assert_eq!(std::fs::read(&session.launcher).expect("unchanged"), before);
    }
}

#[test]
fn catalog_dispatch_publishes_the_completed_scan_metadata_without_private_diagnostics() {
    for warnings in [
        None,
        Some(vec![]),
        Some(vec![
            "private D:/Users/example/app.exe --secret-argument".into(),
            "private second diagnostic".into(),
        ]),
    ] {
        let fixture = Fixture::new();
        let mut session = fixture.session();
        let document = vantare_launcher::Document::fresh_install();
        let bytes = serde_json::to_vec(&document).expect("local fixture");
        std::fs::write(&session.launcher, &bytes).expect("fixture bytes");
        let revision = vantare_services::content_hash(&bytes);
        let expected = warnings.as_ref().map(Vec::len);
        session.launcher_reader = if let Some(warnings) = warnings {
            crate::launcher::Reader::with_completed_discovery(
                session.launcher.clone(),
                revision,
                vantare_launcher::discovery::Discovery {
                    warnings,
                    ..Default::default()
                },
                std::time::UNIX_EPOCH + std::time::Duration::from_millis(1_700_000_000_123),
            )
        } else {
            crate::launcher::Reader::with_discovery(
                session.launcher.clone(),
                revision,
                vantare_launcher::discovery::Discovery::default(),
            )
        };
        let mut pipe = Pipe::new(Vec::new());
        session
            .request(&mut pipe, 11, &Request::LauncherCatalog {})
            .expect("real catalog dispatch");
        pipe.set_position(0);
        let reply: HostToUi = frame::Reader::default()
            .next(&mut pipe)
            .expect("frame")
            .expect("reply");
        let encoded = serde_json::to_string(&reply).expect("public wire");
        assert!(!encoded.contains("private") && !encoded.contains("secret-argument"));
        let HostToUi::Response {
            result: crate::protocol::Reply::LauncherCatalog { value },
            ..
        } = reply
        else {
            panic!("catalog reply")
        };
        assert!(!value.scanning);
        if let Some(count) = expected {
            let summary = value
                .last_scan
                .expect("completed scan, including zero warnings");
            assert_eq!(summary.completed_at_ms, "1700000000123");
            assert_eq!(summary.warning_count, count);
        } else {
            assert_eq!(value.last_scan, None);
        }
        assert_eq!(std::fs::read(&session.launcher).expect("no write"), bytes);
        assert_eq!(session.core.requests, 0);
    }
}
