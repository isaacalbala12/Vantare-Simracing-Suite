#![cfg_attr(windows, windows_subsystem = "windows")]
fn main() -> std::process::ExitCode {
    std::process::ExitCode::from(vantare_installer::entry(true))
}
