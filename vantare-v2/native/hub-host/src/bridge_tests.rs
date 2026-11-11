//! Integration through real child processes and ACL-protected Win32 pipes.
use super::*;
use crate::test_support::{self, Root, Signal};
use std::{
    fs::File,
    io::Write as _,
    os::windows::{io::AsRawHandle, process::CommandExt},
    process::Stdio,
};
use vantare_ipc::transport::connect;
use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;
const PEER: &str = "ui_process::bridge_tests::peer_process";
fn command(
    mode: &str,
    pipe: &str,
    token: &str,
    stop: &str,
    ready: &str,
    pid_file: &Path,
) -> Command {
    let mut command = Command::new(std::env::current_exe().expect("test executable"));
    command
        .args(["--exact", PEER, "--ignored", "--nocapture"])
        .env_clear();
    for key in ["SystemRoot", "SystemDrive", "WINDIR", "PATH", "TEMP", "TMP"] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    command
        .env("VANTARE_TEST_MODE", mode)
        .env("VANTARE_TEST_PIPE", pipe)
        .env("VANTARE_TEST_TOKEN", token)
        .env("VANTARE_TEST_STOP", stop)
        .env("VANTARE_TEST_READY", ready)
        .env("VANTARE_TEST_PIDS", pid_file);
    command
}
fn spawn_peer(mode: &str, name: &str, token: &str, stop: &Signal) -> UiChild {
    let command = command(mode, name, token, &stop.name, "", Path::new("unused"));
    let null = File::options()
        .write(true)
        .open("NUL")
        .expect("null stderr");
    UiChild(crate::job::spawn(&command, &null).expect("spawn isolated peer"))
}
fn args(root: &Path) -> Args {
    Args {
        controlled: false,
        pipe: "unused-core".into(),
        data: root.into(),
        layout: root.join("layout.json"),
        launcher: root.join("launcher.json"),
        engineer: root.join("engineer.json"),
    }
}
fn endpoint() -> (String, Arc<Stop>, Listener, Pipe) {
    let name = format!(
        "vantare-hub-test-{}",
        vantare_services::random_id().expect("endpoint id")
    );
    let stop = Arc::new(Stop::new().expect("cancellation event"));
    let mut listener =
        Listener::new(&name, Arc::clone(&stop), Duration::from_secs(5)).expect("real listener");
    let pipe = listener.instance().expect("pipe instance");
    (name, stop, listener, pipe)
}
fn rejection(mode: &str, wrong_pid: bool) -> io::ErrorKind {
    let root = Root::new();
    let done = Signal::new().expect("peer stop");
    let (name, stop, _listener, pipe) = endpoint();
    let mut expected = spawn_peer(
        if wrong_pid { "wait" } else { mode },
        &name,
        &"a".repeat(64),
        &done,
    );
    let mut other = wrong_pid.then(|| spawn_peer(mode, &name, &"a".repeat(64), &done));
    if mode == "exit" {
        expected.0.wait().expect("child exited before accept");
    }
    let result = accept_ui(
        &args(&root.path),
        &mut expected,
        &std::env::current_exe().expect("image"),
        pipe,
        &stop,
        &"a".repeat(64),
        || false,
    );
    done.set();
    expected.0.wait().expect("join expected peer");
    if let Some(other) = &mut other {
        other.0.wait().expect("join connecting peer");
    }
    match result {
        Err(error) => error.kind(),
        Ok(_) => panic!("untrusted or dead child was accepted"),
    }
}
#[test]
fn rejects_wrong_token_on_real_pipe() {
    assert_eq!(rejection("token", false), io::ErrorKind::PermissionDenied);
}
#[test]
fn rejects_wrong_pid_even_when_the_image_matches() {
    assert_eq!(rejection("pid", true), io::ErrorKind::PermissionDenied);
}
#[test]
fn rejects_one_mib_plus_one_before_reading_payload() {
    assert_eq!(rejection("oversize", false), io::ErrorKind::InvalidData);
}
#[test]
fn successful_child_exit_before_connect_is_an_error() {
    assert_eq!(rejection("exit", false), io::ErrorKind::BrokenPipe);
}
#[test]
fn detects_pipe_eof_while_the_child_is_still_alive() {
    assert!(matches!(
        rejection("eof", false),
        io::ErrorKind::UnexpectedEof | io::ErrorKind::BrokenPipe
    ));
}
#[test]
fn authenticates_and_exchanges_typed_frames_on_the_real_pipe() {
    let root = Root::new();
    let done = Signal::new().expect("peer stop");
    let (name, stop, _listener, pipe) = endpoint();
    let mut child = spawn_peer("valid", &name, &"a".repeat(64), &done);
    let (mut pipe, mut reader) = accept_ui(
        &args(&root.path),
        &mut child,
        &std::env::current_exe().expect("image"),
        pipe,
        &stop,
        &"a".repeat(64),
        || false,
    )
    .expect("authenticated peer")
    .expect("connected");
    frame::write(
        &mut pipe,
        &protocol::hello(&protocol::bindings::settings_sample()).expect("hello"),
    )
    .expect("host frame");
    let ready = loop {
        if let Some(value) = reader.next::<UiToHost>(&mut pipe).expect("UI frame") {
            break value;
        }
    };
    assert!(matches!(ready, UiToHost::Ready {}));
    done.set();
    assert!(child.0.wait().expect("peer exit").success());
}
#[test]
fn supervisor_stdin_eof_cancels_a_pending_accept_without_sleeping() {
    let root = Root::new();
    let done = Signal::new().expect("peer stop");
    let (name, stop, _listener, pipe) = endpoint();
    let mut child = spawn_peer("wait", &name, &"a".repeat(64), &done);
    let (read, write) = test_support::anonymous_pipe().expect("real stdin pipe");
    drop(write);
    let mut args = args(&root.path);
    args.controlled = true;
    let result = accept_ui(
        &args,
        &mut child,
        &std::env::current_exe().expect("image"),
        pipe,
        &stop,
        &"a".repeat(64),
        || crate::control_stdin::closed_handle(read.as_raw_handle()),
    )
    .expect("supervisor EOF");
    assert!(result.is_none());
    done.set();
    child.0.wait().expect("peer exit");
}
struct Owner(std::process::Child);
impl Drop for Owner {
    fn drop(&mut self) {
        if self.0.kill().is_ok() {
            let _joined = self.0.wait();
        }
    }
}
#[test]
fn killing_the_owner_reaps_the_ui_and_its_descendant() {
    let root = Root::new();
    let done = Signal::new().expect("stop");
    let ready = Signal::new().expect("ready");
    let path = root.path.join("owned-pids.json");
    let mut command = command("owner", "", "", &done.name, &ready.name, &path);
    let mut owner = Owner(
        command
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("owner process"),
    );
    ready.wait_or_exit(&owner.0);
    let ids: Vec<u32> =
        serde_json::from_slice(&std::fs::read(path).expect("owned IDs")).expect("IDs");
    assert_eq!(ids.len(), 2);
    let processes: Vec<_> = ids
        .into_iter()
        .map(|id| test_support::process(id).expect("our descendant"))
        .collect();
    assert!(processes.iter().all(test_support::running));
    owner.0.kill().expect("simulate supervisor termination");
    owner.0.wait().expect("owner exited without Drop");
    for process in &processes {
        test_support::terminated(process);
    }
}
#[test]
#[ignore = "helper subprocess for the integration cases above"]
fn peer_process() {
    let Ok(mode) = std::env::var("VANTARE_TEST_MODE") else {
        return;
    };
    if mode == "exit" {
        return;
    }
    let name = std::env::var("VANTARE_TEST_PIPE").expect("pipe name");
    let token = std::env::var("VANTARE_TEST_TOKEN").expect("test token");
    let done = Signal::open(std::env::var("VANTARE_TEST_STOP").expect("stop name")).expect("stop");
    if mode == "wait" {
        done.wait();
        return;
    }
    if matches!(mode.as_str(), "owner" | "descendant") {
        owner_peer(&mode, &name, &token, &done);
        return;
    }
    let mut pipe = connect(
        &name,
        Arc::new(Stop::new().expect("stop")),
        Duration::from_secs(5),
    )
    .expect("connect real pipe");
    if mode == "eof" {
        drop(pipe);
        done.wait();
        return;
    }
    if mode == "oversize" {
        pipe.write_all(
            &u32::try_from(frame::LIMIT + 1)
                .expect("limit")
                .to_le_bytes(),
        )
        .expect("header");
    } else {
        frame::write(&mut pipe,&serde_json::json!({"kind":"authenticate","token":if mode=="token"{"b".repeat(64)}else{token}})).expect("authenticate frame");
    }
    if mode.starts_with("restart-") {
        restart_peer(&mut pipe, &mode);
    }
    if mode == "valid" {
        let mut reader = frame::Reader::default();
        let hello = loop {
            if let Some(value) = reader.next::<HostToUi>(&mut pipe).expect("host hello") {
                break value;
            }
        };
        assert!(matches!(
            hello,
            HostToUi::Hello {
                version: protocol::VERSION,
                ..
            }
        ));
        frame::write(&mut pipe, &UiToHost::Ready {}).expect("UI ready frame");
    }
    done.wait();
}
fn owner_peer(mode: &str, name: &str, token: &str, done: &Signal) {
    let ready = std::env::var("VANTARE_TEST_READY").expect("ready name");
    let path = PathBuf::from(std::env::var_os("VANTARE_TEST_PIDS").expect("PID file"));
    if mode == "owner" {
        let command = command("descendant", name, token, &done.name, &ready, &path);
        let null = File::options().write(true).open("NUL").expect("stderr");
        let _child = UiChild(crate::job::spawn(&command, &null).expect("job child"));
        done.wait();
    } else {
        let mut command = command("wait", name, token, &done.name, "", Path::new("unused"));
        let mut child = Owner(
            command
                .creation_flags(CREATE_NO_WINDOW)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .expect("inherited job descendant"),
        );
        std::fs::write(
            path,
            serde_json::to_vec(&[std::process::id(), child.0.id()]).expect("IDs"),
        )
        .expect("PID handoff");
        Signal::open(ready).expect("ready event").set();
        done.wait();
        let _killed = child.0.kill();
        let _joined = child.0.wait();
    }
}

#[test]
fn owner_already_in_a_job_can_spawn_a_nested_ui_job() {
    let root = Root::new();
    let done = Signal::new().expect("stop");
    let ready = Signal::new().expect("ready");
    let path = root.path.join("nested-pids.json");
    let command = command("owner", "", "", &done.name, &ready.name, &path);
    let null = File::options().write(true).open("NUL").expect("stderr");
    let mut owner = UiChild(crate::job::spawn(&command, &null).expect("owner in outer job"));
    let owner_handle = test_support::process(owner.0.id()).expect("owner handle");
    ready.wait_or_exit(&owner_handle);
    let ids: Vec<u32> = serde_json::from_slice(&std::fs::read(path).expect("IDs")).expect("PIDs");
    assert_eq!(ids.len(), 2);
    let processes: Vec<_> = ids
        .into_iter()
        .map(|id| test_support::process(id).expect("nested process"))
        .collect();
    assert!(processes.iter().all(test_support::running));
    owner.0.kill().expect("kill outer job");
    owner.0.wait().expect("owner exit");
    for process in &processes {
        test_support::terminated(process);
    }
}

fn restart_peer(pipe: &mut Pipe, mode: &str) {
    let mut reader = frame::Reader::default();
    let mut next = || loop {
        if let Some(value) = reader.next::<HostToUi>(pipe).expect("restart frame") {
            break value;
        }
    };
    let accepted = mode != "restart-reject";
    assert!(
        matches!(next(), HostToUi::Response { id:7, result:Reply::UpdatesRestart { accepted: actual } } if actual==accepted)
    );
    if accepted {
        assert!(matches!(
            next(),
            HostToUi::CloseRequested {
                reason: CloseReason::Restart
            }
        ));
        frame::write(
            pipe,
            &UiToHost::CloseAnswer {
                allow: mode == "restart-allow",
            },
        )
        .expect("close answer");
    } else {
        frame::write(pipe, &UiToHost::Ready {}).expect("response observed");
    }
}
fn restart_session(root: &Path, photo: &str) -> Session {
    let mut session = Session::new(
        &args(root),
        Core::start(photo, root).expect("unconnected core"),
        Settings::load(&args(root)),
        None,
        crate::privacy::State::isolated(root),
    );
    session.handshaken = true;
    session
}
fn restart_case((live, closing, ready): (bool, bool, bool), allow: bool) {
    let root = Root::new();
    let done = Signal::new().expect("peer stop");
    let (name, stop, _listener, pipe) = endpoint();
    let accepted = !live && !closing && ready;
    let mode = if !accepted {
        "restart-reject"
    } else if allow {
        "restart-allow"
    } else {
        "restart-deny"
    };
    let mut child = spawn_peer(mode, &name, &"a".repeat(64), &done);
    let (mut pipe, mut reader) = accept_ui(
        &args(&root.path),
        &mut child,
        &std::env::current_exe().expect("image"),
        pipe,
        &stop,
        &"a".repeat(64),
        || false,
    )
    .expect("admission")
    .expect("connected");
    let mut session = restart_session(&root.path, &name);
    session.current.live = live;
    if closing {
        session.closing = Some((CloseReason::Window, Instant::now()));
    }
    session
        .restart_update_when(&mut pipe, 7, || ready)
        .expect("restart request");
    let answer = loop {
        if let Some(value) = reader.next::<UiToHost>(&mut pipe).expect("UI ACK") {
            break value;
        }
    };
    let running = session.receive(&mut pipe, &answer).expect("close protocol");
    assert_eq!(running, !(accepted && allow));
    assert_eq!(session.exit_code, if accepted && allow { 10 } else { 0 });
    if accepted && !allow {
        assert!(session.closing.is_none());
    }
    if !accepted {
        assert_eq!(session.closing.is_some(), closing);
        assert_eq!(
            session
                .diagnostic
                .view(&session.current, false)
                .events
                .last()
                .map(|event| event.section),
            Some(crate::diagnostics::DiagnosticSection::Updates)
        );
    }
    done.set();
    assert!(child.0.wait().expect("peer exit").success());
}
#[test]
fn restart_ack_exits_ten_and_veto_cancels_the_session_close() {
    restart_case((false, false, true), true);
    restart_case((false, false, true), false);
}
#[test]
fn restart_rejects_live_existing_close_and_missing_ready() {
    for (live, closing, ready) in [
        (true, false, true),
        (false, true, true),
        (false, false, false),
    ] {
        restart_case((live, closing, ready), true);
    }
}

#[test]
fn profile_save_is_busy_without_writing_while_discovery_is_not_collected() {
    let root = crate::test_support::Root::new();
    let mut session = restart_session(&root.path, "");
    let view = session.launcher_reader.view();
    assert!(view.scanning);
    assert!(session.launcher_reader.discovered(&view.revision).is_none());
    let before = std::fs::read(&session.launcher).unwrap();
    let draft =
        crate::launcher::editor::draft(&vantare_launcher::Document::fresh_install().profiles[0]);
    assert_eq!(
        session.save_profile_draft(&draft, &view.revision),
        Err(HostError::Busy)
    );
    assert_eq!(std::fs::read(&session.launcher).unwrap(), before);
}

#[test]
fn stale_profile_revision_is_a_conflict_even_before_discovery_finishes() {
    let root = crate::test_support::Root::new();
    let mut session = restart_session(&root.path, "");
    let view = session.launcher_reader.view();
    assert!(view.scanning);
    let before = std::fs::read(&session.launcher).unwrap();
    let draft =
        crate::launcher::editor::draft(&vantare_launcher::Document::fresh_install().profiles[0]);
    assert!(matches!(
        session.save_profile_draft(&draft, &"f".repeat(64)),
        Err(HostError::LauncherConflict { .. })
    ));
    assert_eq!(std::fs::read(&session.launcher).unwrap(), before);
}

#[path = "testing_bridge_tests.rs"]
mod testing;
