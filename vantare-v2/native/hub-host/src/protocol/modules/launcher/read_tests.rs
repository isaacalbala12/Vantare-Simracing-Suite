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
