#![forbid(unsafe_code)]

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let controlled = match args.as_slice() {
        [] => false,
        [arg] if arg == "--control-stdin" => true,
        _ => {
            eprintln!("uso: vantare-hub [--control-stdin]");
            return ExitCode::from(2);
        }
    };
    match vantare_hub::shell::run(controlled) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("vantare-hub: {error}");
            ExitCode::FAILURE
        }
    }
}
