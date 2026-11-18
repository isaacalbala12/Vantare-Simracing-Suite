use crate::preview::*;
use crate::protocol::bindings::{declare, sample_response};
use crate::protocol::{HostError, HostToUi, Reply, Request, UiToHost};
pub(crate) const PNG: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAaW2hJ0AAAAASUVORK5CYII=";
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<PreviewTarget>(&mut text);
    declare::<PreviewScene>(&mut text);
    declare::<PreviewScale>(&mut text);
    declare::<PreviewError>(&mut text);
    declare::<PreviewImage>(&mut text);
    crate::protocol::bindings::constants!(
        &mut text,
        "previewLimits",
        serde_json::json!({"pngBytes":PNG_LIMIT,"axis":AXIS_LIMIT,"timeoutMs":TIMEOUT_MS})
    );
    crate::protocol::bindings::constants!(
        &mut text,
        "previewScales",
        [PreviewScale::One, PreviewScale::Quarter, PreviewScale::Half]
    );
    crate::protocol::bindings::constants!(&mut text, "previewErrors", errors());
    crate::protocol::bindings::constants!(&mut text, "previewTransparentPng", PNG);
    text
}
fn errors() -> [PreviewError; 8] {
    [
        PreviewError::InvalidInput,
        PreviewError::NoDemo,
        PreviewError::GpuUnavailable,
        PreviewError::CaptureFailed,
        PreviewError::GraphicsDisabled,
        PreviewError::Timeout,
        PreviewError::TooLarge,
        PreviewError::Unavailable,
    ]
}
pub(crate) fn corpus() -> serde_json::Value {
    let mut host = vec![sample_response(Reply::PreviewRender {
        value: PreviewImage {
            width: 1,
            height: 1,
            png_base64: PNG.into(),
        },
    })];
    host.extend(errors().map(|reason| HostToUi::Failure {
        id: 1,
        error: HostError::PreviewFailed { reason },
    }));
    let ui = vec![
        UiToHost::Request {
            id: 1,
            request: Request::PreviewRender {
                target: PreviewTarget::Scene {
                    widget: crate::studio::WidgetKind::Standings,
                    scene_id: "standings-default".into(),
                    frame: 0,
                },
                scene: PreviewScene::Demo,
                scale: PreviewScale::One,
            },
        },
        UiToHost::Request {
            id: 1,
            request: Request::PreviewRender {
                target: PreviewTarget::Catalog {
                    widget: crate::studio::WidgetKind::Relative,
                },
                scene: PreviewScene::Demo,
                scale: PreviewScale::One,
            },
        },
        UiToHost::Request {
            id: 1,
            request: Request::PreviewRender {
                target: PreviewTarget::Instance {
                    id: "widget-1".into(),
                    base_revision: "0".repeat(64),
                },
                scene: PreviewScene::Demo,
                scale: PreviewScale::Half,
            },
        },
    ];
    serde_json::json!({"host":host,"ui":ui})
}
