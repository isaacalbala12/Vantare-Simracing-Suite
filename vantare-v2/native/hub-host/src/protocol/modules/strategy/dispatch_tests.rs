#![allow(clippy::unwrap_used)]
use super::*;

fn request(session: &mut Session, request: &Request) -> HostToUi {
    let mut pipe = Pipe::new(Vec::new());
    session.request(&mut pipe, 9, request).unwrap();
    frame::Reader::default()
        .next(&mut Pipe::new(pipe.into_inner()))
        .unwrap()
        .unwrap()
}
#[test]
fn strategy_requires_verified_access_but_neither_live_nor_strategy_entitlement() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let data = fixture.0.join("hub");
    std::fs::create_dir_all(&data).unwrap();
    let source = data.join("strategy-v2.json");
    std::fs::write(&source, b"{invalid").unwrap();
    let denied = HostToUi::Failure {
        id: 9,
        error: HostError::Denied,
    };
    assert_eq!(request(&mut session, &Request::StrategyOpen {}), denied);
    assert!(!data.join("strategy-v2.json.invalid").exists());
    session.current.access.verified = true;
    session.current.access.blocked = true;
    assert_eq!(request(&mut session, &Request::StrategyOpen {}), denied);
    session.current.access.blocked = false;
    session.current.live = true;
    session.current.account_generation = Some("a".repeat(64));
    assert!(matches!(request(&mut session, &Request::StrategyOpen {}),
        HostToUi::Response { result: Reply::StrategyOpen { value }, .. } if value.state == crate::strategy::StrategyState::Recovered));
    assert_eq!(session.core.requests, 0);
}

#[test]
fn a_late_selection_for_a_previous_account_cannot_write_or_reply_with_cached_data() {
    use vantare_strategy::document::{Document, new_event};
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let data = fixture.0.join("hub");
    std::fs::create_dir_all(&data).unwrap();
    let path = data.join("strategy-v2.json");
    let mut doc = Document::empty("2026-11-18T00:00:00Z").unwrap();
    doc.append_event(&new_event("event-1", "Practice", 90, 90.0, 18.0))
        .unwrap();
    std::fs::write(&path, doc.bytes()).unwrap();
    session.current.access.verified = true;
    session.current.account_generation = Some("a".repeat(64));
    let HostToUi::Response {
        result: Reply::StrategyOpen { value },
        ..
    } = request(&mut session, &Request::StrategyOpen {})
    else {
        panic!("opened");
    };
    let late = Request::StrategySelect {
        event_id: "event-1".into(),
        strategy_id: "variant-1".into(),
        revision: value.revision,
    };
    session.current.account_generation = Some("b".repeat(64));
    assert_eq!(
        request(&mut session, &late),
        HostToUi::Failure {
            id: 9,
            error: HostError::Denied
        }
    );
    assert_eq!(std::fs::read(&path).unwrap(), doc.bytes());
    assert!(matches!(request(&mut session, &Request::StrategyView {}),
        HostToUi::Response { result: Reply::StrategyView { value }, .. } if value.events.is_empty()));
    assert_eq!(session.core.requests, 0);
}
