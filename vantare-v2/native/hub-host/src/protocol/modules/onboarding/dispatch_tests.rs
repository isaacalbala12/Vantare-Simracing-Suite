use super::*;
fn call(session: &mut Session, request: Request) -> HostToUi {
    let mut pipe = Pipe::new(Vec::new());
    session.request(&mut pipe, 17, &request).unwrap();
    pipe.set_position(0);
    frame::Reader::default().next(&mut pipe).unwrap().unwrap()
}
#[test]
fn finish_and_private_escape_are_denied_without_confirmed_consent_or_failed_write() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    for request in [Request::OnboardingSkipPrivate {}, Request::OnboardingFinish {
        kit: vec![crate::onboarding::WidgetKind::Delta], level: crate::settings::track::PerformanceLevel::Balanced,
        show: false, base_revision: session.settings.view().revision, layout_revision: None,
    }] {
        assert_eq!(call(&mut session, request), HostToUi::Failure { id: 17, error: HostError::Denied });
    }
}
#[test]
fn stale_privacy_revision_does_not_arm_escape_through_the_real_dispatch() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    assert!(matches!(call(&mut session, Request::PrivacyUpdate {
        patch: crate::privacy::PrivacyPatch::Usage(true), base_revision: "bad".into(),
    }), HostToUi::Failure { error: HostError::PrivacyConflict { .. }, .. }));
    assert_eq!(call(&mut session, Request::OnboardingSkipPrivate {}), HostToUi::Failure { id: 17, error: HostError::Denied });
}
#[test]
fn protected_privacy_write_arms_escape_but_cannot_hide_unreadable_disk() {
    let fixture = Fixture::new();
    std::fs::write(fixture.0.join("privacy.json"), b"corrupt").unwrap();
    let mut session = fixture.session();
    let revision = session.privacy.view().revision;
    assert_eq!(call(&mut session, Request::PrivacyUpdate {
        patch: crate::privacy::PrivacyPatch::Usage(false), base_revision: revision,
    }), HostToUi::Failure { id: 17, error: HostError::Protected });
    assert!(session.onboarding.private.can_skip(true));
    assert_eq!(call(&mut session, Request::OnboardingSkipPrivate {}), HostToUi::Failure { id: 17, error: HostError::Denied });
    assert!(!session.privacy.private_active());
}
