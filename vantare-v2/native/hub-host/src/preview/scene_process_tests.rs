use super::*;

#[test]
fn selected_scene_bytes_and_defaults_reach_the_same_private_fake_painter_job() {
    let owned = Root::new();
    let mut state = State::new(owned.path.join("preview"));
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("../ui/fixtures");
    let snapshot = crate::workshop::Scenes::load(Some(fixtures.clone()))
        .snapshot(WidgetKind::Relative, "relative", 0)
        .expect("selected snapshot");
    let settings = (
        WidgetKind::Relative,
        crate::widget_defaults::get("relative")
            .expect("defaults")
            .settings
            .get()
            .as_bytes()
            .to_vec(),
    );
    let now = Instant::now();
    state
        .start_with(8, &settings, Some(snapshot), "a".repeat(64), now, |root| {
            let exe = std::env::current_exe().expect("test executable");
            let capture = capture_command(&exe, root, settings.0, PreviewScale::One, true);
            let mut cli = capture.get_args();
            assert!(cli.any(|arg| arg == "--snapshot"));
            assert_eq!(cli.next(), Some(root.join("snapshot.json").as_os_str()));
            assert_eq!(
                fs::read(root.join("snapshot.json")).expect("snapshot"),
                fs::read(fixtures.join("relative.snapshot.json")).expect("fixture bytes")
            );
            assert_eq!(
                fs::read(root.join("settings.json")).expect("settings"),
                settings.1
            );
            let mut command = Command::new(exe);
            environment(&mut command);
            command
                .args([
                    "--exact",
                    "preview::process::tests::fake_painter",
                    "--ignored",
                    "--nocapture",
                ])
                .env("VANTARE_PREVIEW_FAKE", "ok")
                .env("VANTARE_PREVIEW_OUTPUT", root.join("image.png"));
            command
        })
        .expect("start");
    assert_eq!(start(&mut state, now, "ok", None), Err(HostError::Busy));
    let run = state.active.as_mut().expect("running");
    let path = run.scratch.0.clone();
    run.child.wait().expect("fake child");
    assert!(matches!(
        state.poll(now, &authority(), Some(CatalogAccess::Pro), false),
        Some((8, Ok(_)))
    ));
    assert!(!path.exists());
}

#[test]
fn scene_scratch_is_removed_on_capture_error_close_and_account_change() {
    for (mode, closing, changed, error) in [
        (
            "gpu",
            false,
            false,
            HostError::PreviewFailed {
                reason: PreviewError::GpuUnavailable,
            },
        ),
        ("wait", true, false, HostError::Denied),
        ("wait", false, true, HostError::Denied),
    ] {
        let owned = Root::new();
        let mut state = State::new(owned.path.join("preview"));
        let now = Instant::now();
        let ready = Signal::new().expect("child ready");
        let fixtures = crate::workshop::development_root();
        let snapshot = crate::workshop::Scenes::load(Some(fixtures))
            .snapshot(WidgetKind::Relative, "relative-vantare", 1)
            .expect("scene frame");
        state
            .start_with(
                8,
                &(WidgetKind::Relative, b"{}".to_vec()),
                Some(snapshot),
                "a".repeat(64),
                now,
                |root| fake_command(root, mode, Some(&ready)),
            )
            .expect("scene starts");
        let run = state.active.as_mut().expect("running");
        let scratch = run.scratch.0.clone();
        assert!(scratch.join("snapshot.json").is_file());
        let child = crate::test_support::process(run.child.id()).expect("child handle");
        if mode == "wait" {
            ready.wait();
        } else {
            run.child.wait().expect("fake error");
        }
        let mut current = authority();
        if changed {
            current.account_generation = Some("b".repeat(64));
        }
        assert_eq!(
            state.poll(now, &current, Some(CatalogAccess::Pro), closing),
            Some((8, Err(error)))
        );
        crate::test_support::terminated(&child);
        assert!(!scratch.exists());
        assert!(!state.busy());
    }
}
