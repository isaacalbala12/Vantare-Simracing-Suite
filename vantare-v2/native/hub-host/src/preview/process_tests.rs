use super::*;
use crate::protocol::{AccessView, LinkState};
use crate::test_support::{Root, Signal};
use std::sync::{Condvar, Mutex};
fn authority() -> CoreStatus {
    CoreStatus {
        account_generation: Some("a".repeat(64)),
        rights: LinkState::Connected,
        access: AccessView {
            verified: true,
            ..Default::default()
        },
        ..Default::default()
    }
}
fn start(
    state: &mut State,
    now: Instant,
    mode: &str,
    signal: Option<&Signal>,
) -> Result<(), HostError> {
    state.start_with(
        7,
        &(WidgetKind::Relative, b"{}".to_vec()),
        "a".repeat(64),
        now,
        |root| {
            let mut command = Command::new(std::env::current_exe().expect("test executable"));
            environment(&mut command);
            command
                .args([
                    "--exact",
                    "preview::process::tests::fake_painter",
                    "--ignored",
                    "--nocapture",
                ])
                .env("VANTARE_PREVIEW_FAKE", mode)
                .env("VANTARE_PREVIEW_OUTPUT", root.join("image.png"));
            if let Some(signal) = signal {
                command.env("VANTARE_PREVIEW_SIGNAL", &signal.name);
            }
            command
        },
    )
}
#[test]
#[ignore = "test-only child invoked explicitly, never the Rune executable"]
fn fake_painter() {
    assert!(
        std::env::var_os("PATH").is_none(),
        "capture child must not inherit PATH"
    );
    let Some(mode) = std::env::var_os("VANTARE_PREVIEW_FAKE") else {
        return;
    };
    if mode == "wait" {
        let signal = Signal::open(std::env::var("VANTARE_PREVIEW_SIGNAL").expect("ready signal"))
            .expect("signal");
        signal.set();
        let pair = (Mutex::new(()), Condvar::new());
        let _guard = pair
            .1
            .wait_while(pair.0.lock().expect("lock"), |()| true)
            .expect("parent terminates this helper");
        unreachable!("no producer wakes the fake painter");
    }
    let (code, token) = match mode.to_str().expect("mode") {
        "ok" => {
            let bytes = super::super::tests::png();
            fs::write(
                std::env::var_os("VANTARE_PREVIEW_OUTPUT").expect("owned output"),
                bytes,
            )
            .expect("PNG");
            (0, "OK")
        }
        "missing" => (0, "OK"),
        "no-demo" => (3, "NO_DEMO"),
        "gpu" => (4, "GPU_UNAVAILABLE"),
        _ => (5, "CAPTURE_FAILED"),
    };
    eprintln!("{token} private details never sent to renderer");
    std::process::exit(code);
}
#[test]
fn fake_images_and_typed_errors_are_terminal_once_and_private_files_are_removed() {
    for (mode, expected) in [
        ("ok", None),
        ("no-demo", Some(PreviewError::NoDemo)),
        ("gpu", Some(PreviewError::GpuUnavailable)),
        ("missing", Some(PreviewError::CaptureFailed)),
    ] {
        let root = Root::new();
        let mut state = State::new(root.path.join("preview"));
        let now = Instant::now();
        start(&mut state, now, mode, None).expect("start fake painter");
        let run = state.active.as_mut().expect("active");
        let path = run.scratch.0.clone();
        run.child.wait().expect("synchronize with test child exit");
        let (id, result) = state
            .poll(now, &authority(), Some(CatalogAccess::Pro), false)
            .expect("terminal");
        assert_eq!(id, 7);
        if let Some(reason) = expected {
            assert_eq!(result, Err(HostError::PreviewFailed { reason }));
        } else {
            assert_eq!(result.expect("PNG").width, 1);
        }
        assert!(!path.exists());
        assert!(
            state
                .poll(now, &authority(), Some(CatalogAccess::Pro), false)
                .is_none()
        );
    }
}
#[test]
fn timeout_reaps_the_running_child_with_injected_time_and_no_sleep() {
    let root = Root::new();
    let mut state = State::new(root.path.join("preview"));
    let now = Instant::now();
    let signal = Signal::new().expect("signal");
    start(&mut state, now, "wait", Some(&signal)).expect("start");
    signal.wait();
    let run = state.active.as_ref().expect("running");
    let process = crate::test_support::process(run.child.id()).expect("child handle");
    let path = run.scratch.0.clone();
    assert!(
        state
            .poll(
                now + Duration::from_millis(u64::from(TIMEOUT_MS) - 1),
                &authority(),
                Some(CatalogAccess::Pro),
                false
            )
            .is_none()
    );
    assert_eq!(
        state.poll(
            now + Duration::from_millis(u64::from(TIMEOUT_MS)),
            &authority(),
            Some(CatalogAccess::Pro),
            false
        ),
        Some((
            7,
            Err(HostError::PreviewFailed {
                reason: PreviewError::Timeout
            })
        ))
    );
    crate::test_support::terminated(&process);
    assert!(!path.exists());
}
#[test]
fn close_revocation_account_and_live_discard_images_and_busy_never_starts_twice() {
    for case in 0..5 {
        let root = Root::new();
        let mut state = State::new(root.path.join("preview"));
        let now = Instant::now();
        let signal = Signal::new().expect("signal");
        start(&mut state, now, "wait", Some(&signal)).expect("start");
        signal.wait();
        let process =
            crate::test_support::process(state.active.as_ref().expect("running").child.id())
                .expect("handle");
        assert_eq!(start(&mut state, now, "ok", None), Err(HostError::Busy));
        let mut current = authority();
        match case {
            0 => current.live = true,
            1 => current.account_generation = Some("b".repeat(64)),
            2 => current.access.blocked = true,
            _ => {}
        }
        let access = if case == 3 {
            None
        } else {
            Some(CatalogAccess::Pro)
        };
        assert_eq!(
            state.poll(now, &current, access, case == 4),
            Some((7, Err(HostError::Denied)))
        );
        crate::test_support::terminated(&process);
    }
}
#[test]
fn dropping_session_state_terminates_its_child_and_missing_sibling_is_unavailable() {
    let root = Root::new();
    let mut state = State::new(root.path.join("preview"));
    let now = Instant::now();
    assert_eq!(
        sibling(&root.path.join("vantare-hub.exe")),
        Err(PreviewError::Unavailable)
    );
    let signal = Signal::new().expect("signal");
    start(&mut state, now, "wait", Some(&signal)).expect("start");
    signal.wait();
    let run = state.active.as_ref().expect("running");
    let path = run.scratch.0.clone();
    let process = crate::test_support::process(run.child.id()).expect("handle");
    drop(state);
    crate::test_support::terminated(&process);
    assert!(!path.exists());
}

#[test]
fn cli_uses_the_sibling_and_fixed_private_files_with_each_closed_scale() {
    let root = Root::new();
    let executable = root.path.join("bin/vantare-overlays-rune.exe");
    let scratch = root.path.join("private capture");
    for (scale, argument) in [
        (PreviewScale::One, "1"),
        (PreviewScale::Quarter, "1.25"),
        (PreviewScale::Half, "1.5"),
    ] {
        let command = capture_command(&executable, &scratch, WidgetKind::Relative, scale);
        assert_eq!(command.get_program(), executable.as_os_str());
        assert_eq!(command.get_current_dir(), executable.parent());
        let expected = vec![
            "--capture-scene".into(),
            "--widget".into(),
            "relative".into(),
            "--settings".into(),
            scratch.join("settings.json").into_os_string(),
            "--scale".into(),
            argument.into(),
            "--output".into(),
            scratch.join("image.png").into_os_string(),
        ];
        assert_eq!(
            command
                .get_args()
                .map(std::ffi::OsStr::to_os_string)
                .collect::<Vec<_>>(),
            expected
        );
        assert!(
            !command
                .get_envs()
                .any(|(name, _)| name == "PATH" || name == "VANTARE_HUB_TOKEN")
        );
    }
}
