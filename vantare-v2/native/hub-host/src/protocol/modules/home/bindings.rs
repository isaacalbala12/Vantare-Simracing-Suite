use crate::protocol::bindings::{canonical, declare, sample_response};
use crate::protocol::{Event, HostToUi, Reply, Request, Topic, UiToHost};
use std::fmt::Write as _;
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::home::HomeProfile>(&mut text);
    declare::<crate::home::LaunchProgress>(&mut text);
    declare::<crate::home::HomeWidgetKind>(&mut text);
    declare::<crate::home::HomePreviewState>(&mut text);
    declare::<crate::home::HomePreviewWidget>(&mut text);
    declare::<crate::home::HomeLayoutView>(&mut text);
    declare::<crate::home::HomeSim>(&mut text);
    declare::<crate::home::HomeView>(&mut text);
    for (name, value) in [
        (
            "homeCanvasMin",
            serde_json::json!(crate::home::layout::CANVAS_MIN),
        ),
        (
            "homeVersionLimit",
            serde_json::json!(crate::home::layout::VERSION_LIMIT),
        ),
        (
            "homeRevisionPattern",
            serde_json::json!(crate::home::layout::REVISION_PATTERN),
        ),
        (
            "homeNaturalSizes",
            serde_json::Value::Object(
                crate::home::HomeWidgetKind::ALL
                    .into_iter()
                    .map(|kind| {
                        let key = kind.key();
                        let size = crate::widget_defaults::get(&key)
                            .expect("known native kind")
                            .size;
                        (
                            key,
                            serde_json::json!({"w":size.width.round(),"h":size.height.round()}),
                        )
                    })
                    .collect(),
            ),
        ),
        ("homeWatchMs", serde_json::json!(crate::home::WATCH_MS)),
        (
            "homeProgressLimit",
            serde_json::json!(crate::home::PROGRESS_LIMIT),
        ),
        ("homeDateLimit", serde_json::json!(crate::home::DATE_LIMIT)),
        (
            "homeWidgetLimit",
            serde_json::json!(crate::home::layout::WIDGET_LIMIT),
        ),
        (
            "homeCoordinateLimit",
            serde_json::json!(crate::home::layout::COORDINATE_LIMIT),
        ),
        (
            "homeOpacityMax",
            serde_json::json!(crate::home::layout::OPACITY_MAX),
        ),
        (
            "homeWidgetKinds",
            serde_json::json!(crate::home::HomeWidgetKind::ALL),
        ),
    ] {
        let value = canonical(value);
        writeln!(text, "export const {name} = {value} as const;").expect("constants");
    }
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let value = crate::home::HomeView::default();
    let host = vec![
        sample_response(Reply::HomeGet {
            value: value.clone(),
        }),
        HostToUi::Event {
            event: Event::Home { value },
        },
    ];
    let ui = vec![
        UiToHost::Request {
            id: 1,
            request: Request::HomeGet {},
        },
        UiToHost::Subscribe { topic: Topic::Home },
        UiToHost::Unsubscribe { topic: Topic::Home },
    ];
    serde_json::json!({"host":host,"ui":ui})
}
