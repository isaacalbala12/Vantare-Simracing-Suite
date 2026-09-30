#![forbid(unsafe_code)]
use std::path::PathBuf;
use std::process::ExitCode;
use vantare_services::{
    config::BuildConfig,
    host::{self, Options},
    protocol::{Command, Reply},
};

fn run() -> vantare_services::Result<()> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 3 {
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
    host::serve(&options, |command| match command {
        Command::Status => Reply::Status {
            account_configured: config.native_account_configured(),
            message: "servicio no configurado".into(),
        },
        Command::Shutdown => Reply::Closed,
    })
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
