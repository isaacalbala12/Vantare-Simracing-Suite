//! Only whitelisted hardware fields and known process names; never paths/IDs.
#[cfg(windows)]
use crate::Error;
use crate::Result;
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Observed {
    pub system: serde_json::Value,
    pub game: String,
    pub game_version: Option<String>,
}
#[cfg(windows)]
pub(super) fn capture(system: bool) -> Result<Observed> {
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
    let sent = child
        .stdin
        .take()
        .ok_or(Error::Offline)?
        .write_all(include_bytes!("capture.ps1"));
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
    let result: Observed = serde_json::from_slice(&bytes).map_err(|_| Error::Protocol)?;
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
#[cfg(not(windows))]
pub(super) fn capture(include_system: bool) -> Result<Observed> {
    // No invented PC measurements on unsupported platforms.
    let system = if include_system {
        serde_json::json!({"os":{"name":std::env::consts::OS}})
    } else {
        serde_json::json!({})
    };
    Ok(Observed {
        system,
        game: "none".into(),
        game_version: None,
    })
}
