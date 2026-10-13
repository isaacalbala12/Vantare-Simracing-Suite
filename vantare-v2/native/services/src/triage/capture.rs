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
        io::{Read, Write},
        os::windows::process::CommandExt,
        process::{Command, Stdio},
        time::{Duration, Instant},
    };
    // Static script receives no user strings and emits no diagnostic stderr.
    let mut child = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", "-"])
        .env("VANTARE_TRIAGE_SYSTEM", if system { "1" } else { "0" })
        .creation_flags(0x0800_0000)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| Error::Unsupported)?;
    let mut stdin = child.stdin.take().ok_or(Error::Offline)?;
    // -Command - terminates a multiline block on an empty line, not EOF.
    let sent = stdin
        .write_all(include_bytes!("capture.ps1"))
        .and_then(|()| stdin.write_all(b"\n"));
    drop(stdin);
    if sent.is_err() {
        let _ = child.kill();
        let _ = child.wait();
        return Err(Error::Offline);
    }
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if start.elapsed() < Duration::from_secs(8) => {
                std::thread::sleep(Duration::from_millis(20));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(Error::Offline);
            }
        }
    };
    if !status.success() {
        return Err(Error::Offline);
    }
    let mut bytes = Vec::new();
    child
        .stdout
        .take()
        .ok_or(Error::Offline)?
        .take(8193)
        .read_to_end(&mut bytes)
        .map_err(|_| Error::Offline)?;
    if bytes.len() > 8192 {
        return Err(Error::TooLarge);
    }
    serde_json::from_slice(&bytes).map_err(|_| Error::Protocol)
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
fn windows_capture_without_hardware_emits_the_typed_document() {
    let observed = capture(false).expect("typed Windows capture");
    assert_eq!(observed.system, serde_json::json!({}));
    assert!(matches!(observed.game.as_str(), "none" | "lmu" | "acc"));
}
