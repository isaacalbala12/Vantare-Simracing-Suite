#![cfg_attr(windows, windows_subsystem = "windows")]
#[cfg(windows)]
fn main() -> std::process::ExitCode {
    std::process::ExitCode::from(vantare_installer::entry(false))
}

#[cfg(not(windows))]
fn main() {}
