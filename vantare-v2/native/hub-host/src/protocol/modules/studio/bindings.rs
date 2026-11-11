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
    writeln!(text,"export const studioLimits = {{instances:{},history:{},opacityMin:{},opacityMax:{},id:256}} as const;",INSTANCE_LIMIT,HISTORY_LIMIT,OPACITY_MIN,OPACITY_MAX).expect("limits");
    text.push_str("export const studioEditOnScreen = false as const;\n");
    writeln!(
        text,
        "export const studioCatalog = {} as const;",
        serde_json::to_string(
            &WidgetKind::ALL
                .iter()
                .map(|kind| kind.info(None))
                .collect::<Vec<_>>()
        )
        .expect("catalog")
    )
    .expect("catalog");
    text
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
    let ui: Vec<UiToHost> = requests
        .into_iter()
        .map(|request| UiToHost::Request { id: 1, request })
        .collect();
    serde_json::json!({"host":host,"ui":ui})
}
