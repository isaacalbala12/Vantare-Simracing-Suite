use crate::{
    args::Args,
    core::Core,
    frame,
    protocol::{self, CloseReason, Event, HostError, HostToUi, Reply, Request, Topic, UiToHost},
    ready,
    settings::{SaveError, Settings},
};
use serde::Deserialize;
use std::{
    io,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
    time::{Duration, Instant},
};
use vantare_ipc::transport::{Event as Stop, Listener, Pipe};
#[cfg(feature = "qa-e2e")]
fn qa_phase(args: &Args, phase: &str) -> io::Result<()> {
    use std::io::Write as _;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(args.data.join("hub-host-qa.log"))?;
    writeln!(file, "{phase}")
}
struct UiChild(crate::job::Child);
impl Drop for UiChild {
    fn drop(&mut self) {
        // Let Electron finish its close ACK and normal cache cleanup; then reap even a stuck child.
        let deadline = Instant::now() + Duration::from_millis(250);
        while matches!(self.0.try_wait(), Ok(None)) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        if self.0.kill().is_ok() {
            let _waited = self.0.wait();
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Authentication {
    kind: String,
    token: String,
}
fn authenticated(value: &Authentication, expected: &str) -> bool {
    value.kind == "authenticate"
        && value.token.len() == expected.len()
        && value
            .token
            .bytes()
            .zip(expected.bytes())
            .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
            == 0
}
fn ui_target(executable: &Path) -> io::Result<(PathBuf, Vec<PathBuf>)> {
    if let Some(generation) = ready::generation(executable) {
        return Ok((crate::integrity::ui(&generation)?, Vec::new()));
    }
    #[cfg(any(debug_assertions, feature = "qa-e2e"))]
    {
        let value = std::env::var_os("VANTARE_HUB_UI").ok_or(io::ErrorKind::NotFound)?;
        if value == "dev" {
            let web = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../hub-web");
            return Ok((
                std::fs::canonicalize(web.join("node_modules/electron/dist/electron.exe"))?,
                vec![web],
            ));
        }
        Ok((std::fs::canonicalize(value)?, Vec::new()))
    }
    #[cfg(not(any(debug_assertions, feature = "qa-e2e")))]
    Err(io::ErrorKind::PermissionDenied.into())
}
fn spawn_ui(
    args: &Args,
    executable: &Path,
    name: &str,
    token: &str,
) -> io::Result<(UiChild, PathBuf)> {
    let (ui, arguments) = ui_target(executable)?;
    let mut command = Command::new(&ui);
    command.env_clear();
    for name in [
        "SystemRoot",
        "SystemDrive",
        "WINDIR",
        "PATH",
        "PATHEXT",
        "COMSPEC",
        "LOCALAPPDATA",
        "APPDATA",
        "USERPROFILE",
        "NUMBER_OF_PROCESSORS",
        "PROCESSOR_ARCHITECTURE",
        "SESSIONNAME",
    ] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    let temporary = args.data.join("hub-ui/tmp");
    std::fs::create_dir_all(&temporary)?;
    command.env("TEMP", &temporary).env("TMP", &temporary);
    command.args(arguments);
    command
        .env("VANTARE_HUB_PIPE", name)
        .env("VANTARE_HUB_TOKEN", token)
        .env("VANTARE_HUB_DATA_DIR", &args.data);
    #[cfg(feature = "qa-e2e")]
    {
        if let Ok(scale) = std::env::var("VANTARE_HUB_QA_SCALE") {
            if !["1", "1.25", "1.5"].contains(&scale.as_str()) {
                return Err(io::ErrorKind::InvalidInput.into());
            }
            command.arg(format!("--force-device-scale-factor={scale}"));
        }
        command.args([
            "--remote-debugging-port=0",
            "--remote-debugging-address=127.0.0.1",
        ]);
    }
    #[cfg(feature = "qa-e2e")]
    let stderr = std::fs::File::create(args.data.join("hub-ui-qa.log"))?;
    #[cfg(not(feature = "qa-e2e"))]
    let stderr = std::fs::OpenOptions::new().write(true).open("NUL")?;
    #[cfg(feature = "qa-e2e")]
    qa_phase(args, "before-ui-spawn")?;
    let child = crate::job::spawn(&command, &stderr)?;
    #[cfg(feature = "qa-e2e")]
    qa_phase(args, "ui-spawned")?;
    Ok((UiChild(child), ui))
}
fn accept_ui(
    args: &Args,
    child: &mut UiChild,
    ui: &Path,
    mut pipe: Pipe,
    stop: &Arc<Stop>,
    token: &str,
    control_closed: impl Fn() -> bool,
) -> io::Result<Option<(Pipe, frame::Reader)>> {
    let deadline = Instant::now() + Duration::from_secs(15);
    let accepting = std::thread::Builder::new()
        .name("hub-ui-accept".into())
        .spawn(move || {
            pipe.accept()?;
            Ok::<_, io::Error>(pipe)
        })?;
    let mut cancelled = None;
    while !accepting.is_finished() {
        if args.controlled && control_closed() {
            cancelled = Some(io::ErrorKind::ConnectionAborted);
            break;
        }
        match child.0.try_wait() {
            Ok(None) => {}
            Ok(Some(_)) => {
                cancelled = Some(io::ErrorKind::BrokenPipe);
                break;
            }
            Err(error) => {
                cancelled = Some(error.kind());
                break;
            }
        }
        if Instant::now() >= deadline {
            cancelled = Some(io::ErrorKind::TimedOut);
            break;
        }
        stop.wait(Duration::from_millis(25));
    }
    if cancelled.is_some() {
        stop.set();
    }
    let accepted = accepting
        .join()
        .map_err(|_| io::Error::other("UI accept worker failed"))?;
    if let Some(reason) = cancelled {
        return if reason == io::ErrorKind::ConnectionAborted {
            Ok(None)
        } else {
            Err(reason.into())
        };
    }
    let mut pipe = accepted?;
    let peer = pipe.client_peer()?;
    if peer.pid != child.0.id() || !peer.is_image(ui) {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    let mut reader = frame::Reader::default();
    loop {
        if args.controlled && control_closed() {
            return Ok(None);
        }
        if child.0.try_wait()?.is_some() {
            return Err(io::ErrorKind::BrokenPipe.into());
        }
        if Instant::now() >= deadline {
            return Err(io::ErrorKind::TimedOut.into());
        }
        if let Some(value) = reader.next::<Authentication>(&mut pipe)? {
            if !authenticated(&value, token) {
                return Err(io::ErrorKind::PermissionDenied.into());
            }
            #[cfg(feature = "qa-e2e")]
            qa_phase(args, "ui-authenticated")?;
            return Ok(Some((pipe, reader)));
        }
    }
}
fn entered_live(previous: Option<&protocol::CoreStatus>, current: &protocol::CoreStatus) -> bool {
    previous.is_some_and(|previous| {
        previous.rights == protocol::LinkState::Connected
            && current.rights == protocol::LinkState::Connected
            && !previous.live
            && current.live
    })
}

include!(concat!(env!("OUT_DIR"), "/session.rs"));
#[cfg_attr(
    test,
    allow(
        clippy::duplicate_mod,
        reason = "portable tests use the production session effects with in-memory IO"
    )
)]
#[path = "session_effects.rs"]
mod session_effects;
use session_effects::settings_response;
impl Session {
    fn tick(&mut self, args: &Args, pipe: &mut Pipe) -> io::Result<bool> {
        if let Some(confirmation) = &self.confirmation {
            confirmation.check_confirmation()?;
        }
        if args.controlled && crate::control_stdin::closed() && self.closing.is_none() {
            self.request_close(pipe, CloseReason::ControlEof)?;
        }
        self.current = self.core.status();
        if let Some((id, result)) = self.core.reply() {
            let result = self.service_reply(id, result);
            self.respond(
                pipe,
                id,
                result,
                crate::diagnostics::DiagnosticSection::Services,
            )?;
        }
        for tick in SCREEN_TICKS {
            tick(self, pipe)?;
        }
        if entered_live(self.last.as_ref(), &self.current) && self.closing.is_none() {
            self.request_close(pipe, CloseReason::Live)?;
        }
        if self.last.as_ref() != Some(&self.current)
            && self
                .last_event
                .is_none_or(|time| time.elapsed() >= Duration::from_millis(100))
        {
            self.last_event = Some(Instant::now());
            if self.subscriptions.contains(&Topic::Core) {
                self.send_core(pipe)?;
            }
            if self.subscriptions.contains(&Topic::SimStatus) {
                frame::write(
                    pipe,
                    &HostToUi::Event {
                        event: Event::SimStatus {
                            live: self.current.live,
                        },
                    },
                )?;
            }
            self.last = Some(self.current.clone());
        }
        Ok(self.closing.is_none_or(|(reason, time)| {
            !matches!(reason, CloseReason::ControlEof | CloseReason::Live)
                || time.elapsed() <= Duration::from_secs(2)
        }))
    }

    fn receive(&mut self, pipe: &mut Pipe, message: &UiToHost) -> io::Result<bool> {
        match message {
            UiToHost::Hello { version } => {
                if *version != protocol::VERSION {
                    frame::write(
                        pipe,
                        &HostToUi::Failure {
                            id: 0,
                            error: HostError::Incompatible {
                                expected: protocol::VERSION,
                                found: *version,
                            },
                        },
                    )?;
                    return Err(io::ErrorKind::InvalidData.into());
                }
                self.handshaken = true;
            }
            _ if !self.handshaken => return Err(io::ErrorKind::PermissionDenied.into()),
            UiToHost::Ready {} => {
                if let Some(confirmation) = &mut self.confirmation {
                    confirmation.publish()?;
                }
            }
            UiToHost::PickedExecutable(selection) => {
                self.picked_executable(pipe, selection.id, selection.path.as_deref())?;
            }
            UiToHost::Request { id, request } => self.request(pipe, *id, request)?,
            UiToHost::Subscribe { topic } => {
                self.subscriptions.insert(*topic);
                let (_, handler) = SCREEN_SUBSCRIPTIONS
                    .iter()
                    .find(|(accept, _)| accept(*topic))
                    .ok_or(io::ErrorKind::InvalidInput)?;
                handler(self, pipe, *topic)?;
            }
            UiToHost::Unsubscribe { topic } => {
                self.subscriptions.remove(topic);
            }
            UiToHost::CloseAnswer { allow: true } if self.closing.is_some() => {
                self.exit_code = if self
                    .closing
                    .is_some_and(|(reason, _)| reason == CloseReason::Restart)
                {
                    10
                } else {
                    0
                };
                return Ok(false);
            }
            UiToHost::CloseAnswer { allow: false }
                if self.closing.is_some_and(|(reason, _)| {
                    matches!(reason, CloseReason::Window | CloseReason::Restart)
                }) =>
            {
                self.closing = None;
            }
            UiToHost::CloseAnswer { .. } => {}
        }
        Ok(true)
    }
}
pub fn run(args: &Args) -> io::Result<u8> {
    let executable = std::env::current_exe()?;
    if !executable.file_name().is_some_and(|name| {
        name.to_string_lossy()
            .eq_ignore_ascii_case("vantare-hub.exe")
    }) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "prepare the QA host image first",
        ));
    }
    std::fs::create_dir_all(&args.data)?;
    let directory = executable.parent().ok_or(io::ErrorKind::InvalidInput)?;
    let token = vantare_services::random_id().map_err(io::Error::other)?;
    let name = format!(
        "vantare-hub-ui-{}",
        vantare_services::random_id().map_err(io::Error::other)?
    );
    let stop = Arc::new(Stop::new()?);
    let mut listener = Listener::new(&name, Arc::clone(&stop), Duration::from_millis(100))?;
    let pipe = listener.instance()?;
    let (mut child, ui) = spawn_ui(args, &executable, &name, &token)?;
    let Some((mut pipe, mut reader)) = accept_ui(
        args,
        &mut child,
        &ui,
        pipe,
        &stop,
        &token,
        crate::control_stdin::closed,
    )?
    else {
        return Ok(0);
    };
    #[cfg(feature = "qa-e2e")]
    qa_phase(args, "before-core-start")?;
    let core = Core::start(&args.pipe, directory)?;
    #[cfg(feature = "qa-e2e")]
    qa_phase(args, "before-settings-load")?;
    let settings = Settings::load(args);
    #[cfg(feature = "qa-e2e")]
    qa_phase(args, "settings-loaded")?;
    let mut session = Session::new(
        args,
        core,
        settings,
        ready::Ready::from_executable(&executable)?,
        crate::privacy::State::open(&args.data),
    );
    #[cfg(feature = "qa-e2e")]
    qa_phase(args, "before-hello")?;
    frame::write(&mut pipe, &protocol::hello(&session.settings.view())?)?;
    #[cfg(feature = "qa-e2e")]
    qa_phase(args, "hello-sent")?;
    while child.0.try_wait()?.is_none() && session.tick(args, &mut pipe)? {
        if let Some(message) = reader.next::<UiToHost>(&mut pipe)?
            && !session.receive(&mut pipe, &message)?
        {
            break;
        }
    }
    if child.0.try_wait()?.is_some_and(|status| !status.success()) {
        return Err(io::ErrorKind::BrokenPipe.into());
    }
    Ok(session.exit_code)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installed_ui_target_rejects_a_tampered_ui_before_it_can_be_spawned() {
        let (_owned, generation) = crate::integrity::tests::fixture();
        let executable = generation.join("bin/vantare-hub.exe");
        assert!(ui_target(&executable).is_ok());
        std::fs::write(generation.join("hub-ui/resources/app.asar"), b"modified").expect("tamper");
        assert!(ui_target(&executable).is_err());
    }
    #[test]
    fn live_requires_a_known_non_live_observation_before_the_transition() {
        let waiting = protocol::CoreStatus {
            rights: protocol::LinkState::Connected,
            ..protocol::CoreStatus::default()
        };
        let live = protocol::CoreStatus {
            live: true,
            ..waiting.clone()
        };
        assert!(entered_live(Some(&waiting), &live));
        assert!(!entered_live(None, &live));
        assert!(!entered_live(Some(&protocol::CoreStatus::default()), &live));
        assert!(!entered_live(Some(&live), &live));
        assert!(!entered_live(Some(&live), &waiting));
    }
    #[test]
    fn bootstrap_token_is_exact_and_never_accepted_by_kind_only() {
        let expected = "a".repeat(64);
        assert!(authenticated(
            &Authentication {
                kind: "authenticate".into(),
                token: expected.clone()
            },
            &expected
        ));
        for token in ["a".repeat(63), "b".repeat(64)] {
            assert!(!authenticated(
                &Authentication {
                    kind: "authenticate".into(),
                    token
                },
                &expected
            ));
        }
        assert!(!authenticated(
            &Authentication {
                kind: "ready".into(),
                token: expected.clone()
            },
            &expected
        ));
    }
}

#[cfg(test)]
#[path = "bridge_tests.rs"]
mod bridge_tests;

#[cfg(all(test, not(debug_assertions), not(feature = "qa-e2e")))]
#[test]
fn release_rejects_an_uninstalled_ui_target() {
    let result = ui_target(&std::env::current_exe().expect("image"));
    assert!(matches!(result,Err(error) if error.kind()==io::ErrorKind::PermissionDenied));
}
