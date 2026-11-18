#[cfg(windows)]
mod cli;

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    match cli::run(
        &args,
        |name| std::env::var_os(name),
        vantare_services::license::installation::legacy_fingerprint,
        || std::time::SystemTime::now().into(),
    ) {
        Ok(Some(public)) => println!("{public}"),
        Ok(None) => {}
        Err(error) => {
            eprintln!("vantare-qa-license: {error}");
            return std::process::ExitCode::FAILURE;
        }
    }
    std::process::ExitCode::SUCCESS
}

#[cfg(not(windows))]
fn main() -> std::process::ExitCode {
    eprintln!("vantare-qa-license: la huella legacy solo está disponible en Windows");
    std::process::ExitCode::FAILURE
}
