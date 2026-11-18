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

#[cfg(windows)]
#[test]
fn permitted_scene_starts_a_capture_and_tick_replies_with_the_photo() {
    use crate::{
        preview::{PreviewScale, PreviewScene, PreviewTarget},
        studio::WidgetKind,
        workshop::Scenes,
    };
    let fixture = Fixture::new();
    let mut session = fixture.session();
    session.core.available = true;
    session.current.access.verified = true;
    session.current.account_generation = Some("a".repeat(64));
    assert!(
        session
            .workshop_scenes
            .set(Scenes::load(Some(crate::workshop::development_root())))
            .is_ok()
    );
    session.preview_state.use_fake_scene_painter();

    let now = Instant::now();
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(
            &mut pipe,
            42,
            &Request::PreviewRender {
                target: PreviewTarget::Scene {
                    widget: WidgetKind::Standings,
                    scene_id: "standings-vantare".into(),
                    frame: 2,
                },
                scene: PreviewScene::Demo,
                scale: PreviewScale::One,
            },
        )
        .unwrap();
    assert!(session.preview_state.busy());
    assert_eq!(pipe.get_ref(), &[] as &[u8]);
    session.preview_state.wait_for_fake_painter();
    preview_tick::tick_at(&mut session, &mut pipe, now).unwrap();
    let mut response = Pipe::new(pipe.into_inner());
    assert_eq!(
        frame::Reader::default()
            .next::<HostToUi>(&mut response)
            .unwrap()
            .unwrap(),
        HostToUi::Response {
            id: 42,
            result: Reply::PreviewRender {
                value: crate::preview::PreviewImage {
                    width: 1,
                    height: 1,
                    png_base64: crate::protocol::modules::preview::bindings::PNG.into(),
                }
            }
        }
    );
    assert!(!session.preview_state.busy());
}
