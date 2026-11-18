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
        None,
        "a".repeat(64),
        now,
        |root| fake_command(root, mode, signal),
    )
}
fn fake_command(root: &Path, mode: &str, signal: Option<&Signal>) -> Command {
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
}

impl State {
    pub(crate) fn use_fake_scene_painter(&mut self) {
        self.test_command = Some(|root| {
            let fixtures = crate::workshop::development_root();
            let expected = crate::workshop::Scenes::load(Some(fixtures))
                .snapshot(WidgetKind::Standings, "standings-vantare", 2)
                .expect("fixture frame");
            assert_eq!(
                fs::read(root.join("snapshot.json")).expect("dispatch snapshot"),
                expected
            );
            fake_command(root, "ok", None)
        });
    }

    pub(crate) fn wait_for_fake_painter(&mut self) {
        self.active
            .as_mut()
            .expect("fake capture started")
            .child
            .wait()
            .expect("fake child");
    }
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
        let command = capture_command(&executable, &scratch, WidgetKind::Relative, scale, false);
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

#[test]
fn a_new_host_sweeps_crash_remains_only_inside_its_preview_root() {
    let root = Root::new();
    let preview = root.path.join("preview");
    let remains = preview.join("aborted-host").join("nested");
    fs::create_dir_all(&remains).expect("crash remains");
    fs::write(remains.join("image.png"), b"unfinished image").expect("stale image");
    fs::write(preview.join("stderr"), b"stale stderr").expect("stale file");
    let outside = root.path.join("unrelated");
    fs::write(&outside, b"keep").expect("sibling");
    let outside_directory = root.path.join("outside-directory");
    fs::create_dir(&outside_directory).expect("outside directory");
    fs::write(outside_directory.join("keep"), b"outside").expect("outside marker");
    junction(&remains.join("redirect"), &outside_directory);
    let outside_acl = acl_sddl(&outside_directory);
    let now = Instant::now();
    let mut state = State::new(preview.clone());
    start(&mut state, now, "no-demo", None).expect("new capture");
    assert_eq!(
        fs::read(outside_directory.join("keep")).expect("junction target unchanged"),
        b"outside"
    );
    assert_eq!(acl_sddl(&outside_directory), outside_acl);
    assert!(!preview.join("aborted-host").exists());
    assert!(!preview.join("stderr").exists());
    assert_eq!(fs::read(&outside).expect("outside unchanged"), b"keep");
    let active = state.active.as_mut().expect("active");
    active.child.wait().expect("finished fake child");
    let (_, outcome) = state
        .poll(now, &authority(), Some(CatalogAccess::Pro), false)
        .expect("terminal");
    assert_eq!(
        outcome,
        Err(HostError::PreviewFailed {
            reason: PreviewError::NoDemo
        })
    );
    assert_eq!(fs::read_dir(&preview).expect("empty preview").count(), 0);
    assert_eq!(fs::read(outside).expect("outside unchanged"), b"keep");
}
#[test]
fn stderr_over_64_kib_is_terminal_and_reaps_the_child() {
    let root = Root::new();
    let mut state = State::new(root.path.join("preview"));
    let now = Instant::now();
    let ready = Signal::new().expect("signal");
    start(&mut state, now, "wait", Some(&ready)).expect("start");
    ready.wait();
    let active = state.active.as_ref().expect("active");
    let process = crate::test_support::process(active.child.id()).expect("handle");
    let stderr = active.scratch.0.join("stderr");
    fs::write(
        &stderr,
        vec![b'x'; usize::try_from(STDERR_LIMIT).expect("test limit")],
    )
    .expect("exact limit");
    assert!(
        state
            .poll(now, &authority(), Some(CatalogAccess::Pro), false)
            .is_none()
    );
    OpenOptions::new()
        .append(true)
        .open(&stderr)
        .expect("stderr")
        .write_all(b"x")
        .expect("over limit");
    assert_eq!(
        state.poll(now, &authority(), Some(CatalogAccess::Pro), false),
        Some((
            7,
            Err(HostError::PreviewFailed {
                reason: PreviewError::CaptureFailed
            })
        ))
    );
    crate::test_support::terminated(&process);
    assert!(!stderr.exists());
}

fn junction(link: &Path, target: &Path) {
    use std::os::windows::process::CommandExt as _;
    let output = Command::new("cmd.exe")
        .args(["/d", "/c", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW)
        .output()
        .expect("QA junction");
    assert!(
        output.status.success(),
        "QA junction: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}
#[test]
fn a_redirected_preview_root_is_rejected_without_touching_its_target() {
    let root = Root::new();
    let outside = root.path.join("outside");
    fs::create_dir(&outside).expect("outside");
    fs::write(outside.join("keep"), b"keep").expect("marker");
    let preview = root.path.join("preview");
    junction(&preview, &outside);
    let mut state = State::new(preview.clone());
    let result = start(&mut state, Instant::now(), "ok", None);
    fs::remove_dir(&preview).expect("unlink QA junction");
    assert_eq!(result, Err(HostError::Io));
    assert_eq!(fs::read(outside.join("keep")).expect("unchanged"), b"keep");
}

#[test]
fn preview_root_dacl_is_protected_and_grants_only_the_current_user() {
    use std::os::windows::process::CommandExt as _;
    let root = Root::new();
    let preview = root.path.join("preview");
    let mut state = State::new(preview.clone());
    let now = Instant::now();
    start(&mut state, now, "no-demo", None).expect("private capture");
    let powershell = PathBuf::from(std::env::var_os("SystemRoot").expect("Windows"))
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let mut command = Command::new(powershell);
    environment(&mut command);
    let output=command.args(["-NoProfile","-NonInteractive","-Command",r"
$ErrorActionPreference='Stop'
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=Get-Acl -LiteralPath $env:VANTARE_PREVIEW_ACL_TEST_PATH
$rules=@($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]))
if (-not $acl.AreAccessRulesProtected -or $rules.Count -ne 1) { exit 1 }
$rule=$rules[0]
if ($rule.IdentityReference -ne $sid -or $rule.IsInherited -or $rule.AccessControlType -ne 'Allow') { exit 2 }
if ($rule.FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { exit 3 }
if ($rule.InheritanceFlags -ne ([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit)) { exit 4 }
"]).env("VANTARE_PREVIEW_ACL_TEST_PATH",&preview)
        .creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW)
        .output().expect("read QA DACL without changing it");
    assert!(
        output.status.success(),
        "preview DACL does not match current user: {:?}",
        output.status.code()
    );
    state
        .active
        .as_mut()
        .expect("active")
        .child
        .wait()
        .expect("fake child");
    let (_, outcome) = state
        .poll(now, &authority(), Some(CatalogAccess::Pro), false)
        .expect("terminal");
    assert_eq!(
        outcome,
        Err(HostError::PreviewFailed {
            reason: PreviewError::NoDemo
        })
    );
}

fn acl_sddl(path: &Path) -> String {
    use std::os::windows::process::CommandExt as _;
    let powershell = PathBuf::from(std::env::var_os("SystemRoot").expect("Windows"))
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let mut command = Command::new(powershell);
    environment(&mut command);
    let output = command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-Acl -LiteralPath $env:VANTARE_PREVIEW_ACL_TEST_PATH).Sddl",
        ])
        .env("VANTARE_PREVIEW_ACL_TEST_PATH", path)
        .creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW)
        .output()
        .expect("read outside QA ACL");
    assert!(output.status.success());
    String::from_utf8(output.stdout)
        .expect("SDDL")
        .trim()
        .into()
}

#[path = "scene_process_tests.rs"]
mod scene_tests;
