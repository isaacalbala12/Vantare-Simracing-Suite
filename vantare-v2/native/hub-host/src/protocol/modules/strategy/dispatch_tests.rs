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
    assert_eq!(
        request(&mut session, &Request::StrategyView {}),
        HostToUi::Failure {
            id: 9,
            error: HostError::Denied
        }
    );
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
                && value.events.iter().all(|event| {
                    use crate::strategy::{ID_LIMIT, TEXT_LIMIT};
                    event.id.len() == ID_LIMIT
                        && event.name.len() == TEXT_LIMIT
                        && event.class.len() == TEXT_LIMIT
                        && event.track.len() == TEXT_LIMIT
                        && event.strategies.len() == 16
                        && event.strategies.iter().all(|variant| {
                            variant.id.len() == ID_LIMIT && variant.name.len() == TEXT_LIMIT
                        })
                })
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

fn open_strategy(session: &mut Session) -> crate::strategy::StrategyView {
    session.current.access.verified = true;
    let HostToUi::Response {
        result: Reply::StrategyOpen { value },
        ..
    } = request(session, &Request::StrategyOpen {})
    else {
        panic!("open Strategy");
    };
    value
}

fn create_strategy(
    session: &mut Session,
    revision: &str,
    name: &str,
) -> crate::strategy::StrategyView {
    let HostToUi::Response {
        result: Reply::StrategyCreate { value },
        ..
    } = request(
        session,
        &Request::StrategyCreate {
            revision: revision.into(),
            fields: Box::new(crate::strategy::StrategyFields {
                name: name.into(),
                duration_minutes: "90".into(),
                fuel_capacity_liters: "82".into(),
                pit_transit_seconds: "25".into(),
                ..Default::default()
            }),
            base_pace_seconds: None,
            fuel_per_lap_liters: None,
        },
    )
    else {
        panic!("create Strategy draft");
    };
    assert!(value.dirty);
    value
}

#[test]
fn strategy_host_restart_loads_only_the_saved_document_as_clean() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let empty = open_strategy(&mut session);
    let first = create_strategy(&mut session, &empty.revision, "Saved");
    let HostToUi::Response {
        result: Reply::StrategySave { value: saved },
        ..
    } = request(
        &mut session,
        &Request::StrategySave {
            revision: first.revision,
        },
    )
    else {
        panic!("save first Strategy draft");
    };
    assert!(!saved.dirty);
    assert_eq!(saved.events.len(), 1);
    assert_eq!(saved.events[0].name, "Saved");

    let temporary = create_strategy(&mut session, &saved.revision, "Unsaved");
    assert_eq!(temporary.events.len(), 2);
    assert_eq!(temporary.events[1].name, "Unsaved");
    drop(session);

    let reopened = open_strategy(&mut fixture.session());
    assert_eq!(reopened, saved);
    assert!(!reopened.dirty);
}

#[test]
fn strategy_save_creates_the_primary_only_under_the_host_data_dir() {
    use serde_json::json;

    let fixture = Fixture::new();
    let mut session = fixture.session();
    let empty = open_strategy(&mut session);
    let draft = create_strategy(&mut session, &empty.revision, "Saved");
    let data_dir = fixture.0.join("hub");
    let primary = data_dir.join("strategy-v2.json");
    let outside = fixture.0.join("strategy-v2.json");
    assert!(!primary.exists());

    let save = json!({
        "kind": "request",
        "id": 9,
        "request": { "method": "strategy.save", "revision": draft.revision },
    });
    for field in ["path", "dataDir", "destination"] {
        let mut invalid = save.clone();
        invalid["request"][field] = json!(outside.to_string_lossy());
        assert!(
            serde_json::from_value::<UiToHost>(invalid).is_err(),
            "{field}"
        );
    }
    assert!(!primary.exists());
    assert!(!outside.exists());

    let UiToHost::Request { request: save, .. } = serde_json::from_value(save).unwrap() else {
        panic!("save request decoded");
    };
    assert!(matches!(
        request(&mut session, &save),
        HostToUi::Response { result: Reply::StrategySave { value }, .. } if !value.dirty
    ));
    let written = std::fs::read(&primary).unwrap();
    let doc = vantare_strategy::document::Document::parse(&written).unwrap();
    assert_eq!(doc.value()["events"][0]["name"]["value"], "Saved");
    assert!(!outside.exists());
}

#[test]
fn switching_account_generation_clears_a_dirty_strategy_at_dispatch() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    session.current.account_generation = Some("a".repeat(64));
    let empty = open_strategy(&mut session);
    let draft = create_strategy(&mut session, &empty.revision, "Account A only");

    session.current.account_generation = Some("b".repeat(64));
    let denied = HostToUi::Failure {
        id: 9,
        error: HostError::Denied,
    };
    assert_eq!(request(&mut session, &Request::StrategyView {}), denied);
    assert_eq!(
        request(
            &mut session,
            &Request::StrategySave {
                revision: draft.revision
            }
        ),
        denied
    );
    assert_eq!(open_strategy(&mut session), empty);
    assert!(!fixture.0.join("hub/strategy-v2.json").exists());
}
