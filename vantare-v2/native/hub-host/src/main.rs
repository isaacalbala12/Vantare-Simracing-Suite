#![cfg_attr(windows, windows_subsystem = "windows")]
fn main() -> std::process::ExitCode {
    #[cfg(windows)]
    let result = (|| {
        let executable = std::env::current_exe()?;
        if vantare_hub_host::ready::redirect_if_needed(&executable)? {
            return Ok(());
        }
        vantare_hub_host::args::Args::parse(std::env::args().skip(1))
            .and_then(|args| vantare_hub_host::ui_process::run(&args))
    })();
    #[cfg(not(windows))]
    let result: std::io::Result<()> = Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "Windows host",
    ));
    match result {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("Hub host failed: {:?}", error.kind());
            std::process::ExitCode::FAILURE
        }
    }
}
