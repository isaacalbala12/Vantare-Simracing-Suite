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
