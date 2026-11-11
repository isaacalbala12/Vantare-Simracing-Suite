use super::*;
fn call(session: &mut Session, request: &Request) -> HostToUi {
    let mut pipe = Pipe::new(Vec::new());
    session.request(&mut pipe, 17, request).unwrap();
    pipe.set_position(0);
    frame::Reader::default().next(&mut pipe).unwrap().unwrap()
}
#[test]
fn finish_and_private_escape_are_denied_without_confirmed_consent_or_failed_write() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    for request in [
        Request::OnboardingSkipPrivate {},
        Request::OnboardingFinish {
            kit: vec![crate::onboarding::WidgetKind::Delta],
            level: crate::settings::track::PerformanceLevel::Balanced,
            show: false,
            base_revision: session.settings.view().revision,
            layout_revision: None,
        },
    ] {
        assert_eq!(
            call(&mut session, &request),
            HostToUi::Failure {
                id: 17,
                error: HostError::Denied
            }
        );
    }
}
#[test]
fn stale_privacy_revision_does_not_arm_escape_through_the_real_dispatch() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    assert!(matches!(
        call(
            &mut session,
            &Request::PrivacyUpdate {
                patch: crate::privacy::PrivacyPatch::Usage(true),
                base_revision: "bad".into(),
            }
        ),
        HostToUi::Failure {
            error: HostError::PrivacyConflict { .. },
            ..
        }
    ));
    assert_eq!(
        call(&mut session, &Request::OnboardingSkipPrivate {}),
        HostToUi::Failure {
            id: 17,
            error: HostError::Denied
        }
    );
}
#[test]
fn protected_privacy_write_arms_escape_but_cannot_hide_unreadable_disk() {
    let fixture = Fixture::new();
    std::fs::write(fixture.0.join("privacy.json"), b"corrupt").unwrap();
    let mut session = fixture.session();
    let revision = session.privacy.view().revision;
    assert_eq!(
        call(
            &mut session,
            &Request::PrivacyUpdate {
                patch: crate::privacy::PrivacyPatch::Usage(false),
                base_revision: revision,
            }
        ),
        HostToUi::Failure {
            id: 17,
            error: HostError::Protected
        }
    );
    assert!(session.onboarding.private.can_skip(true));
    assert_eq!(
        call(&mut session, &Request::OnboardingSkipPrivate {}),
        HostToUi::Failure {
            id: 17,
            error: HostError::Denied
        }
    );
    assert!(!session.privacy.private_active());
}

#[test]
fn durable_privacy_cleanup_failure_never_arms_escape() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    std::fs::create_dir(fixture.0.join("anonymous-id")).unwrap();
    let revision = session.privacy.view().revision;
    assert!(matches!(call(&mut session, &Request::PrivacyUpdate {
        patch: crate::privacy::PrivacyPatch::Crashes(true), base_revision: revision,
    }), HostToUi::Failure { error: HostError::PrivacyCleanup { current }, .. } if current.crashes));
    assert!(!session.onboarding.private.can_skip(true));
    assert_eq!(
        call(&mut session, &Request::OnboardingSkipPrivate {}),
        HostToUi::Failure {
            id: 17,
            error: HostError::Denied
        }
    );
    assert!(
        vantare_services::diagnostics::Privacy::load(&fixture.0)
            .unwrap()
            .crashes
    );
}
#[test]
fn busy_write_allows_escape_only_while_disk_permissions_are_off() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let lock = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(fixture.0.join("consent.lock"))
        .unwrap();
    lock.try_lock().unwrap();
    let revision = session.privacy.view().revision;
    assert_eq!(
        call(
            &mut session,
            &Request::PrivacyUpdate {
                patch: crate::privacy::PrivacyPatch::Usage(true),
                base_revision: revision,
            }
        ),
        HostToUi::Failure {
            id: 17,
            error: HostError::Busy
        }
    );
    assert!(session.onboarding.private.can_skip(true));
    assert_eq!(
        call(&mut session, &Request::OnboardingSkipPrivate {}),
        HostToUi::Response {
            id: 17,
            result: Reply::OnboardingSkipPrivate { accepted: true }
        }
    );
    drop(lock);
    assert!(
        !vantare_services::diagnostics::Privacy::load(&fixture.0)
            .unwrap()
            .usage
    );
}
#[cfg(windows)]
#[test]
fn unusable_layout_finishes_without_rewriting_and_repaired_layout_returns_fresh_conflict() {
    for bytes in [
        None,
        Some(b"broken".to_vec()),
        Some(br#"{"version":999,"instances":[]}"#.to_vec()),
        Some(vec![b' '; 1024 * 1024 + 1]),
    ] {
        let fixture = Fixture::new();
        let mut session = fixture.session();
        for patch in [
            crate::privacy::PrivacyPatch::Crashes(false),
            crate::privacy::PrivacyPatch::Usage(false),
        ] {
            let revision = session.privacy.view().revision;
            assert!(matches!(
                call(
                    &mut session,
                    &Request::PrivacyUpdate {
                        patch,
                        base_revision: revision
                    }
                ),
                HostToUi::Response { .. }
            ));
        }
        let path = session.onboarding.layout.clone();
        if let Some(bytes) = &bytes {
            std::fs::write(&path, bytes).unwrap();
        }
        let reply = call(&mut session, &Request::OnboardingGet {});
        let HostToUi::Response {
            result: Reply::OnboardingGet { value },
            ..
        } = reply
        else {
            panic!("view");
        };
        assert!(!value.layout_ready);
        assert!(value.layout_revision.is_none());
        let request = Request::OnboardingFinish {
            kit: vec![crate::onboarding::WidgetKind::Delta],
            level: crate::settings::track::PerformanceLevel::Balanced,
            show: true,
            base_revision: value.settings_revision,
            layout_revision: None,
        };
        std::fs::write(&path, br#"{"version":2,"instances":[]}"#).unwrap();
        assert!(
            matches!(call(&mut session, &request), HostToUi::Failure { error: HostError::OnboardingConflict { current }, .. } if current.layout_ready && current.layout_revision.is_some())
        );
        if let Some(bytes) = &bytes {
            std::fs::write(&path, bytes).unwrap();
        } else {
            std::fs::remove_file(&path).unwrap();
        }
        assert!(
            matches!(call(&mut session, &request), HostToUi::Response { result: Reply::OnboardingFinish { value }, .. } if !value.pending)
        );
        assert_eq!(std::fs::read(&path).ok(), bytes);
        assert!(!path.with_extension("show.json").exists());
    }
}

#[cfg(windows)]
#[test]
fn io_failure_arms_escape_but_existing_disk_opt_in_still_denies_it() {
    use std::os::windows::fs::OpenOptionsExt;
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let revision = session.privacy.view().revision;
    session
        .privacy
        .update(crate::privacy::PrivacyPatch::Crashes(true), &revision)
        .unwrap();
    let guard = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(fixture.0.join("privacy.json"))
        .unwrap();
    let revision = session.privacy.view().revision;
    assert_eq!(
        call(
            &mut session,
            &Request::PrivacyUpdate {
                patch: crate::privacy::PrivacyPatch::Crashes(false),
                base_revision: revision
            }
        ),
        HostToUi::Failure {
            id: 17,
            error: HostError::Io
        }
    );
    assert!(session.onboarding.private.can_skip(true));
    assert_eq!(
        call(&mut session, &Request::OnboardingSkipPrivate {}),
        HostToUi::Failure {
            id: 17,
            error: HostError::Denied
        }
    );
    assert!(session.privacy.view().crashes);
    drop(guard);
}
