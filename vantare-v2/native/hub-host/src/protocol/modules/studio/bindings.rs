use crate::protocol::bindings::declare;
use crate::protocol::{Event, HostError, HostToUi, Reply, Request, UiToHost};
use crate::studio::*;
use std::fmt::Write as _;
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<WidgetKind>(&mut text);
    declare::<WidgetInfo>(&mut text);
    declare::<StudioState>(&mut text);
    declare::<StudioPlan>(&mut text);
    declare::<OffTrack>(&mut text);
    declare::<ShowIn>(&mut text);
    declare::<OverlaySize>(&mut text);
    declare::<OverlayInstance>(&mut text);
    declare::<StudioView>(&mut text);
    declare::<InstancePatch>(&mut text);
    writeln!(text,"export const studioLimits = {{instances:{INSTANCE_LIMIT},history:{HISTORY_LIMIT},opacityMin:{OPACITY_MIN},opacityMax:{OPACITY_MAX},id:{ID_LIMIT},size:{SIZE_LIMIT},label:{LABEL_LIMIT},about:{ABOUT_LIMIT}}} as const;").expect("limits");
    text.push_str("export const studioAddAvailable = true as const;\nexport const studioEditOnScreen = false as const;\n");
    writeln!(
        text,
        "export const studioCatalog = {} as const;",
        serde_json::to_string(
            &WidgetKind::CATALOG
                .iter()
                .map(|kind| kind.info(None))
                .collect::<Vec<_>>()
        )
        .expect("catalog")
    )
    .expect("catalog");
    writeln!(
        text,
        "export const studioKinds = {} as const;",
        serde_json::to_string(WidgetKind::ALL).expect("kinds")
    )
    .expect("kinds");
    let sizes: std::collections::BTreeMap<_, _> = WidgetKind::ALL
        .iter()
        .map(|kind| {
            let value = crate::widget_defaults::get(kind.id()).expect("generated defaults");
            (
                kind.id(),
                std::collections::BTreeMap::from([
                    ("height", value.size.height),
                    ("width", value.size.width),
                ]),
            )
        })
        .collect();
    writeln!(
        text,
        "export const studioSizes = {} as const;",
        serde_json::to_string(&sizes).expect("sizes")
    )
    .expect("sizes");
    let free: Vec<_> = WidgetKind::CATALOG
        .iter()
        .copied()
        .filter(|kind| {
            kind.info(Some(vantare_ipc::control::CatalogAccess::Free))
                .allowed
        })
        .collect();
    writeln!(
        text,
        "export const studioFreeKinds = {} as const;",
        serde_json::to_string(&free).expect("free kinds")
    )
    .expect("free kinds");
    let mut categories = vec!["Todos".to_owned()];
    for kind in WidgetKind::CATALOG {
        let category = kind.info(None).category;
        if !categories.contains(&category) {
            categories.push(category);
        }
    }
    writeln!(
        text,
        "export const studioCategories = {} as const;",
        serde_json::to_string(&categories).expect("categories")
    )
    .expect("categories");
    metadata(&mut text);
    text
}
fn metadata(text: &mut String) {
    for (name, value) in [
        (
            "studioStates",
            serde_json::to_string(&[
                StudioState::Missing,
                StudioState::Protected,
                StudioState::Ready,
            ])
            .expect("states"),
        ),
        (
            "studioPlans",
            serde_json::to_string(&[
                StudioPlan::Unverified,
                StudioPlan::Free,
                StudioPlan::Launch,
                StudioPlan::Pro,
                StudioPlan::Founders,
            ])
            .expect("plans"),
        ),
        (
            "studioOffTracks",
            serde_json::to_string(&[OffTrack::Inherit, OffTrack::AlwaysVisible, OffTrack::Hide])
                .expect("off track"),
        ),
        (
            "studioAddKinds",
            serde_json::to_string(WidgetKind::CATALOG).expect("add kinds"),
        ),
        (
            "studioRevisionPattern",
            serde_json::to_string(REVISION_PATTERN).expect("revision"),
        ),
    ] {
        writeln!(text, "export const {name} = {value} as const;").expect("metadata");
    }
}
pub(crate) fn corpus() -> serde_json::Value {
    let revision = "0".repeat(64);
    let value = State::unavailable(
        StudioState::Ready,
        Some(vantare_ipc::control::CatalogAccess::Pro),
    );
    let requests = [
        Request::StudioGet {},
        Request::StudioVisibility {
            id: "widget-1".into(),
            visible: false,
            base_revision: revision.clone(),
        },
        Request::StudioAdd {
            kind: WidgetKind::Standings,
            base_revision: revision.clone(),
        },
        Request::StudioRemove {
            id: "widget-1".into(),
            base_revision: revision.clone(),
        },
        Request::StudioInstance {
            id: "widget-1".into(),
            patch: InstancePatch::Opacity(50),
            base_revision: revision.clone(),
        },
        Request::StudioUndo {
            base_revision: revision.clone(),
        },
        Request::StudioRedo {
            base_revision: revision,
        },
        Request::StudioTrack { show: false },
    ];
    let replies = [
        Reply::StudioGet {
            value: value.clone(),
        },
        Reply::StudioVisibility {
            value: value.clone(),
        },
        Reply::StudioAdd {
            value: value.clone(),
            added: "widget-1".into(),
        },
        Reply::StudioRemove {
            value: value.clone(),
        },
        Reply::StudioInstance {
            value: value.clone(),
        },
        Reply::StudioUndo {
            value: value.clone(),
        },
        Reply::StudioRedo {
            value: value.clone(),
        },
        Reply::StudioTrack {
            value: value.clone(),
        },
    ];
    let mut host: Vec<HostToUi> = replies
        .into_iter()
        .map(|result| HostToUi::Response { id: 1, result })
        .collect();
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::StudioConflict {
            current: value.clone(),
        },
    });
    host.push(HostToUi::Event {
        event: Event::Studio { value },
    });
    let mut ui: Vec<UiToHost> = requests
        .into_iter()
        .map(|request| UiToHost::Request { id: 1, request })
        .collect();
    ui.push(UiToHost::Subscribe {
        topic: crate::protocol::Topic::Studio,
    });
    ui.push(UiToHost::Unsubscribe {
        topic: crate::protocol::Topic::Studio,
    });
    serde_json::json!({"host":host,"ui":ui})
}
