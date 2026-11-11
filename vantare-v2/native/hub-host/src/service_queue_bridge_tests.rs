//! Service queue integration on the real Core/Session with channel-controlled replies.
//! No services process, real account, timer or sleep.
use super::*;
use vantare_ipc::services_protocol::{
    Command as ServiceCommand, Reply as ServiceReply, pilot_document,
};
#[test]
fn queued_screens_keep_their_own_reply_correlation_and_reject_only_the_extra_intent() {
    let root = Root::new();
    let mut session = restart_session(&root.path, "queue-local-unused");
    let local = session.core.isolate_services(true);
    session
        .request_remote(1, RemoteKind::MailGet, ServiceCommand::MailConsentGet)
        .unwrap();
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (1, ServiceCommand::MailConsentGet)
    ));
    session
        .request_remote(2, RemoteKind::PilotLoad, ServiceCommand::PilotLoad)
        .unwrap();
    assert!(local.incoming.try_recv().is_err());
    assert_eq!(
        session.request_remote(3, RemoteKind::MailGet, ServiceCommand::MailConsentGet),
        Err(HostError::Busy)
    );
    local
        .outgoing
        .send((999, Ok(ServiceReply::Closed)))
        .unwrap();
    local
        .outgoing
        .send((
            1,
            Ok(ServiceReply::MailConsent {
                consent: true,
                locale: None,
                revision: 1,
            }),
        ))
        .unwrap();
    let (id, result) = session.core.reply().unwrap();
    assert_eq!(id, 1);
    assert!(
        matches!(session.service_reply(id,result),Ok(Some(Reply::MailGet{value})) if value.consent)
    );
    assert!(session.remotes.contains_key(&2));
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (2, ServiceCommand::PilotLoad)
    ));
    let state = pilot_document::PilotState {
        profile: pilot_document::PilotProfile {
            public_name: "Piloto QA".into(),
            ..Default::default()
        },
        revision: 4,
        remote_revision: 0,
        pending: false,
    };
    local
        .outgoing
        .send((
            2,
            Ok(ServiceReply::Pilot {
                state,
                message: String::new(),
            }),
        ))
        .unwrap();
    let (id, result) = session.core.reply().unwrap();
    assert_eq!(id, 2);
    assert!(
        matches!(session.service_reply(id,result),Ok(Some(Reply::PilotLoad{value})) if value.fields.public_name=="Piloto QA")
    );
    assert!(session.remotes.is_empty());
    assert!(session.core.reply().is_none());
}
#[test]
fn the_core_dispatches_waiting_commands_in_priority_order_without_replaying() {
    let root = Root::new();
    let mut session = restart_session(&root.path, "queue-local-unused");
    let local = session.core.isolate_services(true);
    session
        .core
        .request_background(1, ServiceCommand::AccountPoll)
        .unwrap();
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (1, ServiceCommand::AccountPoll)
    ));
    session
        .core
        .request_background(2, ServiceCommand::Status)
        .unwrap();
    session.core.request(3, ServiceCommand::PilotLoad).unwrap();
    let mut previous = 1;
    for expected in [3, 2] {
        local
            .outgoing
            .send((previous, Ok(ServiceReply::Closed)))
            .unwrap();
        assert_eq!(session.core.reply().unwrap().0, previous);
        assert_eq!(local.incoming.try_recv().unwrap().0, expected);
        previous = expected;
    }
    local
        .outgoing
        .send((previous, Ok(ServiceReply::Closed)))
        .unwrap();
    assert_eq!(session.core.reply().unwrap().0, previous);
    assert!(local.incoming.try_recv().is_err());
    assert!(session.core.reply().is_none());
}
#[test]
fn a_disconnected_reply_channel_finishes_every_screen_without_dispatching_waiters() {
    let root = Root::new();
    let mut session = restart_session(&root.path, "queue-local-unused");
    let local = session.core.isolate_services(true);
    session
        .request_remote(1, RemoteKind::MailGet, ServiceCommand::MailConsentGet)
        .unwrap();
    assert!(local.incoming.try_recv().is_ok());
    session
        .request_remote(2, RemoteKind::PilotLoad, ServiceCommand::PilotLoad)
        .unwrap();
    drop(local.outgoing);
    for expected in [1, 2] {
        let (id, result) = session.core.reply().unwrap();
        assert_eq!(id, expected);
        assert_eq!(
            session.service_reply(id, result),
            Err(HostError::CoreUnavailable)
        );
    }
    assert!(session.remotes.is_empty());
    assert!(local.incoming.try_recv().is_err());
    assert!(session.core.reply().is_none());
}

fn deliver(local: &crate::core::TestServices, id: u32, reply: ServiceReply) {
    local.outgoing.send((id, Ok(reply))).unwrap();
}
#[test]
fn another_screen_can_finish_between_import_load_and_save_without_an_early_archive() {
    let root = Root::new();
    let path = root.path.join("testing-center/editor-draft.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path,br#"{"version":1,"fields":{"module":"hub","actionText":"old","expectedText":"","observedText":"","contextText":""}}"#).unwrap();
    let mut session = restart_session(&root.path, "queue-local-unused");
    let local = session.core.isolate_services(true);
    session.current.access.verified = true;
    session.current.services = protocol::LinkState::Connected;
    let (name, stop, _listener, mut pipe) = endpoint();
    let _peer = connect(&name, stop, Duration::from_secs(5)).unwrap();
    pipe.accept().unwrap();
    session
        .testing_request(&mut pipe, 7, &Request::DraftLoad {})
        .unwrap();
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (7, ServiceCommand::DraftLoad)
    ));
    session
        .request_remote(9, RemoteKind::MailGet, ServiceCommand::MailConsentGet)
        .unwrap();
    deliver(
        &local,
        7,
        ServiceReply::Draft {
            draft: None,
            message: String::new(),
        },
    );
    let (id, result) = session.core.reply().unwrap();
    // Mail is now active; a third screen occupies the external user slot.
    // Import must retain a separate continuation slot rather than fail Busy.
    session
        .request_remote(10, RemoteKind::PilotLoad, ServiceCommand::PilotLoad)
        .unwrap();
    assert_eq!(session.service_reply(id, result), Ok(None));
    assert!(path.exists() && !path.with_extension("json.imported").exists());
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (9, ServiceCommand::MailConsentGet)
    ));
    assert_eq!(session.deferred.map(|(id, _)| id), Some(7));
    deliver(
        &local,
        9,
        ServiceReply::MailConsent {
            consent: true,
            locale: None,
            revision: 1,
        },
    );
    let (id, result) = session.core.reply().unwrap();
    assert!(matches!(
        session.service_reply(id, result),
        Ok(Some(Reply::MailGet { .. }))
    ));
    assert_eq!(session.deferred.map(|(id, _)| id), Some(7));
    let (id, ServiceCommand::DraftSave { fields }) = local.incoming.try_recv().unwrap() else {
        panic!("the import save must follow the mail response");
    };
    assert_eq!(id, 7);
    assert_eq!(fields.action_text, "old");
    assert!(path.exists() && !path.with_extension("json.imported").exists());
    deliver(
        &local,
        7,
        ServiceReply::Draft {
            draft: Some(vantare_ipc::services_protocol::report_document::Draft {
                schema_version: 1,
                idempotency_key: "queue-qa".into(),
                fields,
                screenshots: vec![],
            }),
            message: String::new(),
        },
    );
    let (id, result) = session.core.reply().unwrap();
    assert!(
        matches!(session.service_reply(id,result),Ok(Some(Reply::DraftLoad{value})) if value.legacy==crate::testing::LegacyMigration::Imported)
    );
    assert!(session.deferred.is_none() && session.remotes.contains_key(&10));
    assert!(!path.exists() && path.with_extension("json.imported").exists());
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (10, ServiceCommand::PilotLoad)
    ));
    local
        .outgoing
        .send((10, Err(HostError::CoreUnavailable)))
        .unwrap();
    let (id, result) = session.core.reply().unwrap();
    assert_eq!(
        session.service_reply(id, result),
        Err(HostError::CoreUnavailable)
    );
    assert!(session.remotes.is_empty());
}

#[test]
fn an_identical_operation_is_busy_while_active_even_with_a_free_waiting_slot() {
    let root = Root::new();
    let mut session = restart_session(&root.path, "queue-local-unused");
    let local = session.core.isolate_services(true);
    session
        .request_remote(
            1,
            RemoteKind::MailSet,
            ServiceCommand::MailConsentSet {
                consent: true,
                source: vantare_ipc::services_protocol::MailSource::Settings,
            },
        )
        .unwrap();
    assert!(local.incoming.try_recv().is_ok());
    assert_eq!(
        session.request_remote(
            2,
            RemoteKind::MailSet,
            ServiceCommand::MailConsentSet {
                consent: false,
                source: vantare_ipc::services_protocol::MailSource::Settings
            }
        ),
        Err(HostError::Busy)
    );
    assert!(local.incoming.try_recv().is_err());
    session
        .request_remote(3, RemoteKind::PilotLoad, ServiceCommand::PilotLoad)
        .unwrap();
    assert!(session.remotes.contains_key(&3));
}
#[test]
fn an_expired_core_waiter_is_never_sent_and_its_owner_receives_busy() {
    let root = Root::new();
    let mut session = restart_session(&root.path, "queue-local-unused");
    let local = session.core.isolate_services(true);
    let now = Instant::now();
    session
        .core
        .request_at(1, ServiceCommand::Probe, now)
        .unwrap();
    assert!(local.incoming.try_recv().is_ok());
    session
        .request_remote_at(
            2,
            RemoteKind::MailSet,
            ServiceCommand::MailConsentSet {
                consent: true,
                source: vantare_ipc::services_protocol::MailSource::Settings,
            },
            now,
        )
        .unwrap();
    local.outgoing.send((1, Ok(ServiceReply::Closed))).unwrap();
    assert_eq!(
        session
            .core
            .reply_at(now + Duration::from_secs(15))
            .unwrap()
            .0,
        1
    );
    let (id, result) = session
        .core
        .reply_at(now + Duration::from_secs(15))
        .unwrap();
    assert_eq!(id, 2);
    assert_eq!(session.service_reply(id, result), Err(HostError::Busy));
    assert!(local.incoming.try_recv().is_err());
    assert!(!session.remotes.contains_key(&2));
}
#[test]
fn a_confirmed_session_change_rejects_a_waiting_intent_without_sending_it() {
    use vantare_ipc::services_protocol::Session as Identity;
    let root = Root::new();
    let mut session = restart_session(&root.path, "queue-local-unused");
    let local = session.core.isolate_services(true);
    for (id, identity) in [(1, Identity::SignedIn), (2, Identity::SignedOut)] {
        session
            .core
            .request(id, ServiceCommand::AccountPoll)
            .unwrap();
        assert!(matches!(
            local.incoming.try_recv().unwrap(),
            (_, ServiceCommand::AccountPoll)
        ));
        if id == 2 {
            session
                .request_remote(
                    3,
                    RemoteKind::MailSet,
                    ServiceCommand::MailConsentSet {
                        consent: true,
                        source: vantare_ipc::services_protocol::MailSource::Settings,
                    },
                )
                .unwrap();
        }
        local
            .outgoing
            .send((
                id,
                Ok(ServiceReply::Account {
                    session: identity,
                    copy_link: false,
                    signed_in: identity == Identity::SignedIn,
                    profile: None,
                    expires_at: None,
                    pending: false,
                    message: String::new(),
                    error: None,
                }),
            ))
            .unwrap();
        assert_eq!(session.core.reply().unwrap().0, id);
    }
    let (id, result) = session.core.reply().unwrap();
    assert_eq!(id, 3);
    assert_eq!(session.service_reply(id, result), Err(HostError::Denied));
    assert!(local.incoming.try_recv().is_err());
}
#[test]
fn logout_and_authority_changes_deny_waiting_effects_but_never_discard_logout() {
    let root = Root::new();
    let mut session = restart_session(&root.path, "queue-local-unused");
    let local = session.core.isolate_services(true);
    session.core.request(1, ServiceCommand::Probe).unwrap();
    assert!(local.incoming.try_recv().is_ok());
    session
        .request_remote(
            2,
            RemoteKind::MailSet,
            ServiceCommand::MailConsentSet {
                consent: true,
                source: vantare_ipc::services_protocol::MailSource::Settings,
            },
        )
        .unwrap();
    session
        .core
        .observe_authority(1, 1, protocol::AccessView::default());
    session
        .core
        .observe_authority(1, 2, protocol::AccessView::default());
    let (id, result) = session.core.reply().unwrap();
    assert_eq!(id, 2);
    assert_eq!(session.service_reply(id, result), Err(HostError::Denied));
    session
        .request_remote(3, RemoteKind::PilotLoad, ServiceCommand::PilotLoad)
        .unwrap();
    session.core.request(4, ServiceCommand::Logout).unwrap();
    let (id, result) = session.core.reply().unwrap();
    assert_eq!(id, 3);
    assert_eq!(session.service_reply(id, result), Err(HostError::Denied));
    session
        .core
        .observe_authority(2, 1, protocol::AccessView::default());
    local.outgoing.send((1, Ok(ServiceReply::Closed))).unwrap();
    assert_eq!(session.core.reply().unwrap().0, 1);
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (4, ServiceCommand::Logout)
    ));
    assert!(local.incoming.try_recv().is_err());
}
#[test]
fn cancelling_a_real_core_import_waiter_prevents_its_save_and_preserves_the_legacy_file() {
    let root = Root::new();
    let path = root.path.join("testing-center/editor-draft.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path,br#"{"version":1,"fields":{"module":"hub","actionText":"old","expectedText":"","observedText":"","contextText":""}}"#).unwrap();
    let mut session = restart_session(&root.path, "queue-local-unused");
    let local = session.core.isolate_services(true);
    session.current.access.verified = true;
    session.current.services = protocol::LinkState::Connected;
    let (name, stop, _listener, mut pipe) = endpoint();
    let _peer = connect(&name, stop, Duration::from_secs(5)).unwrap();
    pipe.accept().unwrap();
    session
        .testing_request(&mut pipe, 7, &Request::DraftLoad {})
        .unwrap();
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (7, ServiceCommand::DraftLoad)
    ));
    session
        .request_remote(9, RemoteKind::MailGet, ServiceCommand::MailConsentGet)
        .unwrap();
    local
        .outgoing
        .send((
            7,
            Ok(ServiceReply::Draft {
                draft: None,
                message: String::new(),
            }),
        ))
        .unwrap();
    let (id, result) = session.core.reply().unwrap();
    assert_eq!(session.service_reply(id, result), Ok(None));
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (9, ServiceCommand::MailConsentGet)
    ));
    session.cancel_deferred(&mut pipe).unwrap();
    let (id, result) = session.core.reply().unwrap();
    assert_eq!(id, 7);
    assert_eq!(session.service_reply(id, result), Ok(None));
    local
        .outgoing
        .send((
            9,
            Ok(ServiceReply::MailConsent {
                consent: false,
                locale: None,
                revision: 1,
            }),
        ))
        .unwrap();
    let (id, result) = session.core.reply().unwrap();
    assert!(matches!(
        session.service_reply(id, result),
        Ok(Some(Reply::MailGet { .. }))
    ));
    assert!(local.incoming.try_recv().is_err());
    assert!(path.exists() && !path.with_extension("json.imported").exists());
    assert!(session.abandoned_deferred.is_empty());
}
