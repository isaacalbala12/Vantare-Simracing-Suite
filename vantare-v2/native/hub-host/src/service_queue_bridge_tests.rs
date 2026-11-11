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
        .request(1, ServiceCommand::AccountPoll)
        .unwrap();
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (1, ServiceCommand::AccountPoll)
    ));
    for (id, command) in [
        (2, ServiceCommand::Status),
        (3, ServiceCommand::PilotLoad),
        (4, ServiceCommand::AccountCancel),
        (5, ServiceCommand::Logout),
    ] {
        session.core.request(id, command).unwrap();
    }
    let mut previous = 1;
    for expected in [5, 4, 3, 2] {
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
