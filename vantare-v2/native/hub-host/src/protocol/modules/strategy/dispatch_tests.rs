#![allow(clippy::unwrap_used)]
use super::*;

fn request(session: &mut Session, request: &Request) -> HostToUi {
    let mut pipe = Pipe::new(Vec::new());
    session.request(&mut pipe, 9, request).unwrap();
    let mut reader = frame::Reader::default();
    let mut pipe = Pipe::new(pipe.into_inner());
    loop {
        if let Some(message) = reader.next(&mut pipe).unwrap() {
            return message;
        }
    }
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

fn large_strategy_document(event_count: usize, variant_count: usize) -> Vec<u8> {
    use crate::strategy::{ID_LIMIT, TEXT_LIMIT};
    use vantare_strategy::document::new_event;

    let id = |index: usize| {
        let suffix = index.to_string();
        format!("{}{suffix}", "\"".repeat(ID_LIMIT - suffix.len()))
    };
    let name = "\"".repeat(TEXT_LIMIT);
    let events: Vec<_> = (0..event_count)
        .map(|index| {
            let mut event = new_event(&id(index), &name, 90, 90.0, 18.0);
            event["cls"]["value"] = name.clone().into();
            event["track"]["value"] = name.clone().into();
            let variants: Vec<_> = (0..variant_count)
                .map(|index| {
                    let mut variant = event["strategies"][0].clone();
                    variant["id"] = id(index).into();
                    variant["name"]["value"] = name.clone().into();
                    variant
                })
                .collect();
            event["strategies"] = variants.into();
            event["activeStrategyId"] = id(0).into();
            event
        })
        .collect();
    serde_json::to_vec(&serde_json::json!({
        "contractVersion": "strategy.v2",
        "schemaVersion": "2.1.0",
        "generatedAt": "2026-11-18T00:00:00Z",
        "events": events,
        "activeEventId": id(0),
    }))
    .unwrap()
}

#[test]
fn strategy_bounds_event_and_variant_projections_before_opening() {
    use crate::strategy::StrategyState;
    use vantare_strategy::document::Document;

    let fixture = Fixture::new();
    let mut session = fixture.session();
    let data = fixture.0.join("hub");
    std::fs::create_dir_all(&data).unwrap();
    let path = data.join("strategy-v2.json");
    session.current.access.verified = true;
    let maximum = large_strategy_document(32, 16);
    std::fs::write(&path, &maximum).unwrap();
    let response = request(&mut session, &Request::StrategyOpen {});
    assert!(serde_json::to_vec(&response).unwrap().len() < frame::LIMIT - 64 * 1024);
    assert!(matches!(
        response,
        HostToUi::Response { result: Reply::StrategyOpen { value }, .. }
            if value.state == StrategyState::Ready
                && value.events.len() == 32
                && value.events.iter().all(|event| event.strategies.len() == 16)
    ));

    for (events, variants) in [(33, 1), (1, 17)] {
        let oversized = large_strategy_document(events, variants);
        Document::parse(&oversized).unwrap();
        std::fs::write(&path, &oversized).unwrap();
        assert_eq!(
            request(&mut session, &Request::StrategyOpen {}),
            HostToUi::Failure {
                id: 9,
                error: HostError::Protected
            },
        );
        assert!(matches!(
            request(&mut session, &Request::StrategyView {}),
            HostToUi::Response { result: Reply::StrategyView { value }, .. }
                if value.state == StrategyState::Protected && value.events.is_empty()
        ));
        assert_eq!(std::fs::read(&path).unwrap(), oversized);
        assert!(!data.join("strategy-v2.json.invalid").exists());
    }
}
