use crate::protocol::bindings::{declare, sample_response};
use crate::protocol::{HostError, HostToUi, Reply, Request, UiToHost};
use crate::strategy::{
    ID_LIMIT, StrategyEventSummary, StrategyFields, StrategyState, StrategyVariant, StrategyView,
    TEXT_LIMIT,
};
use serde_json::json;

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<StrategyState>(&mut text);
    declare::<StrategyVariant>(&mut text);
    declare::<StrategyEventSummary>(&mut text);
    declare::<StrategyView>(&mut text);
    declare::<StrategyFields>(&mut text);
    crate::protocol::bindings::constants!(
        &mut text,
        "strategyLimits",
        json!({"id":ID_LIMIT,"text":TEXT_LIMIT})
    );
    crate::protocol::bindings::constants!(
        &mut text,
        "strategyStates",
        [
            StrategyState::Ready,
            StrategyState::Empty,
            StrategyState::Recovered,
            StrategyState::Protected,
            StrategyState::ImportedLegacy
        ]
    );
    text
}
fn ready_sample() -> StrategyView {
    StrategyView {
        revision: "a".repeat(64),
        state: StrategyState::Ready,
        events: vec![StrategyEventSummary {
            id: "event-1".into(),
            name: "Practice".into(),
            class: "GT3".into(),
            track: "Fuji".into(),
            drivers: 1,
            strategies: vec![
                StrategyVariant {
                    id: "variant-1".into(),
                    name: "Base".into(),
                },
                StrategyVariant {
                    id: "variant-2".into(),
                    name: "Alternative".into(),
                },
            ],
        }],
        active_event_id: Some("event-1".into()),
        active_strategy_id: Some("variant-1".into()),
        dirty: false,
    }
}

pub(crate) fn corpus() -> serde_json::Value {
    let ready = ready_sample();
    let mut empty = StrategyView {
        revision: vantare_services::content_hash(b""),
        state: StrategyState::Empty,
        events: vec![],
        active_event_id: None,
        active_strategy_id: None,
        dirty: false,
    };
    let mut host = vec![sample_response(Reply::StrategyOpen {
        value: ready.clone(),
    })];
    for state in [
        StrategyState::Empty,
        StrategyState::Recovered,
        StrategyState::Protected,
        StrategyState::ImportedLegacy,
    ] {
        empty.state = state;
        host.push(sample_response(Reply::StrategyOpen {
            value: empty.clone(),
        }));
    }
    let dirty = StrategyView {
        revision: "b".repeat(64),
        dirty: true,
        ..ready.clone()
    };
    host.extend([
        sample_response(Reply::StrategyView {
            value: ready.clone(),
        }),
        sample_response(Reply::StrategySelect {
            value: ready.clone(),
        }),
        sample_response(Reply::StrategyCreate {
            value: dirty.clone(),
        }),
        sample_response(Reply::StrategyConfirm {
            value: dirty.clone(),
        }),
        sample_response(Reply::StrategySave {
            value: ready.clone(),
        }),
        sample_response(Reply::StrategyDiscard {
            value: ready.clone(),
        }),
    ]);
    host.extend(
        [
            HostError::StrategyConflict { current: ready },
            HostError::StrategyDirty,
            HostError::StrategyImportFailed,
            HostError::StrategyInvalidText,
        ]
        .map(|error| HostToUi::Failure { id: 1, error }),
    );
    let fields = StrategyFields {
        name: "Practice".into(),
        duration_minutes: "90".into(),
        fuel_capacity_liters: "82".into(),
        pit_transit_seconds: "25".into(),
        track: "Fuji".into(),
        class: "GT3".into(),
        variant_name: "Base".into(),
        variant_mode: "dry".into(),
        driver_name: "Pilot".into(),
        driver_initials: "PI".into(),
        ..StrategyFields::default()
    };
    let ui = [
        Request::StrategyOpen {},
        Request::StrategyView {},
        Request::StrategySelect {
            event_id: "event-1".into(),
            strategy_id: "variant-2".into(),
            revision: "a".repeat(64),
        },
        Request::StrategyCreate {
            revision: "a".repeat(64),
            fields: Box::new(fields.clone()),
            base_pace_seconds: Some("90.472".into()),
            fuel_per_lap_liters: Some("1.83".into()),
        },
        Request::StrategyConfirm {
            event_id: "event-1".into(),
            strategy_id: "variant-1".into(),
            revision: "b".repeat(64),
            fields: Box::new(fields),
        },
        Request::StrategySave {
            revision: "b".repeat(64),
        },
        Request::StrategyDiscard {
            revision: "b".repeat(64),
        },
    ]
    .map(|request| UiToHost::Request { id: 1, request });
    json!({"host":host,"ui":ui})
}
