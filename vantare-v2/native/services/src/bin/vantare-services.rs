#![forbid(unsafe_code)]
use std::path::PathBuf;
use std::process::ExitCode;
use vantare_services::{
    app::App,
    config::BuildConfig,
    host::{self, Options},
};

fn run() -> vantare_services::Result<()> {
    let mut args: Vec<_> = std::env::args().skip(1).collect();
    let managed = args.last().is_some_and(|arg| arg == "--managed");
    if managed {
        args.pop();
    }
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
    let bridge = config.data_bridge();
    let root = match args.get(3) {
        Some(root) => PathBuf::from(root),
        None => vantare_services::app::default_root()?,
    };
    let mut app = App::new(config, root);
    if let Some(bridge) = bridge {
        app.configure_bridge(bridge)?;
    }
    if managed {
        let core = vantare_ipc::control::read(&mut std::io::stdin())
            .map_err(|_| vantare_services::Error::Protocol)?;
        app.attach_core(core);
    }
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
