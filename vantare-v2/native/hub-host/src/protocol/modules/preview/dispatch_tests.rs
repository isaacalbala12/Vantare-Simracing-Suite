#![allow(clippy::unwrap_used)]
use super::*;
#[test]
fn render_is_denied_without_authority_and_never_writes_layout() {
    let fixture = Fixture::new();
    let path = fixture.0.join("layout.json");
    std::fs::write(&path, b"protected document").unwrap();
    let mut session = fixture.session();
    let mut pipe = Pipe::new(Vec::new());
    preview::dispatch(
        &mut session,
        &mut pipe,
        42,
        &Request::PreviewRender {
            target: crate::preview::PreviewTarget::Catalog {
                widget: crate::studio::WidgetKind::Relative,
            },
            scene: crate::preview::PreviewScene::Demo,
            scale: crate::preview::PreviewScale::One,
        },
    )
    .unwrap();
    let response: HostToUi = frame::Reader::default()
        .next(&mut Pipe::new(pipe.into_inner()))
        .unwrap()
        .unwrap();
    assert_eq!(
        response,
        HostToUi::Failure {
            id: 42,
            error: HostError::Denied
        }
    );
    assert_eq!(std::fs::read(path).unwrap(), b"protected document");
    assert_eq!(session.core.requests, 0);
}
#[test]
fn full_image_response_fits_the_frame_and_oversized_envelope_is_typed() {
    let result = crate::preview::PreviewImage {
        width: 1,
        height: 1,
        png_base64: "A".repeat(crate::preview::PNG_LIMIT.div_ceil(3) * 4),
    };
    let response = preview::message(u32::MAX, Ok(result));
    assert!(matches!(response, HostToUi::Response { .. }));
    assert!(serde_json::to_vec(&response).unwrap().len() < frame::LIMIT);
    let result = crate::preview::PreviewImage {
        width: 1,
        height: 1,
        png_base64: "A".repeat(frame::LIMIT),
    };
    assert_eq!(
        preview::message(42, Ok(result)),
        HostToUi::Failure {
            id: 42,
            error: HostError::PreviewFailed {
                reason: crate::preview::PreviewError::TooLarge
            }
        }
    );
}

#[test]
fn scene_targets_use_the_same_authority_gate_and_reject_extra_wire_fields() {
    for (verified, blocked, live) in [
        (false, false, false),
        (true, true, false),
        (true, false, true),
        (true, false, false),
    ] {
        let fixture = Fixture::new();
        let mut session = fixture.session();
        session.current.access.verified = verified;
        session.current.access.blocked = blocked;
        session.current.live = live;
        let request = serde_json::json!({"method":"preview.render","scene":"demo","scale":"1",
            "target":{"kind":"scene","widget":"standings","sceneId":"standings-default","frame":0}});
        let mut extra = request.clone();
        extra["target"]["path"] = "private".into();
        assert!(serde_json::from_value::<Request>(extra).is_err());
        let mut pipe = Pipe::new(Vec::new());
        preview::dispatch(
            &mut session,
            &mut pipe,
            12,
            &serde_json::from_value(request).unwrap(),
        )
        .unwrap();
        let response: HostToUi = frame::Reader::default()
            .next(&mut Pipe::new(pipe.into_inner()))
            .unwrap()
            .unwrap();
        assert_eq!(
            response,
            HostToUi::Failure {
                id: 12,
                error: HostError::Denied
            }
        );
    }
}
