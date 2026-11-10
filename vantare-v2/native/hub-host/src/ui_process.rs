use crate::{
    args::Args,
    core::Core,
    frame,
    protocol::{self, CloseReason, Event, HostError, HostToUi, Reply, Request, Topic, UiToHost},
    ready,
};
use serde::Deserialize;
use std::{
    io,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Arc,
    time::{Duration, Instant},
};
use vantare_ipc::transport::{Event as Stop, Listener, Pipe};
struct UiChild(Child);
impl Drop for UiChild {
    fn drop(&mut self) {
        // Let Electron finish its close ACK and normal cache cleanup; then reap even a stuck child.
        let deadline = Instant::now() + Duration::from_millis(250);
        while matches!(self.0.try_wait(), Ok(None)) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        let _killed = self.0.kill();
        let _waited = self.0.wait();
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
fn spawn_ui(
    args: &Args,
    executable: &Path,
    name: &str,
    token: &str,
) -> io::Result<(UiChild, PathBuf)> {
    let development = ready::generation(executable).is_none()
        && std::env::var("VANTARE_HUB_UI").as_deref() == Ok("dev");
    let web = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../hub-web");
    let ui = if let Some(generation) = ready::generation(executable) {
        generation.join("hub-ui/vantare-hub-ui.exe")
    } else if development {
        web.join("node_modules/electron/dist/electron.exe")
    } else {
        PathBuf::from(std::env::var_os("VANTARE_HUB_UI").ok_or(io::ErrorKind::NotFound)?)
    };
    let ui = std::fs::canonicalize(ui)?;
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
    if development {
        command.arg(web);
    }
    command
        .env("VANTARE_HUB_PIPE", name)
        .env("VANTARE_HUB_TOKEN", token)
        .env("VANTARE_HUB_DATA_DIR", &args.data)
        .stdin(Stdio::null())
        .stdout(Stdio::null());
    #[cfg(feature = "qa-e2e")]
    {
        command
            .args([
                "--remote-debugging-port=0",
                "--remote-debugging-address=127.0.0.1",
            ])
            .stderr(std::fs::File::create(args.data.join("hub-ui-qa.log"))?);
    }
    #[cfg(not(feature = "qa-e2e"))]
    command.stderr(Stdio::null());
    Ok((UiChild(command.spawn()?), ui))
}
fn accept_ui(
    args: &Args,
    child: &mut UiChild,
    ui: &Path,
    mut pipe: Pipe,
    stop: &Arc<Stop>,
    token: &str,
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
        if args.controlled && crate::control_stdin::closed() {
            cancelled = Some(io::ErrorKind::ConnectionAborted);
            break;
        }
        match child.0.try_wait() {
            Ok(None) => {}
            Ok(Some(status)) => {
                cancelled = Some(if status.success() {
                    io::ErrorKind::ConnectionAborted
                } else {
                    io::ErrorKind::BrokenPipe
                });
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
        if args.controlled && crate::control_stdin::closed() {
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
struct Session {
    core: Core,
    confirmation: Option<ready::Ready>,
    current: protocol::CoreStatus,
    last: Option<protocol::CoreStatus>,
    last_event: Option<Instant>,
    closing: Option<(CloseReason, Instant)>,
    subscribed: bool,
    sim_subscribed: bool,
    handshaken: bool,
}
impl Session {
    fn request_close(&mut self, pipe: &mut Pipe, reason: CloseReason) -> io::Result<()> {
        self.closing = Some((reason, Instant::now()));
        frame::write(pipe, &HostToUi::CloseRequested { reason })
    }
    fn send_core(&self, pipe: &mut Pipe) -> io::Result<()> {
        frame::write(
            pipe,
            &HostToUi::Event {
                event: Event::Core {
                    value: self.current.clone(),
                },
            },
        )
    }
    fn tick(&mut self, args: &Args, pipe: &mut Pipe) -> io::Result<bool> {
        if let Some(confirmation) = &self.confirmation {
            confirmation.check_confirmation()?;
        }
        if args.controlled && crate::control_stdin::closed() && self.closing.is_none() {
            self.request_close(pipe, CloseReason::ControlEof)?;
        }
        self.current = self.core.status();
        if entered_live(self.last.as_ref(), &self.current) && self.closing.is_none() {
            self.request_close(pipe, CloseReason::Live)?;
        }
        if self.last.as_ref() != Some(&self.current)
            && self
                .last_event
                .is_none_or(|time| time.elapsed() >= Duration::from_millis(100))
        {
            self.last_event = Some(Instant::now());
            if self.subscribed {
                self.send_core(pipe)?;
            }
            if self.sim_subscribed {
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
            reason != CloseReason::ControlEof || time.elapsed() <= Duration::from_secs(2)
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
            UiToHost::Request {
                id,
                request: Request::CoreGet {},
            } => frame::write(
                pipe,
                &HostToUi::Response {
                    id: *id,
                    result: Reply::Core {
                        value: self.current.clone(),
                    },
                },
            )?,
            UiToHost::Request {
                request: Request::WindowClose {},
                ..
            } => self.request_close(pipe, CloseReason::Window)?,
            UiToHost::Subscribe { topic: Topic::Core } => {
                self.subscribed = true;
                self.send_core(pipe)?;
            }
            UiToHost::Subscribe {
                topic: Topic::SimStatus,
            } => {
                self.sim_subscribed = true;
                frame::write(
                    pipe,
                    &HostToUi::Event {
                        event: Event::SimStatus {
                            live: self.current.live,
                        },
                    },
                )?;
            }
            UiToHost::Unsubscribe { topic: Topic::Core } => self.subscribed = false,
            UiToHost::Unsubscribe {
                topic: Topic::SimStatus,
            } => self.sim_subscribed = false,
            UiToHost::CloseAnswer { allow: true } if self.closing.is_some() => return Ok(false),
            UiToHost::CloseAnswer { allow: false }
                if self
                    .closing
                    .is_some_and(|(reason, _)| reason != CloseReason::ControlEof) =>
            {
                self.closing = None;
            }
            UiToHost::CloseAnswer { .. } => {}
        }
        Ok(true)
    }
}
pub fn run(args: &Args) -> io::Result<()> {
    let executable = std::env::current_exe()?;
    if ready::redirect_if_needed(&executable)? {
        return Ok(());
    }
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
    let Some((mut pipe, mut reader)) = accept_ui(args, &mut child, &ui, pipe, &stop, &token)?
    else {
        return Ok(());
    };
    let mut session = Session {
        core: Core::start(&args.pipe, directory)?,
        confirmation: ready::Ready::from_executable(&executable)?,
        current: protocol::CoreStatus::default(),
        last: None,
        last_event: None,
        closing: None,
        subscribed: false,
        sim_subscribed: false,
        handshaken: false,
    };
    frame::write(&mut pipe, &protocol::hello())?;
    while child.0.try_wait()?.is_none() && session.tick(args, &mut pipe)? {
        if let Some(message) = reader.next::<UiToHost>(&mut pipe)?
            && !session.receive(&mut pipe, &message)?
        {
            break;
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
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
