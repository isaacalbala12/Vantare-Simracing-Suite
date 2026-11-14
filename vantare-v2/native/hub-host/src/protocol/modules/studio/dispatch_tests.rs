use super::*;
fn response(session: &mut Session, request: &Request) -> HostToUi {
    let mut pipe = Pipe::new(Vec::new());
    studio::dispatch(session, &mut pipe, 42, request).unwrap();
    frame::Reader::default()
        .next(&mut Pipe::new(pipe.into_inner()))
        .unwrap()
        .unwrap()
}
#[test]
fn mutations_are_denied_in_live_or_without_verified_rights_without_touching_files() {
    let fixture = Fixture::new();
    let path = fixture.0.join("layout.json");
    let bytes = br#"{"version":1,"instances":[]}"#;
    std::fs::write(&path, bytes).unwrap();
    for live in [false, true] {
        let mut session = fixture.session();
        session.current.live = live;
        for request in [
            Request::StudioAdd {
                kind: crate::studio::WidgetKind::Delta,
                at: None,
                base_revision: "0".repeat(64),
            },
            Request::StudioTrack { show: true },
        ] {
            assert!(matches!(
                response(&mut session, &request),
                HostToUi::Failure {
                    error: HostError::Denied,
                    ..
                }
            ));
            assert_eq!(std::fs::read(&path).unwrap(), bytes);
            assert!(!path.with_extension("show.json").exists());
        }
    }
}
#[cfg(windows)]
#[test]
fn hide_remains_available_with_expired_rights_live_and_a_broken_document() {
    let fixture = Fixture::new();
    let path = fixture.0.join("layout.json");
    std::fs::write(&path, b"broken").unwrap();
    std::fs::write(path.with_extension("show.json"), b"any request").unwrap();
    let mut session = fixture.session();
    session.current.live = true;
    assert!(
        matches!(response(&mut session,&Request::StudioTrack{show:false}),HostToUi::Response{result:Reply::StudioTrack{value},..} if !value.showing)
    );
    assert_eq!(std::fs::read(&path).unwrap(), b"broken");
    assert!(!path.with_extension("show.json").exists());
}
#[test]
fn ticks_without_subscription_or_in_live_emit_nothing() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let mut pipe = Pipe::new(Vec::new());
    studio_tick::tick(&mut session, &mut pipe).unwrap();
    assert_eq!(pipe.get_ref().as_slice(), [] as [u8; 0]);
    session.subscriptions.insert(Topic::Studio);
    session.current.live = true;
    studio_tick::tick(&mut session, &mut pipe).unwrap();
    assert_eq!(pipe.get_ref().as_slice(), [] as [u8; 0]);
}
#[test]
fn subscribe_has_one_initial_event_and_immediate_tick_does_not_duplicate_it() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let mut pipe = Pipe::new(Vec::new());
    session.subscriptions.insert(Topic::Studio);
    studio::subscribe(&mut session, &mut pipe, Topic::Studio).unwrap();
    let initial = pipe.get_ref().len();
    assert!(initial > 0);
    studio_tick::tick(&mut session, &mut pipe).unwrap();
    assert_eq!(pipe.get_ref().len(), initial);
}
#[cfg(windows)]
#[test]
fn geometry_canvas_and_drop_require_current_rights_and_not_live() {
    use crate::studio::{CanvasChoice, GeometryChange, Point};
    let fixture = Fixture::new();
    let path = fixture.0.join("layout.json");
    let bytes=br#"{"version":1,"instances":[{"id":"widget-1","x":48.5,"y":62,"settings":{"kind":"delta"}}]}"#;
    std::fs::write(&path, bytes).expect("fixture");
    let revision = vantare_services::content_hash(bytes);
    let mut session = fixture.session();
    session.core.available = true;
    session.current.access.verified = true;
    session.current.live = true;
    let requests = [
        Request::StudioGeometry {
            id: "widget-1".into(),
            change: GeometryChange::Move {
                x: 100_u32.into(),
                y: 200_u32.into(),
            },
            base_revision: revision.clone(),
        },
        Request::StudioCanvas {
            resolution: CanvasChoice::Custom {
                width: 2560_u32.into(),
                height: 1440_u32.into(),
            },
            base_revision: revision.clone(),
        },
        Request::StudioAdd {
            kind: crate::studio::WidgetKind::Delta,
            at: Some(Point {
                x: 400_u32.into(),
                y: 300_u32.into(),
            }),
            base_revision: revision,
        },
    ];
    for current_rights in [true, false] {
        session.current.access.verified = current_rights;
        session.current.live = current_rights;
        for request in &requests {
            assert!(matches!(
                response(&mut session, request),
                HostToUi::Failure {
                    error: HostError::Denied,
                    ..
                }
            ));
            assert_eq!(std::fs::read(&path).expect("bytes"), bytes);
        }
    }
    session.current.access.verified = true;
    session.current.live = false;
    assert!(
        matches!(response(&mut session,&requests[0]),HostToUi::Response{result:Reply::StudioGeometry{value},..} if value.instances[0].x==100_u32.into())
    );
    assert_ne!(std::fs::read(&path).expect("changed"), bytes);
}
