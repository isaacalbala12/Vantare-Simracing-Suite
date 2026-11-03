//! Test-only process using the Hub's actual boot confirmation, without GPUI.
//! The matrix copies this executable to a synthetic installed generation.
#![cfg_attr(windows, windows_subsystem = "windows")]
#[allow(dead_code)]
#[path = "../src/installation.rs"]
mod installation;

#[allow(clippy::too_many_lines)] // QA fixture owns both session and Hub process lifetimes.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use std::{
        io::BufRead,
        path::PathBuf,
        process::{Command, Stdio},
        time::Instant,
    };
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args
        .first()
        .is_some_and(|arg| arg == "--instancia" || arg == "--parar")
    {
        // Inert runtime boundary for Start-BetaHub/Run-BetaHub; never starts a service.
        return Ok(());
    }
    if args.first().is_some_and(|arg| arg == "--session") {
        if args.get(1).is_none_or(|arg| arg != "-Root") {
            return Err("session root flag required".into());
        }
        let root = PathBuf::from(args.get(2).ok_or("session root required")?);
        let prefix = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").ok_or("RUNNER_TEMP required")?)
        } else {
            PathBuf::from("D:/VantareServer/qa")
        };
        if !root.canonicalize()?.starts_with(prefix.canonicalize()?) {
            return Err("QA root rejected".into());
        }
        let mut token = std::env::var("VANTARE_BOOT_TOKEN")?;
        let wrong = std::env::var_os("VANTARE_QA_WRONG_BOOT_TOKEN").is_some();
        if wrong {
            token.replace_range(..1, if token.starts_with('0') { "1" } else { "0" });
        }
        let mut hub = Command::new(std::env::current_exe()?.with_file_name("vantare-hub.exe"))
            .arg(&root)
            .env("VANTARE_BOOT_TOKEN", token)
            .stdin(Stdio::piped())
            .spawn()?;
        let deadline = Instant::now() + std::time::Duration::from_mins(1);
        while !root.join("app-open").exists() {
            if hub.try_wait()?.is_some() || Instant::now() >= deadline {
                return Err("QA Hub did not open".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        if wrong {
            std::thread::sleep(std::time::Duration::from_millis(200));
            hub.kill()?;
            hub.wait()?;
            return Err("QA mismatched boot token".into());
        }
        while root.join("boot-pending.json").exists() {
            if Instant::now() >= deadline {
                return Err("root ACK timed out".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        while !root.join("confirmation-complete").exists() {
            if hub.try_wait()?.is_some() || Instant::now() >= deadline {
                return Err("QA Hub did not confirm".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        while !root.join("allow-exit").exists() {
            if Instant::now() >= deadline {
                return Err("root session exit timed out".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        drop(hub.stdin.take());
        hub.wait()?;
        return Ok(());
    }
    let root = if args.first().is_some_and(|arg| arg == "--pipe") {
        PathBuf::from(std::env::var_os("VANTARE_BETA_ROOT").ok_or("explicit QA root required")?)
    } else {
        PathBuf::from(args.first().ok_or("explicit QA root required")?)
    };
    let prefix = if std::env::var("CI").as_deref() == Ok("true") {
        PathBuf::from(std::env::var_os("RUNNER_TEMP").ok_or("RUNNER_TEMP required")?)
    } else {
        PathBuf::from("D:/VantareServer/qa")
    };
    if !root.canonicalize()?.starts_with(prefix.canonicalize()?) {
        return Err("QA root rejected".into());
    }
    // start() validates this executable's generation and publishes readiness.
    // In the real Hub this is called after creating its window (shell.rs).
    let mut confirmation = installation::BootConfirmation::start(&root)?;
    std::fs::write(root.join("app-open"), b"fixture window available")?;
    let deadline = Instant::now() + std::time::Duration::from_secs(50);
    while !confirmation.poll()? {
        if Instant::now() >= deadline {
            return Err("confirmation fixture timeout".into());
        }
        // Exercise the real 30s maintenance deadline, without a test-only clock
        // in product. Parent/child synchronize through readiness and ACK files.
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    std::fs::write(root.join("confirmation-complete"), b"confirmed")?;
    if root.join("run-stage-case").exists() {
        // File barrier also works when the launcher starts the process without a pipe.
        let deadline = Instant::now() + std::time::Duration::from_secs(90);
        while !root.join("allow-exit").exists() {
            if Instant::now() >= deadline {
                return Err("stage fixture timeout".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        return Ok(());
    }
    // Parent owns stdin. Stay alive until the launcher observes a running app.
    let _ = std::io::stdin().lock().lines().next();
    Ok(())
}
