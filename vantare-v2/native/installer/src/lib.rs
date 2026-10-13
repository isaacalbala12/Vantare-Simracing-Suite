#![forbid(unsafe_code)]
//! Setup transports the package; PowerShell retains ownership of generations and data.
pub mod args;
pub mod engine;
pub mod model;
pub mod payload;

pub const VERSION: &str = env!("VANTARE_INSTALLER_VERSION");
pub const QA: bool = cfg!(feature = "test-installer");

pub fn entry(uninstall: bool) -> u8 {
    let mut args = match args::Args::parse(std::env::args_os().skip(1), uninstall) {
        Ok(args) => args,
        Err(error) => {
            eprintln!("{error}");
            return 1;
        }
    };
    if args.version {
        println!("Vantare Installer {VERSION}");
        return 0;
    }
    if uninstall && args.root.is_none() {
        args.root = std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(std::path::Path::to_path_buf));
    }
    match engine::headless(&args) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("{error}");
            1
        }
    }
}
