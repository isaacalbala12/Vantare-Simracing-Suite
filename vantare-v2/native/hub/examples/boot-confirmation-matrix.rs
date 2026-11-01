//! Test-only process using the Hub's actual boot confirmation, without GPUI.
//! The matrix copies this executable to a synthetic installed generation.
#[allow(dead_code)]
#[path = "../src/installation.rs"]
mod installation;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    use std::{io::BufRead, path::PathBuf, time::Instant};
    let root = PathBuf::from(
        std::env::args_os()
            .nth(1)
            .ok_or("explicit QA root required")?,
    );
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
    // Parent owns stdin. Stay alive so Confirm-BetaBoot observes a running app.
    let _ = std::io::stdin().lock().lines().next();
    Ok(())
}
