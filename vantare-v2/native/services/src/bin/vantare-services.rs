#![forbid(unsafe_code)]
use std::path::PathBuf;
use std::process::ExitCode;
use vantare_services::{
    app::App,
    config::BuildConfig,
    host::{self, Options},
};

fn run() -> vantare_services::Result<()> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 3 && args.len() != 4 {
        return Err(vantare_services::Error::Protocol);
    }
    let options = Options {
        pipe: args[0].clone(),
        parent_pid: args[1]
            .parse()
            .map_err(|_| vantare_services::Error::Protocol)?,
        parent_image: PathBuf::from(&args[2]),
    };
    let config = BuildConfig::load();
    let root = match args.get(3) {
        Some(root) => PathBuf::from(root),
        None => vantare_services::app::default_root()?,
    };
    let mut app = App::new(config, root);
    host::serve(&options, |command| app.handle(command))
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("vantare-services: {error}");
            ExitCode::FAILURE
        }
    }
}
