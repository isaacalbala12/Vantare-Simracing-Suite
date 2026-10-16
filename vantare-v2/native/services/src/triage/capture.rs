//! Only whitelisted hardware fields and known process names; never paths/IDs.
use crate::{Error, Result};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Observed {
    pub system: serde_json::Value,
    pub game: String,
    pub game_version: Option<String>,
}
#[cfg(windows)]
fn observe(system: bool) -> Result<Observed> {
    use std::{
        os::windows::process::CommandExt,
        process::Command,
        time::{Duration, Instant},
    };
    // Static script receives no user strings; stderr is discarded, never piped.
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoProfile", "-NonInteractive", "-Command", "-"])
        .env("VANTARE_TRIAGE_SYSTEM", if system { "1" } else { "0" })
        .creation_flags(0x0800_0000);
    let start = Instant::now();
    let bytes = run_process(
        &mut command,
        include_bytes!("capture.ps1"),
        Duration::from_secs(8),
        || start.elapsed(),
    )?;
    serde_json::from_slice(&bytes).map_err(|_| Error::Protocol)
}

#[cfg(any(windows, test))]
fn run_process(
    command: &mut std::process::Command,
    input: &[u8],
    timeout: std::time::Duration,
    mut elapsed: impl FnMut() -> std::time::Duration,
) -> Result<Vec<u8>> {
    use std::{io::Write, process::Stdio, thread::Builder};
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| Error::Unsupported)?;
    std::thread::scope(|scope| {
        let result = (|| {
            let stdout = child.stdout.take().ok_or(Error::Offline)?;
            let mut stdin = child.stdin.take().ok_or(Error::Offline)?;
            // Drain before waiting or writing: either pipe can fill independently.
            let output = Builder::new()
                .spawn_scoped(scope, move || read_output(stdout))
                .map_err(|_| Error::Offline)?;
            let sent = Builder::new()
                .spawn_scoped(scope, move || {
                    // -Command - terminates a multiline block on an empty line, not EOF.
                    stdin.write_all(input).and_then(|()| stdin.write_all(b"\n"))
                })
                .map_err(|_| Error::Offline)?;
            wait_for_exit(&mut child, timeout, &mut elapsed)?;
            sent.join()
                .map_err(|_| Error::Offline)?
                .map_err(|_| Error::Offline)?;
            output.join().map_err(|_| Error::Offline)?
        })();
        if result.is_err() {
            let _ = child.kill();
            let _ = child.wait();
        }
        // Scope joins both I/O workers, including after killing a timed-out child.
        result
    })
}

#[cfg(any(windows, test))]
fn wait_for_exit(
    child: &mut std::process::Child,
    timeout: std::time::Duration,
    elapsed: &mut impl FnMut() -> std::time::Duration,
) -> Result<()> {
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(None) if elapsed() < timeout => {
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            _ => return Err(Error::Offline),
        }
    }
}

#[cfg(any(windows, test))]
fn read_output(mut stdout: impl std::io::Read) -> Result<Vec<u8>> {
    use std::io::Read;
    let mut bytes = Vec::new();
    (&mut stdout)
        .take(8193)
        .read_to_end(&mut bytes)
        .map_err(|_| Error::Offline)?;
    // Bound retained memory, but keep draining so oversized output cannot block exit.
    std::io::copy(&mut stdout, &mut std::io::sink()).map_err(|_| Error::Offline)?;
    if bytes.len() > 8192 {
        return Err(Error::TooLarge);
    }
    Ok(bytes)
}
#[cfg(not(windows))]
fn observe(include_system: bool) -> Observed {
    // No invented PC measurements on unsupported platforms.
    let system = if include_system {
        serde_json::json!({"os":{"name":std::env::consts::OS}})
    } else {
        serde_json::json!({})
    };
    Observed {
        system,
        game: "none".into(),
        game_version: None,
    }
}

pub(super) fn capture(system: bool) -> Result<Observed> {
    #[cfg(windows)]
    let result = observe(system)?;
    #[cfg(not(windows))]
    let result = observe(system);
    validate(result)
}

fn validate(result: Observed) -> Result<Observed> {
    if !matches!(result.game.as_str(), "lmu" | "acc" | "none")
        || serde_json::to_vec(&result.system)
            .map_err(|_| Error::Protocol)?
            .len()
            > 4096
        || result
            .game_version
            .as_ref()
            .is_some_and(|v| v.chars().count() > 120)
    {
        return Err(Error::Protocol);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn value() -> Observed {
        Observed {
            system: serde_json::json!({}),
            game: "none".into(),
            game_version: None,
        }
    }
    #[test]
    fn capture_contract_rejects_unknown_games_and_oversized_context_on_every_platform() {
        assert!(validate(value()).is_ok());
        let mut unknown = value();
        unknown.game = "private-process".into();
        assert!(matches!(validate(unknown), Err(Error::Protocol)));
        let mut large = value();
        large.system = serde_json::json!({"os":{"name":"x".repeat(4096)}});
        assert!(matches!(validate(large), Err(Error::Protocol)));
        let mut version = value();
        version.game_version = Some("x".repeat(121));
        assert!(matches!(validate(version), Err(Error::Protocol)));
    }
}

#[cfg(all(test, windows))]
#[test]
#[ignore = "integration: runs real PowerShell; execute explicitly on Windows"]
fn windows_capture_without_hardware_emits_the_typed_document() {
    let observed = capture(false).expect("typed Windows capture");
    assert_eq!(observed.system, serde_json::json!({}));
    assert!(matches!(observed.game.as_str(), "none" | "lmu" | "acc"));
}

#[cfg(test)]
mod process_tests {
    use super::*;
    use std::{
        io::{Read, Write},
        process::Command,
        time::{Duration, Instant},
    };

    #[test]
    #[ignore = "subprocess fixture, invoked explicitly by process tests"]
    fn process_fixture() {
        let Ok(mode) = std::env::var("VANTARE_TRIAGE_PROCESS_FIXTURE") else {
            return;
        };
        if mode == "blocked" {
            // No input is consumed: timeout must release a blocked stdin writer.
            loop {
                std::thread::park();
            }
        }
        if mode == "large" {
            std::io::stderr()
                .write_all(&vec![b'e'; 1024 * 1024])
                .expect("stderr");
            std::io::stdout()
                .write_all(&vec![b'x'; 1024 * 1024])
                .expect("stdout");
        }
        let mut input = Vec::new();
        std::io::stdin().read_to_end(&mut input).expect("stdin");
        if mode == "success" {
            assert_eq!(input, b"synthetic\n");
            std::io::stdout()
                .write_all(b"triage-fixture-success")
                .expect("stdout");
        }
    }

    fn fixture(mode: &str) -> Command {
        let mut command = Command::new(std::env::current_exe().expect("test executable"));
        command
            .args([
                "--exact",
                "triage::capture::process_tests::process_fixture",
                "--nocapture",
                "--ignored",
            ])
            .env("VANTARE_TRIAGE_PROCESS_FIXTURE", mode);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        command
    }

    #[test]
    fn output_larger_than_pipe_capacity_is_drained_and_rejected() {
        // Real pipe regression: the old wait-before-read exhausts this deadline.
        // A generous test-only deadline tolerates scheduling under CPU load.
        for input in [Vec::new(), vec![b'i'; 1024 * 1024]] {
            let start = Instant::now();
            assert!(matches!(
                run_process(
                    &mut fixture("large"),
                    &input,
                    Duration::from_secs(30),
                    || start.elapsed()
                ),
                Err(Error::TooLarge)
            ));
        }
    }

    #[test]
    fn injected_deadline_kills_child_and_joins_blocked_io() {
        let deadline = Duration::from_secs(1);
        assert!(matches!(
            run_process(
                &mut fixture("blocked"),
                &vec![b'i'; 1024 * 1024],
                deadline,
                || deadline
            ),
            Err(Error::Offline)
        ));
    }

    #[test]
    fn successful_process_receives_complete_input_and_returns_output() {
        let start = Instant::now();
        let bytes = run_process(
            &mut fixture("success"),
            b"synthetic",
            Duration::from_secs(30),
            || start.elapsed(),
        )
        .expect("successful process");
        assert!(
            String::from_utf8(bytes)
                .expect("UTF-8")
                .contains("triage-fixture-success")
        );
    }
}
