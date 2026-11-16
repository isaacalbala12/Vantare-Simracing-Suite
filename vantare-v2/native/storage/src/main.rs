#![cfg_attr(windows, windows_subsystem = "windows")]
use std::io;
use std::io::Write;

use vantare_ipc::product;

use std::path::PathBuf;

fn main() {
    if product::print_version() {
        return;
    }
    vantare_services::diagnostics::install_panic_hook("vantare-storage");
    if let Err(error) = execute() {
        let _written = writeln!(std::io::stderr(), "almacenamiento: {error}");
        std::process::exit(1);
    }
}

fn execute() -> vantare_storage::Result<()> {
    let mut args = std::env::args_os().skip(1);
    let path = PathBuf::from(args.next().ok_or("falta ruta de DB")?);
    use vantare_storage::OpenMode;
    let argument = args.next();
    let mode = match argument.as_deref() {
        None => OpenMode::Legacy,
        Some(value) if value == "--read-only" => OpenMode::ReadOnly,
        Some(value) if value == "--create" => OpenMode::Create,
        Some(value) if value == "--resume" => OpenMode::Resume,
        _ => return Err("uso: vantare-storage <DB> [--read-only|--create|--resume]".into()),
    };
    if args.next().is_some() {
        return Err("solo se admite un modo de apertura".into());
    }
    vantare_storage::serve_mode(&path, mode, io::stdin().lock(), io::stdout().lock())
}
